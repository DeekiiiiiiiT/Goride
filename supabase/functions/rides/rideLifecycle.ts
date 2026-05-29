/**
 * Central ride status transition writer (manual, geofence, system).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";
import { gridCellKey } from "./fare/buildQuote.ts";
import { calculateWaitTimeFee } from "./fare/waitTime.ts";
import { verifyRidePin, generatePin } from "./fare/pinVerification.ts";

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
  /** Wait time settings for on_trip transition. */
  waitTimeSettings?: {
    graceMinutes: number;
    ratePerMinMinor: number;
    chargeEnabled: boolean;
  };
  /** PIN verification for on_trip transition. */
  pinSettings?: {
    enabled: boolean;
    requiredForStart: boolean;
    providedPin?: string;
  };
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
  const nowMs = Date.now();
  const patch: Record<string, unknown> = {
    status: params.next,
    updated_at: nowIso,
    ...lifecycleTimestampPatch(params.next, nowIso),
  };

  if (
    params.next === "driver_arrived_pickup" &&
    (params.pinSettings?.enabled || params.pinSettings?.requiredForStart) &&
    !ride.verification_pin
  ) {
    patch.verification_pin = generatePin();
  }

  if (params.next === "on_trip" && params.pinSettings?.requiredForStart) {
    const pinResult = verifyRidePin(
      params.pinSettings.providedPin ?? "",
      {
        verification_pin: ((patch.verification_pin as string | undefined) ??
          (ride.verification_pin as string | null)) ?? null,
        pin_verified_at: (ride.pin_verified_at as string | null) ?? null,
      },
    );
    if (!pinResult.verified && pinResult.error !== "already_verified") {
      return { ok: false, error: `pin_${pinResult.error ?? "invalid"}`, current };
    }
    if (pinResult.verified && pinResult.error !== "already_verified") {
      patch.pin_verified_at = nowIso;
    }
  }

  if (params.next === "on_trip" && params.waitTimeSettings?.chargeEnabled) {
    const arrivedAt = ride.arrived_pickup_at as string | null;
    if (arrivedAt) {
      const waitResult = calculateWaitTimeFee({
        arrivedPickupAt: arrivedAt,
        tripStartedAt: nowIso,
        graceMinutes: params.waitTimeSettings.graceMinutes,
        ratePerMinMinor: params.waitTimeSettings.ratePerMinMinor,
        surgeMultiplier: Number(ride.surge_multiplier ?? 1),
        nowMs,
      });
      if (waitResult.feeMinor > 0) {
        patch.wait_time_fee_minor = waitResult.feeMinor;
        patch.wait_time_started_at = waitResult.graceExpiredAt;
      }
    }
  }

  if (params.next === "completed") {
    const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);
    const waitTimeFeeMinor = Number(ride.wait_time_fee_minor ?? 0);
    const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
    const estimatedTollsMinor = Number((ride.fare_breakdown as Record<string, unknown>)?.estimated_tolls_minor ?? 0);
    const tollAdjustment = actualTollsMinor - estimatedTollsMinor;
    const fareMinor = baseFareMinor + waitTimeFeeMinor + Math.max(0, tollAdjustment);
    if (!Number.isFinite(fareMinor) || fareMinor < 0) {
      return { ok: false, error: "invalid_fare", current };
    }
    patch.fare_final_minor = fareMinor;
    patch.completed_at = nowIso;
    
    const breakdown = (ride.fare_breakdown ?? {}) as Record<string, unknown>;
    patch.fare_final_breakdown = {
      ...breakdown,
      wait_time_fee_minor: waitTimeFeeMinor,
      actual_tolls_minor: actualTollsMinor,
      toll_adjustment_minor: tollAdjustment,
    };
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
