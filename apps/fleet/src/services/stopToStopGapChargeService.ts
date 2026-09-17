/**
 * Fleet client for stop-to-stop gap recommendations (Phase 3 money rebuild).
 * Server is the only money writer. Dual control: recommend then a different actor approves.
 */
import { api } from './api';
import type { GapChargeRecommendation } from '@roam/fuel-core';
import type { OdometerBucket } from '../types/fuel';

const GAP_ERROR_MESSAGES: Record<string, string> = {
  period_locked: 'This week is locked — gap charges cannot be changed.',
  actor_required: 'Signed-in user required for gap charges.',
  recommendation_missing_actor:
    'This recommendation has no recommender — ask someone to recommend it again.',
  already_recommended:
    'This gap charge is already recommended — a different person must approve it.',
  same_actor_forbidden: 'A different person must approve this gap charge.',
};

export function gapChargeErrorMessage(codeOrBody: unknown, fallback: string): string {
  if (typeof codeOrBody === 'string' && GAP_ERROR_MESSAGES[codeOrBody]) {
    return GAP_ERROR_MESSAGES[codeOrBody];
  }
  const body = codeOrBody as { error?: string; message?: string } | null;
  const code = String(body?.error || '');
  if (code && GAP_ERROR_MESSAGES[code]) return GAP_ERROR_MESSAGES[code];
  if (body?.message) return String(body.message);
  if (code) return code;
  return fallback;
}

async function resolvePeriodId(input: {
  periodId: string;
  weekStart?: string;
  weekEnd?: string;
}): Promise<string> {
  let periodId = input.periodId;
  if (input.weekStart && input.weekEnd) {
    const periodRow = await api.ensureFuelReconciliationPeriod({
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
    });
    if (periodRow?.id) periodId = String(periodRow.id);
  }
  return periodId;
}

export async function listGapCharges(input: {
  periodId: string;
  weekStart?: string;
  weekEnd?: string;
  status?: 'recommended' | 'approved' | 'posted' | 'blocked' | 'rejected';
}): Promise<GapChargeRecommendation[]> {
  const periodId = await resolvePeriodId(input);
  const res = await api.listFuelGapCharges({
    periodId,
    status: input.status,
  });
  return (res.recommendations || []) as GapChargeRecommendation[];
}

export async function recommendGapCharge(input: {
  orgId: string;
  periodId: string;
  weekStart?: string;
  weekEnd?: string;
  snapshotId?: string;
  bucket: OdometerBucket;
  /**
   * When false (default for UI), only recommends — second approver must post Pending.
   * When true, chains approve if the caller has fuel.second_approve (tests / break-glass).
   */
  autoApprove?: boolean;
}): Promise<GapChargeRecommendation & { needsSecondApprove?: boolean }> {
  const amount = Number(input.bucket.deductionRecommendation) || 0;
  const periodId = await resolvePeriodId(input);

  try {
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

    // already_recommended returns 409 without a recommendation payload
    if ((recommendRes as { error?: string }).error === 'already_recommended') {
      return {
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
        blockReason: gapChargeErrorMessage('already_recommended', 'Already recommended'),
        createdAt: new Date().toISOString(),
        engineVersion: 's2s-v1',
      };
    }

    const rec = recommendRes.recommendation as GapChargeRecommendation;
    if (!rec || rec.status === 'blocked') {
      return (
        rec || {
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
        }
      );
    }

    // P-3: UI defaults to recommend-only (autoApprove false).
    if (input.autoApprove !== true) {
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
  } catch (e: any) {
    const code = String(e?.body?.error || e?.message || '');
    if (GAP_ERROR_MESSAGES[code] || e?.body?.error) {
      return {
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
        blockReason: gapChargeErrorMessage(e?.body || code, 'Failed to recommend gap charge'),
        createdAt: new Date().toISOString(),
        engineVersion: 's2s-v1',
      };
    }
    throw e;
  }
}

/** Second-approver path — posts Pending ledger row for an existing recommendation. */
export async function approveGapCharge(input: {
  weekStart?: string;
  weekEnd?: string;
  periodId: string;
  bucketId: string;
}): Promise<GapChargeRecommendation & { sameActor?: boolean }> {
  const periodId = await resolvePeriodId(input);
  try {
    const approveRes = await api.approveFuelGapCharge({
      periodId,
      bucketId: input.bucketId,
    });
    const approved = approveRes.recommendation as GapChargeRecommendation;
    return {
      ...approved,
      status: 'approved',
      transactionId:
        approveRes.transactionId ||
        approved?.transactionId ||
        (approveRes.transaction as { id?: string } | undefined)?.id,
    };
  } catch (e: any) {
    const status = Number(e?.status) || 0;
    const code = String(e?.body?.error || e?.message || '');
    if (status === 403 && (code.includes('same_actor') || code === 'same_actor_forbidden')) {
      return {
        id: `rec_${input.bucketId}`,
        orgId: '',
        periodId,
        bucketId: input.bucketId,
        vehicleId: '',
        amount: 0,
        overLoggedKm: 0,
        reason: '',
        confidenceTier: 'exact',
        status: 'blocked',
        blockReason: gapChargeErrorMessage('same_actor_forbidden', 'A different person must approve.'),
        createdAt: new Date().toISOString(),
        engineVersion: 's2s-v1',
        sameActor: true,
      };
    }
    if (
      status === 401 ||
      status === 409 ||
      GAP_ERROR_MESSAGES[code] ||
      e?.body?.error
    ) {
      return {
        id: `rec_${input.bucketId}`,
        orgId: '',
        periodId,
        bucketId: input.bucketId,
        vehicleId: '',
        amount: 0,
        overLoggedKm: 0,
        reason: '',
        confidenceTier: 'exact',
        status: 'blocked',
        blockReason: gapChargeErrorMessage(e?.body || code, 'Failed to approve gap charge'),
        createdAt: new Date().toISOString(),
        engineVersion: 's2s-v1',
      };
    }
    throw e;
  }
}
