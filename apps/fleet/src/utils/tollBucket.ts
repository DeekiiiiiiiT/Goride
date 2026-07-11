import { MatchResult } from './tollReconciliation';

/**
 * Reconciliation sub-tab buckets produced from a toll's best match.
 * (The UI also has a 'dispute-refunds' tab, but that is sourced separately and
 * never produced by match-based bucketing.)
 */
export type TollBucket = 'needs-review' | 'underpaid' | 'deadhead' | 'personal-use';

/**
 * Decide which sub-tab a toll belongs to, given its best suggested match.
 *
 * Prefers the structured `reasonCode`; falls back to the legacy
 * `reason.includes('Approach')` check when `reasonCode` is undefined (old cached
 * payloads / personal-use flag OFF) so bucketing stays byte-identical to prior
 * behavior. Extracted from UnmatchedTollsList so it can be unit-tested directly.
 */
/** Trip link is confirmed once reconciled to a specific trip. */
export function isTripLinkConfirmed(tx: {
  isReconciled?: boolean;
  tripId?: string | null;
}): boolean {
  return !!(tx.isReconciled && tx.tripId);
}

/**
 * Wizard bucket: financial classification only after the trip link is settled.
 * Ambiguous unreconciled tolls stay in needs-review until the user picks a trip.
 */
export function resolveTollBucket(
  tx: { isReconciled?: boolean; tripId?: string | null },
  best: Pick<MatchResult, 'matchType' | 'reasonCode' | 'reason' | 'isAmbiguous'> | undefined,
): TollBucket {
  if (best?.isAmbiguous && !isTripLinkConfirmed(tx)) return 'needs-review';
  return bucketForBestMatch(best);
}

export function bucketForBestMatch(
  best: Pick<MatchResult, 'matchType' | 'reasonCode' | 'reason'> | undefined,
): TollBucket {
  if (!best) return 'needs-review';
  switch (best.matchType) {
    case 'AMOUNT_VARIANCE':
      return 'underpaid';
    case 'DEADHEAD_MATCH':
      return 'deadhead';
    case 'PERSONAL_MATCH': {
      const isApproach = best.reasonCode
        ? best.reasonCode === 'ENROUTE_APPROACH'
        : best.reason?.includes('Approach');
      return isApproach ? 'deadhead' : 'personal-use';
    }
    case 'POSSIBLE_MATCH':
    default:
      return 'needs-review';
  }
}

/**
 * Client mirror of the server's TollWorkflowStage (RWF-1,
 * apps/fleet/src/supabase/functions/server/toll_workflow_stage.ts). Kept as a
 * plain string union here (not imported — that file is a Deno server module)
 * so `bucketForWorkflowStage` below can be unit-tested the same way
 * `bucketForBestMatch` already is.
 */
export type TollWorkflowStage =
  | 'needs_review'
  | 'personal_use_pending'
  | 'personal_use_resolved'
  | 'deadhead_pending'
  | 'deadhead_resolved'
  | 'underpaid_pending'
  | 'claim_filed'
  | 'claim_resolved'
  | 'matched';

/**
 * Decide which sub-tab/step a toll belongs to from its PERSISTED workflow
 * stage — the read-path equivalent of `bucketForBestMatch`, but driven by a
 * durable server field instead of a live-recomputed match result. Same
 * 4-way bucket set; `null` means "no longer belongs in any to-do bucket"
 * (already claimed/resolved — the caller should exclude it, matching how
 * `ReconciliationDashboard` already excludes claimed tolls today via
 * `claimedTransactionIds`).
 *
 * `undefined`/unset stage (a toll that predates the RWF-1 backfill) falls
 * back to `needs-review` here — callers should prefer calling
 * `bucketForBestMatch` directly for such rows instead, so a pre-backfill
 * toll's real match isn't miscategorized as "needs review" when a perfectly
 * good live suggestion already exists.
 */
