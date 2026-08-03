/**
 * Enterprise logistics marketplace matching (Phase C).
 * Supply v1: org-affiliated fleet drivers (driver_profiles.fleet_id = job.org)
 * who are online in rides.driver_locations. Future: expand to independent Roam drivers.
 *
 * Persists offers in logistics.job_offers — never rides.driver_offers / ride_requests.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAvailableDriverLocations } from "../matching/supply/loadLocations.ts";
import { buildCandidatePool, rotateCandidates, type Candidate } from "../matching/dispatch/candidatePool.ts";
import {
  loadMatchingPolicy,
  getWaveRadiusKm,
  driverLocationMaxAgeMs,
  isSerialDispatchEnabled,
  type ResolvedPolicy,
} from "../matching/policy/loadPolicy.ts";
import { appendJobEvent } from "./syncFromShipment.ts";

export interface EnterpriseMatchResult {
  ok: boolean;
  status: string;
  wave: number;
  pending_offers: number;
  offers_created?: number;
  action_taken?: "wave_advanced" | "cancelled" | "assigned" | "started" | "none" | "no_supply";
  error?: string;
}

function pub(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function logisticsDb() {
  return pub().schema("logistics");
}

function matchingDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "logistics-match", ts: new Date().toISOString(), ...payload }));
}

async function loadPolicy(): Promise<ResolvedPolicy> {
  // Public client: matching_* views live on public; brain policies when enabled
  const policy = await loadMatchingPolicy(matchingDb(), "enterprise", "default");
  // Org-fleet supply must include fleet-mode drivers (not independent-only)
  return {
    ...policy,
    independent_only_matching: false,
    body_type_filtering_enabled: false,
  };
}


/** Online drivers affiliated with the Enterprise org (fleet_id). */
export async function loadOrgFleetDriverLocations(
  organizationId: string,
  freshSince: string,
): Promise<{ user_id: string; lat: number; lng: number; updated_at: string; body_type_slug: string | null }[]> {
  const locations = await loadAvailableDriverLocations(freshSince);
  if (locations.length === 0) return [];

  const { data: profiles, error } = await pub()
    .from("driver_profiles")
    .select("user_id")
    .eq("fleet_id", organizationId)
    .eq("status", "active");

  if (error) {
    logLine({ event: "org_fleet_profiles_failed", error: error.message, organizationId });
    return [];
  }

  const allowed = new Set((profiles ?? []).map((p) => String(p.user_id)));
  return locations.filter((l) => allowed.has(l.user_id));
}

async function getExcludedDriverIds(jobId: string): Promise<Set<string>> {
  const { data } = await logisticsDb()
    .from("job_offers")
    .select("driver_user_id")
    .eq("job_id", jobId)
    .in("status", ["pending", "declined", "accepted", "expired", "superseded"]);
  return new Set((data ?? []).map((r) => String(r.driver_user_id)));
}

async function expirePendingOffers(jobId: string, nowIso: string) {
  await logisticsDb()
    .from("job_offers")
    .update({ status: "expired" })
    .eq("job_id", jobId)
    .eq("status", "pending")
    .lte("expires_at", nowIso);
}

async function countPendingOffers(jobId: string): Promise<number> {
  const { count } = await logisticsDb()
    .from("job_offers")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "pending");
  return count ?? 0;
}

