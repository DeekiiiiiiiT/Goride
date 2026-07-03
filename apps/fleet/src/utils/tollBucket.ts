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
