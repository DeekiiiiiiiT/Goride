/**
 * Persisted-only toll bucket resolver — Deno-importable (no MatchResult).
 * Used by GET /toll-reconciliation/periods and resolveWizardBucket fallback.
 */

export type PeriodBucket = 'needs-review' | 'underpaid-claims' | 'deadhead' | 'personal-use';

/** Maps server workflowStage to landing/wizard bucket id. */
export function bucketForWorkflowStage(stage: string | undefined): PeriodBucket | null {
  switch (stage) {
    case 'needs_review':
      return 'needs-review';
    case 'underpaid_pending':
      return 'underpaid-claims';
    case 'deadhead_pending':
      return 'deadhead';
    case 'personal_use_pending':
      return 'personal-use';
    case 'deadhead_resolved':
    case 'personal_use_resolved':
    case 'claim_filed':
    case 'claim_resolved':
    case 'matched':
      return null;
    default:
      return 'needs-review';
  }
}

/** Persisted fields only — no live MatchResult (server period landing). */
export function resolvePeriodBucketFromPersisted(tx: {
  workflowStage?: string;
  matchReasonCode?: string;
  matchTypeCode?: string | null;
  matchedTripId?: string | null;
  matchStatus?: string;
  isAmbiguous?: boolean;
  isReconciled?: boolean;
  tripId?: string | null;
  paymentMethod?: string;
  receiptUrl?: string;
}): PeriodBucket | null {
  const stage = tx.workflowStage as string | undefined;
  const stageBucket = bucketForWorkflowStage(stage);
  if (stageBucket === null && stage) return null;

  const reasonCode = String(tx.matchReasonCode || '');
  const isOrphanPersonal =
    tx.matchTypeCode === 'PERSONAL_MATCH' &&
    (reasonCode.startsWith('ORPHAN_') || !tx.matchedTripId);

  if (isOrphanPersonal || stage === 'personal_use_pending' || tx.matchStatus === 'orphan_personal') {
    if (!isOrphanPersonal) {
      if (tx.matchStatus === 'ambiguous' || tx.isAmbiguous === true) return 'needs-review';
      if (tx.matchTypeCode === 'AMOUNT_VARIANCE') return 'underpaid-claims';
      if (tx.matchTypeCode === 'DEADHEAD_MATCH') return 'deadhead';
      if (tx.matchTypeCode === 'PERFECT_MATCH') return 'needs-review';
    }
    return 'personal-use';
  }

  const linkConfirmed = !!(tx.isReconciled && tx.tripId);
  if (!linkConfirmed && (tx.matchStatus === 'ambiguous' || tx.isAmbiguous === true)) {
    return 'needs-review';
  }

  const matchType = tx.matchTypeCode as string | undefined;
  if (matchType === 'AMOUNT_VARIANCE' || stage === 'underpaid_pending') return 'underpaid-claims';
  if (matchType === 'DEADHEAD_MATCH' || stage === 'deadhead_pending') return 'deadhead';
  if (matchType === 'PERSONAL_MATCH' || stage === 'personal_use_pending') return 'personal-use';

  const isCash = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
  if (!matchType && !isCash && tx.matchStatus !== 'ambiguous') {
    return 'personal-use';
  }

  return stageBucket ?? 'needs-review';
}

/** Alias used by server toll_period_controller (underpaid-claims step id). */
export const resolvePeriodBucket = resolvePeriodBucketFromPersisted;