async function runWave(
  job: Record<string, unknown>,
  wave: number,
  policy: ResolvedPolicy,
): Promise<{ offers_created: number; candidates: number }> {
  const jobId = String(job.id);
  const orgId = String(job.organization_id);
  const pickupLat = Number(job.pickup_lat);
  const pickupLng = Number(job.pickup_lng);
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    logLine({ event: "wave_no_pickup_geo", job_id: jobId });
    return { offers_created: 0, candidates: 0 };
  }

  const radiusKm = getWaveRadiusKm(policy, wave);
  const timeoutSec = policy.default_driver_offer_timeout_seconds;
  const freshSince = new Date(Date.now() - driverLocationMaxAgeMs(policy)).toISOString();

  const [locations, excludedIds] = await Promise.all([
    loadOrgFleetDriverLocations(orgId, freshSince),
    getExcludedDriverIds(jobId),
  ]);

  // No body-type filtering for enterprise freight v1
  const { candidates, stats } = await buildCandidatePool(
    locations,
    pickupLat,
    pickupLng,
    radiusKm,
    excludedIds,
    policy,
    new Set(),
    0,
  );

  const ranked: Candidate[] = candidates
    .slice()
    .sort((a, b) => a.haversineKm - b.haversineKm);

  const rotated = rotateCandidates(ranked, wave);
  const maxOffers = isSerialDispatchEnabled(policy) ? 1 : policy.max_offers_per_wave;
  const picked = rotated.slice(0, maxOffers);
  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();
  const now = new Date().toISOString();

  await logisticsDb()
    .from("jobs")
    .update({ matching_wave: wave, updated_at: now })
    .eq("id", jobId);

  let offersCreated = 0;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const { error } = await logisticsDb().from("job_offers").insert({
      organization_id: orgId,
      job_id: jobId,
      driver_user_id: c.user_id,
      status: "pending",
      wave,
      rank_score: i + 1,
      distance_km: c.haversineKm,
      expires_at: expiresAt,
    });
    if (!error) offersCreated += 1;
    else if (error.code !== "23505") {
      logLine({ event: "offer_insert_failed", job_id: jobId, error: error.message });
    }
  }

  logLine({
    event: "enterprise_wave",
    job_id: jobId,
    wave,
    radius_km: radiusKm,
    loc_rows: stats.total_locations,
    candidates: stats.in_radius,
    offers_created: offersCreated,
  });

  return { offers_created: offersCreated, candidates: candidates.length };
}

