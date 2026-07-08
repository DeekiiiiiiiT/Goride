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
