/**
 * Fleet client for stop-to-stop gap recommendations (Phase 3 money rebuild).
 * Server is the only money writer: recommend → approve → Pending ledger row.
 */
import { api } from './api';
import type { GapChargeRecommendation } from '@roam/fuel-core';
import type { OdometerBucket } from '../types/fuel';

export async function recommendGapCharge(input: {
  orgId: string;
  periodId: string;
  weekStart?: string;
  weekEnd?: string;
  snapshotId?: string;
  bucket: OdometerBucket;
  /** When true (default), immediately approve → Pending ledger if caller has permission. */
  autoApprove?: boolean;
}): Promise<GapChargeRecommendation & { needsSecondApprove?: boolean }> {
  const amount = Number(input.bucket.deductionRecommendation) || 0;
  let periodId = input.periodId;
  if (input.weekStart && input.weekEnd) {
    const periodRow = await api.ensureFuelReconciliationPeriod({
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
    });
    if (periodRow?.id) periodId = String(periodRow.id);
  }

  const recommendRes = await api.recommendFuelGapCharge({
    periodId,
    snapshotId: input.snapshotId,
    bucketId: input.bucket.id,
    vehicleId: input.bucket.vehicleId,
    amount,
    overLoggedKm: input.bucket.unaccountedDistance || 0,
    reason: input.bucket.deductionReason || 'Over-logged distance',
    confidenceTier: input.bucket.confidenceTier || 'indeterminate',
    startYmd: String(input.bucket.startDate).split('T')[0],
    endYmd: String(input.bucket.endDate).split('T')[0],
  });

  const rec = recommendRes.recommendation as GapChargeRecommendation;
  if (!rec || rec.status === 'blocked') {
    return rec || {
      id: `rec_${input.bucket.id}`,
      orgId: input.orgId,
      periodId,
      bucketId: input.bucket.id,
      vehicleId: input.bucket.vehicleId,
      amount,
      overLoggedKm: input.bucket.unaccountedDistance || 0,
      reason: input.bucket.deductionReason || 'Over-logged distance',
      confidenceTier: input.bucket.confidenceTier || 'indeterminate',
      status: 'blocked',
      blockReason: 'Recommendation failed',
      createdAt: new Date().toISOString(),
      engineVersion: 's2s-v1',
    };
  }

  if (input.autoApprove === false) {
    return { ...rec, needsSecondApprove: true };
  }

  try {
    const approveRes = await api.approveFuelGapCharge({
      periodId,
      bucketId: input.bucket.id,
    });
    const approved = (approveRes.recommendation || rec) as GapChargeRecommendation;
    return {
      ...approved,
      status: 'approved',
      transactionId:
        approveRes.transactionId ||
        approved.transactionId ||
        (approveRes.transaction as { id?: string } | undefined)?.id,
    };
  } catch (e: any) {
    const status = Number(e?.status) || 0;
    if (status === 403) {
      return { ...rec, needsSecondApprove: true };
    }
    throw e;
  }
}
