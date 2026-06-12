/**
 * Central ride status transition writer (manual, geofence, system).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { DispatchSettings } from "./fare/dispatchSettings.ts";
import { gridCellKey } from "./fare/buildQuote.ts";
import { calculateWaitTimeFee, getWaitTimeGraceAnchor } from "./fare/waitTime.ts";
import { verifyRidePin, generatePin } from "./fare/pinVerification.ts";
import { isCashSettlementEnabled } from "./cashSettlement/flags.ts";
import { computeFinalFareFromRide, completionFinancialPatch } from "./cashSettlement/computeFinalFare.ts";

export type RideStatus =
  | "matching"
  | "driver_assigned"
  | "driver_en_route_pickup"
  | "driver_arrived_pickup"
  | "on_trip"
  | "awaiting_cash_settlement"
  | "completed"
  | "cancelled";

export type TransitionSource = "manual" | "geofence" | "system";

export function driverTransitionsFor(
  cashSettlementEnabled = isCashSettlementEnabled(),
): Record<RideStatus, RideStatus[]> {
  const onTripTargets: RideStatus[] = cashSettlementEnabled
    ? ["awaiting_cash_settlement", "completed", "cancelled"]
    : ["completed", "cancelled"];
  return {
    matching: [],
    driver_assigned: ["driver_en_route_pickup", "cancelled"],
    driver_en_route_pickup: ["driver_arrived_pickup", "cancelled"],
    driver_arrived_pickup: ["on_trip", "cancelled"],
    on_trip: onTripTargets,
    awaiting_cash_settlement: [],
    completed: [],
    cancelled: [],
  };
}

/** @deprecated Use driverTransitionsFor() for flag-aware checks. */
export const DRIVER_TRANSITIONS: Record<RideStatus, RideStatus[]> = driverTransitionsFor(false);

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

  const cashEnabled = isCashSettlementEnabled();
  const paymentMethod = String(ride.payment_method ?? "cash");
  const allowed = driverTransitionsFor(cashEnabled)[current];
  if (!allowed?.includes(params.next)) {
    return { ok: false, error: "invalid_transition", current, ride };
  }
  if (
    cashEnabled &&
    paymentMethod === "cash" &&
    current === "on_trip" &&
    params.next === "completed"
  ) {
    return { ok: false, error: "cash_settlement_required", current, ride };
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
    const graceStartedAt = getWaitTimeGraceAnchor(ride);
    if (graceStartedAt) {
      const waitResult = calculateWaitTimeFee({
        graceStartedAt,
        tripStartedAt: nowIso,
        graceMinutes: params.waitTimeSettings.graceMinutes,
        ratePerMinMinor: params.waitTimeSettings.ratePerMinMinor,
        surgeMultiplier: Number(ride.surge_multiplier ?? 1),
        nowMs,
      });
      if (waitResult.feeMinor > 0) {
        patch.wait_time_fee_minor = waitResult.feeMinor;
      }
    }
  }

  if (params.next === "awaiting_cash_settlement") {
    const fareResult = computeFinalFareFromRide(ride);
    if ("error" in fareResult) {
      return { ok: false, error: fareResult.error, current };
    }
    patch.fare_final_minor = fareResult.fareMinor;
    patch.fare_final_breakdown = fareResult.fareFinalBreakdown;
    patch.platform_fee_minor = 0;
    patch.driver_net_minor = fareResult.fareMinor;
    patch.fare_locked_at = nowIso;
    patch.cash_settlement_status = "pending";
    if (!ride.payment_method) patch.payment_method = "cash";
  }

  if (params.next === "completed") {
    const fareResult = computeFinalFareFromRide(ride);
    if ("error" in fareResult) {
      return { ok: false, error: fareResult.error, current };
    }
    Object.assign(patch, completionFinancialPatch(ride, fareResult, nowIso));
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
    : params.next === "awaiting_cash_settlement"
    ? "cash_settlement_pending"
    : "driver_transition";

  const auditPayload: Record<string, unknown> = {
    from: current,
    to: params.next,
    source: params.source,
  };
  if (params.next === "completed") {
    auditPayload.payment_method = patch.payment_method ?? ride.payment_method;
  }
  if (params.next === "awaiting_cash_settlement") {
    auditPayload.fare_final_minor = patch.fare_final_minor;
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
