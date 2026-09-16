/**
 * HTTP helpers for stop-to-stop gap charge recommend/approve (Phase 3).
 * Approve writes a Pending ledger row; Charge Gap UI calls these routes.
 */
import {
  buildGapDeductionTransaction,
  gapChargeIdempotencyKey,
  resolveGapChargeDriver,
  STOP_TO_STOP_ENGINE_VERSION,
  type GapChargeRecommendation,
} from "../../../packages/fuel-core/src/stopToStopGapCharge.ts";
import type { VehicleWithDriverHistory } from "../../../packages/fuel-core/src/vehicleDriverAssignmentHistory.ts";

export function buildRecommendPayload(input: {
  orgId: string;
  periodId: string;
  snapshotId?: string;
  bucketId: string;
  vehicleId: string;
  amount: number;
  overLoggedKm: number;
  reason: string;
  confidenceTier: string;
  startYmd: string;
  endYmd: string;
  vehicle: VehicleWithDriverHistory | null;
}): GapChargeRecommendation {
  const rec: GapChargeRecommendation = {
    id: `rec_${input.bucketId}`,
    orgId: input.orgId,
    periodId: input.periodId,
    snapshotId: input.snapshotId,
    bucketId: input.bucketId,
    vehicleId: input.vehicleId,
    amount: input.amount,
    overLoggedKm: input.overLoggedKm,
    reason: input.reason,
    confidenceTier: input.confidenceTier,
    status: "recommended",
    createdAt: new Date().toISOString(),
    engineVersion: STOP_TO_STOP_ENGINE_VERSION,
  };

  const resolved = resolveGapChargeDriver({
    vehicle: input.vehicle,
    startYmd: input.startYmd,
    endYmd: input.endYmd,
    confidenceTier: input.confidenceTier,
  });

  if (!resolved.ok) {
    return { ...rec, status: "blocked", blockReason: resolved.reason };
  }

  return {
    ...rec,
    status: "recommended",
    resolvedDriverId: resolved.driverId,
  };
}

export function buildApproveTransaction(input: {
  recommendation: GapChargeRecommendation;
  driverId: string;
}): Record<string, unknown> {
  const id = `gap_${input.recommendation.orgId}_${input.recommendation.bucketId}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 180);
  return buildGapDeductionTransaction({
    recommendation: input.recommendation,
    driverId: input.driverId,
    idFactory: () => id,
  });
}

export function gapChargeKvKey(orgId: string, periodId: string, bucketId: string): string {
  return `gap_charge_rec:${orgId}:${periodId}:${bucketId}`;
}

export { gapChargeIdempotencyKey, STOP_TO_STOP_ENGINE_VERSION };
