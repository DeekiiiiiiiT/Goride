/**
 * Central ride status transition writer (manual, geofence, system).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";
import { gridCellKey } from "./fare/buildQuote.ts";

export type RideStatus =
  | "matching"
  | "driver_assigned"
  | "driver_en_route_pickup"
  | "driver_arrived_pickup"
  | "on_trip"
  | "completed"
  | "cancelled";

export type TransitionSource = "manual" | "geofence" | "system";

export const DRIVER_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  matching: [],
  driver_assigned: ["driver_en_route_pickup", "cancelled"],
  driver_en_route_pickup: ["driver_arrived_pickup", "cancelled"],
  driver_arrived_pickup: ["on_trip", "cancelled"],
  on_trip: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export interface ApplyTransitionDeps {
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  patchRideRequest: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  handleTerminalRideLedgerAndSync: (rideId: string) => Promise<void>;
  bumpSurgeDemand: (cellKey: string, delta: number) => Promise<void>;
  audit: (
    rideId: string,
    actorUserId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  cleanupLiveState: (rideId: string) => Promise<void>;
}

export interface ApplyTransitionParams {
  rideId: string;
  next: RideStatus;
  actorUserId: string | null;
  source: TransitionSource;
  expectedFrom?: RideStatus;
  cancelReason?: string | null;
  cancelledBy?: "rider" | "driver" | "system";
}

export interface ApplyTransitionResult {
  ok: boolean;
  ride?: Record<string, unknown>;
  error?: string;
  current?: RideStatus;
  skipped?: boolean;
}

function lifecycleTimestampPatch(next: RideStatus, nowIso: string): Record<string, unknown> {
  switch (next) {
    case "driver_en_route_pickup":
      return { en_route_at: nowIso };
    case "driver_arrived_pickup":
      return { arrived_pickup_at: nowIso };
    case "on_trip":
      return { trip_started_at: nowIso };
    default:
      return {};
  }
}

export async function applyRideTransition(
  deps: ApplyTransitionDeps,
  params: ApplyTransitionParams,
): Promise<ApplyTransitionResult> {
  const ride = await deps.loadRideRequestById(params.rideId);
  if (!ride) return { ok: false, error: "not_found" };

  const current = ride.status as RideStatus;
  if (params.expectedFrom && current !== params.expectedFrom) {
    return { ok: false, error: "status_changed", current };
  }
  if (current === params.next) {
    return { ok: true, ride, skipped: true, current };
  }

  const allowed = DRIVER_TRANSITIONS[current];
  if (!allowed?.includes(params.next)) {
    return { ok: false, error: "invalid_transition", current, ride };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.next,
    updated_at: nowIso,
    ...lifecycleTimestampPatch(params.next, nowIso),
  };

  if (params.next === "completed") {
    const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor);
    if (!Number.isFinite(fareMinor) || fareMinor < 0) {
      return { ok: false, error: "invalid_fare", current };
    }
    patch.fare_final_minor = fareMinor;
    patch.completed_at = nowIso;
    patch.fare_final_breakdown = ride.fare_breakdown ?? null;
    patch.platform_fee_minor = 0;
    patch.tip_minor = 0;
    patch.driver_net_minor = fareMinor;
    if (!ride.payment_method) patch.payment_method = "cash";
  }

  if (params.next === "cancelled") {
    patch.cancelled_by = params.cancelledBy ?? "driver";
    patch.cancel_reason = params.cancelReason ?? null;
  }

  const patched = await deps.patchRideRequest(params.rideId, patch);
  if (!patched) return { ok: false, error: "patch_failed", current };

  if (params.next === "completed" || params.next === "cancelled") {
    await deps.handleTerminalRideLedgerAndSync(params.rideId);
    await deps.cleanupLiveState(params.rideId);
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await deps.bumpSurgeDemand(cellKey, -1);
  }

  const auditType = params.next === "completed"
    ? "ride_completed"
    : params.next === "cancelled"
    ? "ride_cancelled"
    : "driver_transition";

  const auditPayload: Record<string, unknown> = {
    from: current,
    to: params.next,
    source: params.source,
  };
  if (params.next === "completed") {
    auditPayload.payment_method = patch.payment_method ?? ride.payment_method;
  }

  await deps.audit(params.rideId, params.actorUserId, auditType, auditPayload);

  const fresh = await deps.loadRideRequestById(params.rideId);
  return { ok: true, ride: fresh ?? undefined, current };
}

export async function maybeAutoEnRouteOnAccept(
  deps: ApplyTransitionDeps,
  settings: DispatchSettings,
  rideId: string,
  driverUserId: string,
): Promise<Record<string, unknown> | null> {
  if (!settings.auto_en_route_on_accept) {
    return deps.loadRideRequestById(rideId);
  }
  const result = await applyRideTransition(deps, {
    rideId,
    next: "driver_en_route_pickup",
    actorUserId: driverUserId,
    source: "system",
    expectedFrom: "driver_assigned",
  });
  return result.ride ?? (await deps.loadRideRequestById(rideId));
}