export function bucketForWorkflowStage(stage: TollWorkflowStage | undefined): TollBucket | null {
  switch (stage) {
    case 'needs_review':
      return 'needs-review';
    case 'underpaid_pending':
      return 'underpaid';
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

export type TollMatchStatus = 'unmatched' | 'matched' | 'orphan_personal' | 'ambiguous';

export interface WizardBucketTx {
  isReconciled?: boolean;
  tripId?: string | null;
  workflowStage?: TollWorkflowStage | string;
  matchStatus?: TollMatchStatus;
  matchTypeCode?: string | null;
  matchedTripId?: string | null;
  isAmbiguous?: boolean;
  paymentMethod?: string;
  receiptUrl?: string;
  claimId?: string | null;
  unlinkedSourceTripId?: string | null;
}

/** Toll already handled in Unlinked / Claims — must not reopen earlier wizard steps. */
export function isTollExcludedFromWizardBuckets(tx: WizardBucketTx): boolean {
  if (tx.claimId) return true;
  if (tx.unlinkedSourceTripId) return true;
  const stage = tx.workflowStage as TollWorkflowStage | undefined;
  if (stage && bucketForWorkflowStage(stage) === null) return true;
  return false;
}

/** Tag-import toll (not a cash/receipt driver claim). */
export function isTagImportToll(tx: WizardBucketTx): boolean {
  return tx.paymentMethod !== 'Cash' && !tx.receiptUrl;
}

export function isOrphanPersonalMatch(
  best: Pick<MatchResult, 'matchType' | 'reasonCode' | 'trip'> | undefined,
): boolean {
  if (!best || best.matchType !== 'PERSONAL_MATCH') return false;
  if (!best.trip?.id) return true;
  const code = best.reasonCode || '';
  return code.startsWith('ORPHAN_');
}

/**
 * Human label for personal-match reason codes shown in the Personal Use step.
 */
export function personalMatchReasonLabel(
  reasonCode?: string | null,
  reason?: string | null,
): string {
  switch (reasonCode) {
    case 'ORPHAN_NO_TRIP':
      return 'No trip that day';
    case 'ORPHAN_OUT_OF_WINDOW':
      return 'Trip too far away';
    case 'ORPHAN_NEARBY_UNEXPLAINED':
      return 'Nearby trip — confirm personal';
    case 'POST_TRIP_GAP':
      return 'After dropoff';
    default:
      break;
  }
  if (reason?.toLowerCase().includes('dropoff')) return 'After dropoff';
  if (reason?.toLowerCase().includes('personal')) return 'Personal — confirm';
  return 'Personal — confirm';
}

/**
 * Single source of truth for wizard step bucketing (client wizard + tests).
 *
 * Period reset clears tripId but keeps underpaid/deadhead/matched + matchedTripId.
 * Live rematch must not invent ORPHAN_* into Personal Use, and must not dump
 * clear underpaid/deadhead matches into Needs Review.
 */
export function resolveWizardBucket(
  tx: WizardBucketTx,
  best: Pick<MatchResult, 'matchType' | 'reasonCode' | 'reason' | 'isAmbiguous' | 'trip'> | undefined,
): TollBucket | null {
  if (isTollExcludedFromWizardBuckets(tx)) return null;

  const stage = tx.workflowStage as TollWorkflowStage | undefined;
  const resolvedStageBucket = stage ? bucketForWorkflowStage(stage) : undefined;
  if (resolvedStageBucket === null && stage) return null;

  const linkConfirmed = isTripLinkConfirmed(tx);
  const knownNonPersonal =
    stage === 'underpaid_pending' ||
    stage === 'deadhead_pending' ||
    (tx.matchStatus === 'matched' && stage !== 'personal_use_pending');

  // Live orphan guesses never override a persisted underpaid/deadhead/matched row.
  const orphanBest = best && isOrphanPersonalMatch(best) ? best : undefined;
  const usableBest = orphanBest && knownNonPersonal ? undefined : best;

  if (knownNonPersonal) {
    // Only true ambiguity belongs in Needs Review — not clear underpaid/deadhead.
    if (usableBest?.isAmbiguous && !linkConfirmed) return 'needs-review';
    if (usableBest) {
      const live = resolveTollBucket(tx, usableBest);
      if (live !== 'needs-review') return live;
    }
    if (stage === 'deadhead_pending' || tx.matchTypeCode === 'DEADHEAD_MATCH') {
      return 'deadhead';
    }
    if (stage === 'underpaid_pending' || tx.matchTypeCode === 'AMOUNT_VARIANCE') {
      return 'underpaid';
    }
    if (tx.matchTypeCode === 'PERFECT_MATCH') return 'underpaid';
    // Matched after reset with no live suggestion — stay on money steps, not Needs Review.
    return stage === 'deadhead_pending' ? 'deadhead' : 'underpaid';
  }

  if (orphanBest) {
    return 'personal-use';
  }

  if (stage === 'personal_use_pending' || tx.matchStatus === 'orphan_personal') {
    return 'personal-use';
  }

  const ambiguous =
    (usableBest?.isAmbiguous || tx.matchStatus === 'ambiguous' || tx.isAmbiguous === true) &&
    !linkConfirmed;
  if (ambiguous) return 'needs-review';

  const liveBucket = resolveTollBucket(tx, usableBest);
  if (liveBucket !== 'needs-review') return liveBucket;

  if (
    !usableBest &&
    isTagImportToll(tx) &&
    tx.matchStatus !== 'ambiguous' &&
    tx.matchStatus !== 'matched'
  ) {
    return 'personal-use';
  }

  if (usableBest?.matchType === 'PERSONAL_MATCH') {
    return bucketForBestMatch(usableBest);
  }

  if (resolvedStageBucket) return resolvedStageBucket;

  return liveBucket;
}
