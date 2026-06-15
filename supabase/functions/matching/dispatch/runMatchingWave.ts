/**
 * Run Matching Wave
 *
 * Core dispatch logic: finds candidates, ranks them, emits offers.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadAvailableDriverLocations } from "../supply/loadLocations.ts";
import { buildCandidatePool, rotateCandidates, type Candidate } from "./candidatePool.ts";
import { insertDriverOfferRow, getExcludedDriverIds } from "./offerWrites.ts";
import {
  loadMatchingPolicy,
  getWaveRadiusKm,
  driverLocationMaxAgeMs,
  isSerialDispatchEnabled,
  type ResolvedPolicy,
} from "../policy/loadPolicy.ts";
import { rankDriversByDriveTime } from "../../rides/fare/distanceMatrix.ts";
import {
  allowedBodySlugsForWave,
  loadServiceBodyTypeTiers,
} from "../../rides/fare/serviceMatching.ts";
import { getRidesAdminDb } from "../../_shared/ridesAdminDb.ts";

export interface RideSnapshot {
  id: string;
  pickup_lat: number;
  pickup_lng: number;
  vehicle_option: string;
  rider_user_id: string;
  driver_offer_timeout_seconds?: number;
  assigned_driver_user_id?: string | null;
  matching_wave?: number;
}

export interface RunWaveResult {
  ok: boolean;
  wave: number;
  candidates_found: number;
  offers_created: number;
  supply_source: "h3" | "legacy";
  error?: string;
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "matching", ts: new Date().toISOString(), ...payload }));
}

async function patchRideRequest(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError && rpcData != null) return true;

  const { data: directRow, error: directError } = await svc()
    .from("ride_requests")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (!directError && directRow) return true;

  logLine({
    event: "patch_ride_failed",
    ride_id: id,
    error: directError?.message,
    rpc_error: rpcError?.message,
  });
  return false;
}

async function audit(
  rideId: string,
  actorUserId: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await svc()
    .from("audit_events")
    .insert({
      ride_request_id: rideId,
      actor_user_id: actorUserId ?? null,
      event_type: eventType,
      payload,
    });
}

/**
 * Run a single matching wave for a ride.
 */
export async function runMatchingWave(
  rideId: string,
  ride: RideSnapshot,
  wave: number,
  policy: ResolvedPolicy,
  requestId?: string,
): Promise<RunWaveResult> {
  const radiusKm = getWaveRadiusKm(policy, wave);
  const pickupLat = ride.pickup_lat;
  const pickupLng = ride.pickup_lng;
  const timeoutSec = ride.driver_offer_timeout_seconds ?? policy.default_driver_offer_timeout_seconds;

  const freshSince = new Date(Date.now() - driverLocationMaxAgeMs(policy)).toISOString();
  const locations = await loadAvailableDriverLocations(freshSince);

  const serviceSlug = (ride.vehicle_option ?? "").trim().toLowerCase();
  let allowedBodySlugs = new Set<string>();
  let tiersCount = 0;

  if (serviceSlug && policy.body_type_filtering_enabled) {
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      const tiers = await loadServiceBodyTypeTiers(adminDb, tables, serviceSlug);
      tiersCount = tiers.length;
      if (tiersCount > 0) {
        allowedBodySlugs = allowedBodySlugsForWave(tiers, wave, policy.body_type_tier_mode);
      }
    } catch {
      allowedBodySlugs = new Set();
    }
  }

  const excludedIds = await getExcludedDriverIds(rideId);
  if (ride.assigned_driver_user_id) {
    excludedIds.add(String(ride.assigned_driver_user_id));
  }

  const { candidates, stats } = await buildCandidatePool(
    locations,
    pickupLat,
    pickupLng,
    radiusKm,
    excludedIds,
    policy,
    allowedBodySlugs,
    tiersCount,
  );

  logLine({
    event: "match_wave_diag",
    ride_id: rideId,
    wave,
    radius_km: radiusKm,
    loc_rows: stats.total_locations,
    eligible_drivers: stats.eligible_count,
    candidates: stats.in_radius,
    filtered_body_type: stats.filtered_body_type,
    service_slug: serviceSlug,
    tiers_count: tiersCount,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    request_id: requestId ?? null,
    fresh_since: freshSince,
    ...(stats.total_locations === 0
      ? {
          hint: "No fresh driver_locations with available_for_rides=true",
        }
      : {}),
  });

  const { ranked, source: matchingRouteSource } = await rankDriversByDriveTime(
    { lat: pickupLat, lng: pickupLng },
    candidates.map((c) => ({
      user_id: c.user_id,
      lat: c.lat,
      lng: c.lng,
      haversineKm: c.haversineKm,
    })),
  );

  const rankedCandidates: Candidate[] = ranked.map((r) => ({
    user_id: r.user_id,
    lat: r.lat,
    lng: r.lng,
    haversineKm: r.haversineKm,
    body_type_slug: null,
  }));

  const rotated = rotateCandidates(rankedCandidates, wave);

  const maxOffers = isSerialDispatchEnabled(policy)
    ? 1
    : policy.max_offers_per_wave;
  const picked = rotated.slice(0, maxOffers);

  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

  const patchOk = await patchRideRequest(rideId, {
    matching_wave: wave,
    updated_at: new Date().toISOString(),
  });

  if (!patchOk) {
    logLine({
      event: "match_wave_aborted_patch_failed",
      ride_id: rideId,
      wave,
      picked: picked.length,
      request_id: requestId ?? null,
    });
    return {
      ok: false,
      wave,
      candidates_found: candidates.length,
      offers_created: 0,
      supply_source: "legacy",
      error: "patch_failed",
    };
  }

  let offersInserted = 0;
  let lastOfferErr: string | undefined;

  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const ins = await insertDriverOfferRow({
      ride_request_id: rideId,
      driver_user_id: c.user_id,
      wave,
      rank_score: i + 1,
      distance_km: c.haversineKm,
      status: "pending",
      expires_at: expiresAt,
    });
    if (ins.ok) offersInserted += 1;
    else lastOfferErr = ins.error;
  }

  if (picked.length > 0 && offersInserted === 0) {
    logLine({
      event: "match_wave_zero_offers_inserted",
      ride_id: rideId,
      wave,
      attempted: picked.length,
      last_error: lastOfferErr ?? "unknown",
      request_id: requestId ?? null,
    });
  }

  try {
    await audit(rideId, ride.rider_user_id, "matching_wave", {
      wave,
      radius_km: radiusKm,
      offers: picked.length,
      offers_inserted: offersInserted,
      matching_route_source: matchingRouteSource,
      service_slug: serviceSlug,
      allowed_body_types: [...allowedBodySlugs],
      filtered_out_body_type: stats.filtered_body_type,
      serial_dispatch: isSerialDispatchEnabled(policy),
    });
  } catch (e: unknown) {
    logLine({
      event: "audit_matching_wave_failed",
      ride_id: rideId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  logLine({
    event: "matching_wave",
    ride_id: rideId,
    wave,
    offers: picked.length,
    offers_inserted: offersInserted,
    request_id: requestId ?? null,
  });

  return {
    ok: true,
    wave,
    candidates_found: candidates.length,
    offers_created: offersInserted,
    supply_source: "legacy",
  };
}
