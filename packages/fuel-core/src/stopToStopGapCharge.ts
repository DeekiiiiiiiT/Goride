/**
 * Stop-to-stop Gap_Deduction — recommend → approve helpers (shared client/server).
 * Driver resolved from assignment history over the bucket window (never "today").
 */
import {
  driverIdAtVehicleTime,
  type VehicleWithDriverHistory,
} from './vehicleDriverAssignmentHistory.ts';

export const GAP_DEDUCTION_TX_TYPE = 'Gap_Deduction';
export const STOP_TO_STOP_ENGINE_VERSION = 's2s-v1';

export type GapChargeRecommendation = {
  id: string;
  orgId: string;
  periodId: string;
  snapshotId?: string;
  bucketId: string;
  vehicleId: string;
  amount: number;
  overLoggedKm: number;
  reason: string;
  confidenceTier: string;
  status: 'recommended' | 'approved' | 'posted' | 'blocked' | 'rejected';
  resolvedDriverId?: string;
  blockReason?: string;
  transactionId?: string;
  createdAt: string;
  recommendedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  engineVersion: string;
};

export function gapChargeIdempotencyKey(orgId: string, bucketId: string): string {
  return `gap_deduction:${orgId}:${bucketId}`;
}

/** Q-1: period freeze — refuse money mutations when locked. */
export function assertPeriodNotLockedForGapCharge(
  period: { status?: unknown; locked_at?: unknown } | null | undefined,
): { ok: true } | { ok: false; error: 'period_not_found' | 'period_locked' } {
  if (!period) return { ok: false, error: 'period_not_found' };
  if (String(period.status) === 'locked' || period.locked_at) {
    return { ok: false, error: 'period_locked' };
  }
  return { ok: true };
}

/**
 * Q-2 identity gates — never approve with missing actor/recommender.
 * Same-actor approve is allowed while fleet is solo-owner operated (product deferral).
 * Re-enable distinct-actor enforcement when multi-user dual control ships.
 */
export function assertGapChargeDualControl(input: {
  actor: string | null | undefined;
  recommendedBy: string | null | undefined;
  /** When true (future multi-user), refuse recommender === approver. Default false for solo. */
  requireDistinctActor?: boolean;
}):
  | { ok: true; actor: string; recommendedBy: string }
  | {
      ok: false;
      error: 'actor_required' | 'recommendation_missing_actor' | 'same_actor_forbidden';
      status: 401 | 403 | 409;
    } {
  const actor = input.actor != null && String(input.actor).trim() ? String(input.actor) : null;
  if (!actor) return { ok: false, error: 'actor_required', status: 401 };
  const recommendedBy =
    input.recommendedBy != null && String(input.recommendedBy).trim()
      ? String(input.recommendedBy)
      : null;
  if (!recommendedBy) {
    return { ok: false, error: 'recommendation_missing_actor', status: 409 };
  }
  if (input.requireDistinctActor === true && actor === recommendedBy) {
    return { ok: false, error: 'same_actor_forbidden', status: 403 };
  }
  return { ok: true, actor, recommendedBy };
}

/**
 * Prevent second-person Recommend from overwriting recommendedBy (dual-control inversion).
 * Same actor may refresh; other actor gets already_recommended.
 */
export function assertGapChargeRecommendOverwrite(input: {
  actor: string;
  existing: { status?: string; recommendedBy?: string | null } | null | undefined;
}): { ok: true } | { ok: false; error: 'already_recommended' } {
  const existing = input.existing;
  if (!existing || existing.status !== 'recommended') return { ok: true };
  const by =
    existing.recommendedBy != null && String(existing.recommendedBy).trim()
      ? String(existing.recommendedBy)
      : null;
  if (by && by !== input.actor) {
    return { ok: false, error: 'already_recommended' };
  }
  return { ok: true };
}

/** Drivers who had the vehicle at any point in [startYmd, endYmd]. */
export function driversInBucketWindow(
  vehicle: VehicleWithDriverHistory | null | undefined,
  startYmd: string,
  endYmd: string,
): string[] {
  if (!vehicle) return [];
  const startMs = Date.parse(`${startYmd}T00:00:00`);
  const endMs = Date.parse(`${endYmd}T23:59:59`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    const fallback = vehicle.currentDriverId;
    return fallback ? [fallback] : [];
  }
  const ids = new Set<string>();
  for (let t = startMs; t <= endMs; t += 24 * 60 * 60 * 1000) {
    const d = driverIdAtVehicleTime(vehicle, t);
    if (d) ids.add(d);
  }
  const endDriver = driverIdAtVehicleTime(vehicle, endMs);
  if (endDriver) ids.add(endDriver);
  return [...ids];
}

export function resolveGapChargeDriver(input: {
  vehicle: VehicleWithDriverHistory | null | undefined;
  startYmd: string;
  endYmd: string;
  confidenceTier?: string;
}): { ok: true; driverId: string } | { ok: false; reason: string } {
  if (input.confidenceTier && input.confidenceTier !== 'exact') {
    return { ok: false, reason: `Bucket confidence is ${input.confidenceTier} — not chargeable` };
  }
  const drivers = driversInBucketWindow(input.vehicle, input.startYmd, input.endYmd);
  if (drivers.length === 0) {
    return { ok: false, reason: 'No driver assignment in bucket window — charge blocked' };
  }
  if (drivers.length > 1) {
    return {
      ok: false,
      reason: `Multiple drivers in window (${drivers.join(', ')}) — charge blocked`,
    };
  }
  return { ok: true, driverId: drivers[0] };
}

export function buildGapDeductionTransaction(input: {
  recommendation: GapChargeRecommendation;
  driverId: string;
  idFactory?: () => string;
}): Record<string, unknown> {
  const rec = input.recommendation;
  const id = input.idFactory ? input.idFactory() : `gap_${rec.orgId}_${rec.bucketId}`;
  return {
    id,
    date: new Date().toISOString().slice(0, 10),
    driverId: input.driverId,
    vehicleId: rec.vehicleId,
    type: 'Expense',
    category: 'Fuel',
    description: `Mileage over-log deduction: ${rec.overLoggedKm}km (pending dispute)`,
    amount: -Math.abs(rec.amount),
    paymentMethod: 'Cash',
    status: 'Pending',
    isReconciled: false,
    metadata: {
      bucketId: rec.bucketId,
      gapDistance: rec.overLoggedKm,
      deductionReason: rec.reason,
      transactionType: GAP_DEDUCTION_TX_TYPE,
      recommendationId: rec.id,
      periodId: rec.periodId,
      snapshotId: rec.snapshotId,
      engineVersion: STOP_TO_STOP_ENGINE_VERSION,
      idempotencyKey: gapChargeIdempotencyKey(rec.orgId, rec.bucketId),
      automated: false,
      requiresApproval: true,
    },
  };
}
