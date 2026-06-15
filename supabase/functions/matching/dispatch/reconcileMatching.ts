/**
 * Reconcile Matching State
 *
 * Called on:
 * - Rider poll (GET /requests/:id)
 * - Driver decline
 * - Cron job
 *
 * Advances waves, cancels stale matching, handles book-for-others special case.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  expirePendingOffersForRide,
  loadDriverOffersForRide,
  supersedePendingOffersForRide,
} from "./offerWrites.ts";
import { runMatchingWave, type RideSnapshot } from "./runMatchingWave.ts";
import {
  loadMatchingPolicy,
  isSerialDispatchEnabled,
  type ResolvedPolicy,
} from "../policy/loadPolicy.ts";
import { isMatchingTimedOut } from "../../rides/fare/matchingHygiene.ts";
import { isBookForOthersPersistedRide } from "../../rides/rideAccess.ts";
import { buildCandidatePool, hasUnofferedCandidates, type Candidate } from "./candidatePool.ts";
import { loadAvailableDriverLocations } from "../supply/loadLocations.ts";
import { getWaveRadiusKm, driverLocationMaxAgeMs } from "../policy/loadPolicy.ts";
import { gridCellKey } from "../../rides/fare/buildQuote.ts";

export interface ReconcileResult {
  ok: boolean;
  status: string;
  wave: number;
  pending_offers: number;
  action_taken?: "wave_advanced" | "cancelled" | "assigned" | "none";
  error?: string;
}

const RECONCILE_WAVE_LOOP_CAP = 8;

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

async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc()
    .from("ride_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!nativeErr && native) return native as Record<string, unknown>;

  const { data: pub } = await pubSvc()
    .from("rides_ride_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return (pub as Record<string, unknown> | null) ?? null;
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

  return !directError && directRow != null;
}

async function audit(
  rideId: string | null,
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

async function bumpSurgeDemand(cellKey: string, delta: number) {
  const db = svc();
  const { data: row } = await db.from("surge_cells").select("*").eq("cell_key", cellKey).maybeSingle();

  if (!row) {
    if (delta <= 0) return;
    await db.from("surge_cells").insert({
      cell_key: cellKey,
      open_requests: Math.max(0, delta),
      surge_multiplier: 1,
    });
    return;
  }

  const next = Math.max(0, (row.open_requests ?? 0) + delta);
  let mult = Number(row.surge_multiplier ?? 1);
  if (next >= 8) mult = Math.min(2.5, mult + 0.05);
  else if (next <= 2) mult = Math.max(1, mult - 0.02);

  await db.from("surge_cells").update({
    open_requests: next,
    surge_multiplier: mult,
    updated_at: new Date().toISOString(),
  }).eq("cell_key", cellKey);
}

async function cancelMatchingRideSystem(
  rideId: string,
  ride: Record<string, unknown>,
  cancelReason: "no_drivers_available" | "matching_timeout",
  extraAudit: Record<string, unknown>,
  requestId?: string,
): Promise<void> {
  if (isBookForOthersPersistedRide(ride)) {
    logLine({
      event: "matching_cancel_skipped_book_for_others",
      ride_id: rideId,
      cancel_reason: cancelReason,
      request_id: requestId ?? null,
    });
    return;
  }

  const wave = Number(ride.matching_wave ?? 0);
  const patched = await patchRideRequest(rideId, {
    status: "cancelled",
    cancelled_by: "system",
    cancel_reason: cancelReason,
    updated_at: new Date().toISOString(),
  });

  if (!patched) {
    logLine({ event: "cancel_matching_patch_failed", ride_id: rideId, cancel_reason: cancelReason });
    return;
  }

  const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
  await bumpSurgeDemand(cellKey, -1);

  const eventType = cancelReason === "matching_timeout"
    ? "ride_auto_cancelled_matching_timeout"
    : "ride_auto_cancelled_no_drivers";
  await audit(rideId, undefined, eventType, { wave, ...extraAudit });

  logLine({
    event: cancelReason === "matching_timeout" ? "ride_matching_timeout" : "ride_auto_cancelled",
    ride_id: rideId,
    request_id: requestId ?? null,
    wave,
  });
}

function rideToSnapshot(ride: Record<string, unknown>): RideSnapshot {
  return {
    id: String(ride.id),
    pickup_lat: Number(ride.pickup_lat),
    pickup_lng: Number(ride.pickup_lng),
    vehicle_option: String(ride.vehicle_option ?? ""),
    rider_user_id: String(ride.rider_user_id),
    driver_offer_timeout_seconds: ride.driver_offer_timeout_seconds != null
      ? Number(ride.driver_offer_timeout_seconds)
      : undefined,
    assigned_driver_user_id: ride.assigned_driver_user_id
      ? String(ride.assigned_driver_user_id)
      : null,
    matching_wave: ride.matching_wave != null ? Number(ride.matching_wave) : 0,
  };
}

/**
 * Check if there are more candidates at the current wave radius that haven't been offered.
 * Used for serial dispatch to decide whether to retry same wave.
 */