/** Begin marketplace matching for an unassigned/open job. */
export async function startEnterpriseJobMatching(
  jobId: string,
  actorUserId?: string | null,
): Promise<EnterpriseMatchResult> {
  const policy = await loadPolicy();
  const { data: job, error } = await logisticsDb()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) {
    return { ok: false, status: "missing", wave: 0, pending_offers: 0, error: "job_not_found" };
  }
  if (job.status === "assigned" || job.status === "in_progress" || job.status === "completed") {
    return {
      ok: true,
      status: job.status,
      wave: job.matching_wave ?? 0,
      pending_offers: 0,
      action_taken: "assigned",
    };
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await logisticsDb()
    .from("jobs")
    .update({
      status: "matching",
      assignee_type: "roam_marketplace",
      assignee_driver_id: null,
      assignee_vehicle_id: null,
      client_fleet_asset_id: null,
      third_party_carrier_id: null,
      matching_wave: 0,
      matching_started_at: now,
      assigned_at: null,
      updated_at: now,
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (upErr || !updated) {
    return { ok: false, status: job.status, wave: 0, pending_offers: 0, error: upErr?.message };
  }

  await appendJobEvent(pub(), {
    orgId: String(job.organization_id),
    jobId,
    eventType: "marketplace_matching_started",
    fromStatus: job.status,
    toStatus: "matching",
    actorUserId,
    idempotencyKey: `match-start:${jobId}:${now.slice(0, 16)}`,
  });

  const wave = await runWave(updated, 1, policy);
  const pending = await countPendingOffers(jobId);

  return {
    ok: true,
    status: "matching",
    wave: 1,
    pending_offers: pending,
    offers_created: wave.offers_created,
    action_taken: wave.offers_created > 0 ? "started" : "no_supply",
  };
}

export async function reconcileEnterpriseJob(jobId: string): Promise<EnterpriseMatchResult> {
  const policy = await loadPolicy();
  const nowIso = new Date().toISOString();
  await expirePendingOffers(jobId, nowIso);

  const { data: job, error } = await logisticsDb()
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) {
    return { ok: false, status: "missing", wave: 0, pending_offers: 0, error: "job_not_found" };
  }
  if (job.status !== "matching") {
    return {
      ok: true,
      status: job.status,
      wave: job.matching_wave ?? 0,
      pending_offers: 0,
      action_taken: "none",
    };
  }

  const pending = await countPendingOffers(jobId);
  if (pending > 0) {
    return {
      ok: true,
      status: "matching",
      wave: job.matching_wave ?? 0,
      pending_offers: pending,
      action_taken: "none",
    };
  }

  const currentWave = Number(job.matching_wave ?? 0);
  const maxWaves = policy.max_match_waves ?? 3;
  const startedAt = job.matching_started_at
    ? new Date(String(job.matching_started_at)).getTime()
    : Date.now();
  const maxMs = (policy.max_matching_duration_minutes ?? 5) * 60_000;
  const timedOut = Date.now() - startedAt > maxMs;

  if (timedOut || currentWave >= maxWaves) {
    await logisticsDb()
      .from("jobs")
      .update({
        status: "unassigned",
        assignee_type: null,
        matching_wave: 0,
        updated_at: nowIso,
      })
      .eq("id", jobId);
    await appendJobEvent(pub(), {
      orgId: String(job.organization_id),
      jobId,
      eventType: "marketplace_matching_exhausted",
      fromStatus: "matching",
      toStatus: "unassigned",
      note: timedOut ? "Matching timed out" : "No drivers accepted",
      idempotencyKey: `match-exhaust:${jobId}:${currentWave}`,
    });
    return {
      ok: true,
      status: "unassigned",
      wave: currentWave,
      pending_offers: 0,
      action_taken: "cancelled",
    };
  }

  const nextWave = currentWave + 1;
  const result = await runWave(job, nextWave, policy);
  const pendingAfter = await countPendingOffers(jobId);
  return {
    ok: true,
    status: "matching",
    wave: nextWave,
    pending_offers: pendingAfter,
    offers_created: result.offers_created,
    action_taken: "wave_advanced",
  };
}

export async function acceptEnterpriseJobOffer(
  offerId: string,
  driverUserId: string,
): Promise<{ ok: boolean; job_id?: string; error?: string; status?: string }> {
  const { data, error } = await pub().rpc("logistics_accept_job_offer", {
    p_offer_id: offerId,
    p_driver_user_id: driverUserId,
  });
  if (error) {
    logLine({ event: "accept_rpc_failed", error: error.message, offer_id: offerId });
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: Boolean(row?.ok),
    job_id: row?.job_id ? String(row.job_id) : undefined,
    error: row?.error ? String(row.error) : undefined,
    status: row?.status ? String(row.status) : undefined,
  };
}

export async function declineEnterpriseJobOffer(
  offerId: string,
  driverUserId: string,
): Promise<EnterpriseMatchResult & { declined?: boolean }> {
  const { data: offer, error } = await logisticsDb()
    .from("job_offers")
    .select("*")
    .eq("id", offerId)
    .eq("driver_user_id", driverUserId)
    .maybeSingle();
  if (error || !offer) {
    return {
      ok: false,
      status: "missing",
      wave: 0,
      pending_offers: 0,
      error: "offer_not_found",
      declined: false,
    };
  }
  if (offer.status !== "pending") {
    return {
      ok: true,
      status: offer.status,
      wave: offer.wave,
      pending_offers: 0,
      action_taken: "none",
      declined: false,
    };
  }

  await logisticsDb()
    .from("job_offers")
    .update({ status: "declined" })
    .eq("id", offerId);

  const reconciled = await reconcileEnterpriseJob(String(offer.job_id));
  return { ...reconciled, declined: true };
}

/** Cron helper: reconcile all jobs currently matching. */
export async function reconcileAllEnterpriseMatchingJobs(limit = 50): Promise<number> {
  const { data: jobs } = await logisticsDb()
    .from("jobs")
    .select("id")
    .eq("status", "matching")
    .order("updated_at", { ascending: true })
    .limit(limit);
  let n = 0;
  for (const j of jobs ?? []) {
    await reconcileEnterpriseJob(String(j.id));
    n += 1;
  }
  return n;
}
