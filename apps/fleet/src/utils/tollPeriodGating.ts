import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import type { TollBucket } from './tollBucket';
import { computePeriodCounts } from './tollPeriodCounts';

export type { StepId, StepCounts } from './tollPeriodStepTypes';
export {
  isClaimActionableNow,
  isClaimInformationalOnly,
  countUnclaimedUnderpaidAsPeriodActionable,
} from './tollPeriodStepTypes';
import type { StepCounts, StepId } from './tollPeriodStepTypes';

/**
 * The 6 steps of the period-gated reconciliation wizard, in their fixed,
 * hard-gated order. `underpaid-claims` folds in both underpaid tolls and
 * their downstream claims (formerly the separate "Claimable Loss" surface).
 */

/**
 * Platform payments before Underpaid & Claims (correct settlement order):
 * - Unlinked Refunds: normal trip toll credits first — apply/link to the toll,
 *   leave only the true shortfall.
 * - Dispute Refunds: Support Adjustment top-ups settle that remaining shortfall.
 * - Underpaid & Claims: Charge Driver / write-off only on what is still open.
 */
export const STEP_ORDER: StepId[] = [
  'needs-review',
  'personal-use',
  'deadhead',
  'unlinked-refunds',
  'dispute-refunds',
  'underpaid-claims',
];

/**
 * Period-landing underpaid claim classification — mirrored in
 * toll_period_controller.applyUnderpaidClaimCounts. Open/Rejected block
 * Completed; waiting states are informational; Resolved only blocks when a
 * visible partial shortfall remains.
 */
export type PeriodUnderpaidClaimClass = 'actionable' | 'informational' | 'done';

export function classifyPeriodUnderpaidClaim(
  claim: Pick<Claim, 'status'>,
  opts?: { isVisiblePartialShortfall?: boolean },
): PeriodUnderpaidClaimClass {
  if (claim.status === 'Sent_to_Driver' || claim.status === 'Submitted_to_Uber') {
    return 'informational';
  }
  if (claim.status === 'Rejected' || claim.status === 'Open') {
    return 'actionable';
  }
  if (opts?.isVisiblePartialShortfall) return 'actionable';
  return 'done';
}

/**
 * Per-step actionable/informational counts for one period. All inputs must
 * already be scoped to the period (and driver/platform, if applicable) by
 * the caller — this function only classifies, it never fetches or filters
 * by date itself.
 */
export function computeStepCounts(input: {
  classified: Record<TollBucket, FinancialTransaction[]>;
  underpaidClaims: Claim[];
  disputeRefunds: DisputeRefund[];
  unclaimedRefundTrips: Trip[];
  /** When set, replaces legacy underpaid bucket + open-claim tally. */
  underpaidPipeline?: { actionable: number; informational: number };
  /** When set with fleetTz, scopes dispute-refunds counts to this wizard week. */
  periodWeekKey?: string;
  fleetTz?: string;
  periodTollIds?: ReadonlySet<string>;
  periodClaimIds?: ReadonlySet<string>;
  /**
   * Optional Unlinked signals so pending-hold rows with Apply / Accept stay actionable.
   * Keys are trip ids.
   */
  unlinkedSuggestionStatusByTripId?: ReadonlyMap<string, string>;
  unlinkedRecommendedShortfallTripIds?: ReadonlySet<string>;
}): Record<StepId, StepCounts> {
  return computePeriodCounts(input);
}