async function hasMoreCandidatesAtWave(
  ride: Record<string, unknown>,
  policy: ResolvedPolicy,
  wave: number,
): Promise<boolean> {
  const radiusKm = getWaveRadiusKm(policy, wave);
  const freshSince = new Date(Date.now() - driverLocationMaxAgeMs(policy)).toISOString();
  const locations = await loadAvailableDriverLocations(freshSince);

  const offers = await loadDriverOffersForRide(String(ride.id), false);
  const offeredDriverIds = new Set(offers.map((o) => o.driver_user_id));
  const excludedIds = new Set(
    offers
      .filter((o) => ["declined", "expired", "superseded"].includes(o.status))
      .map((o) => o.driver_user_id),
  );

  const { candidates } = await buildCandidatePool(
    locations,
    Number(ride.pickup_lat),
    Number(ride.pickup_lng),
    radiusKm,
    excludedIds,
    policy,
    new Set(),
    0,
  );

  return hasUnofferedCandidates(candidates, offeredDriverIds);
}

/**
 * Reconcile matching state for a ride.
 *
 * - Expires pending offers past their deadline
 * - Advances to next wave if no pending offers remain
 * - Cancels ride if max waves exceeded (unless book-for-others)
 * - For serial dispatch: retries same wave if more candidates exist
 */
export async function reconcileMatching(
  rideId: string,
  policy: ResolvedPolicy,
  requestId?: string,
): Promise<ReconcileResult> {
  const nowIso = new Date().toISOString();
  await expirePendingOffersForRide(rideId, nowIso);

  logLine({
    event: "reconcile_started",
    ride_id: rideId,
    request_id: requestId ?? null,
  });

  for (let iter = 0; iter < RECONCILE_WAVE_LOOP_CAP; iter++) {
    const ride = await loadRideRequestById(rideId);
    if (!ride || ride.status !== "matching") {
      return {
        ok: true,
        status: String(ride?.status ?? "unknown"),
        wave: Number(ride?.matching_wave ?? 0),
        pending_offers: 0,
        action_taken: ride?.status === "driver_assigned" ? "assigned" : "none",
      };
    }

    if (isMatchingTimedOut(ride as { created_at: string }, policy)) {
      if (isBookForOthersPersistedRide(ride)) {
        logLine({
          event: "matching_timeout_skipped_book_for_others",
          ride_id: rideId,
          request_id: requestId ?? null,
        });
        return {
          ok: true,
          status: "matching",
          wave: Number(ride.matching_wave ?? 0),
          pending_offers: 0,
          action_taken: "none",
        };
      }
      await cancelMatchingRideSystem(rideId, ride, "matching_timeout", {}, requestId);
      return {
        ok: true,
        status: "cancelled",
        wave: Number(ride.matching_wave ?? 0),
        pending_offers: 0,
        action_taken: "cancelled",
      };
    }

    const offerRows = await loadDriverOffersForRide(rideId, false);
    const pendingCount = offerRows.filter((row) => row.status === "pending").length;

    if (pendingCount > 0) {
      return {
        ok: true,
        status: "matching",
        wave: Number(ride.matching_wave ?? 0),
        pending_offers: pendingCount,
        action_taken: "none",
      };
    }

    const wave = Number(ride.matching_wave ?? 0);

    if (isSerialDispatchEnabled(policy)) {
      const moreCandidates = await hasMoreCandidatesAtWave(ride, policy, wave);
      if (moreCandidates) {
        const result = await runMatchingWave(rideId, rideToSnapshot(ride), wave, policy, requestId);
        if (result.offers_created > 0) {
          return {
            ok: true,
            status: "matching",
            wave,
            pending_offers: result.offers_created,
            action_taken: "wave_advanced",
          };
        }
        continue;
      }
    }

    if (wave >= policy.max_match_waves) {
      if (isBookForOthersPersistedRide(ride)) {
        await patchRideRequest(rideId, {
          matching_wave: 0,
          updated_at: new Date().toISOString(),
        });
        logLine({
          event: "matching_wave_reset_book_for_others",
          ride_id: rideId,
          wave,
          request_id: requestId ?? null,
        });
        return {
          ok: true,
          status: "matching",
          wave: 0,
          pending_offers: 0,
          action_taken: "none",
        };
      }

      await cancelMatchingRideSystem(rideId, ride, "no_drivers_available", {}, requestId);
      return {
        ok: true,
        status: "cancelled",
        wave,
        pending_offers: 0,
        action_taken: "cancelled",
      };
    }

    const nextWave = wave + 1;
    const result = await runMatchingWave(rideId, rideToSnapshot(ride), nextWave, policy, requestId);

    const afterOffers = await loadDriverOffersForRide(rideId, false);
    const afterPending = afterOffers.filter((row) => row.status === "pending").length;

    if (afterPending > 0) {
      return {
        ok: true,
        status: "matching",
        wave: nextWave,
        pending_offers: afterPending,
        action_taken: "wave_advanced",
      };
    }
  }

  logLine({
    event: "reconcile_matching_loop_cap",
    ride_id: rideId,
    request_id: requestId ?? null,
  });

  return {
    ok: true,
    status: "matching",
    wave: 0,
    pending_offers: 0,
    action_taken: "none",
    error: "loop_cap_reached",
  };
}

/**
 * Start matching for a new ride.
 */
export async function startMatching(
  rideId: string,
  ride: RideSnapshot,
  policy: ResolvedPolicy,
  requestId?: string,
): Promise<ReconcileResult> {
  await runMatchingWave(rideId, ride, 1, policy, requestId);
  return reconcileMatching(rideId, policy, requestId);
}
