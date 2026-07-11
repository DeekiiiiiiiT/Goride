import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import type { TollBucket } from './tollBucket';
import { isDisputeRefundMatched, isDisputeRefundInWizardPeriod } from './tollWeekPeriod';
import { isUnlinkedRefundActionableNow } from './unlinkedShortfallEligibility';

/**
 * The 6 steps of the period-gated reconciliation wizard, in their fixed,
 * hard-gated order. `underpaid-claims` folds in both underpaid tolls and
 * their downstream claims (formerly the separate "Claimable Loss" surface).
 */
export type StepId =
  | 'needs-review'
  | 'personal-use'
  | 'deadhead'
  | 'underpaid-claims'
  | 'dispute-refunds'
  | 'unlinked-refunds';

/**
 * Platform payments before Underpaid & Claims:
 * - Dispute Refunds: Uber Support corrections — matching can auto-reimburse a shortfall claim.
 * - Unlinked Refunds: trip toll credits with no linked expense — apply to underpaid claims
 *   before Charge Driver so leftover shortfall is all that remains to decide.
 */
export const STEP_ORDER: StepId[] = [
  'needs-review',
  'personal-use',
  'deadhead',
  'dispute-refunds',
  'unlinked-refunds',
  'underpaid-claims',
];

/**
 * A claim is "actionable now" if the fleet manager can do something about it
 * today — vs "informational" if it's just waiting on an external party
 * (Uber, the driver). Only actionable items may block period completion;
 * the user explicitly does not want the wizard to gate on things outside
 * their control. `Resolved` is neither — it's done.
 */
export function isClaimActionableNow(claim: Pick<Claim, 'status'>): boolean {
  switch (claim.status) {
    case 'Sent_to_Driver':
    case 'Submitted_to_Uber':
      return false;
    case 'Resolved':
      return false;
    case 'Rejected':
    case 'Open':
    default:
      return true;
  }
}

export function isClaimInformationalOnly(claim: Pick<Claim, 'status'>): boolean {
  return claim.status === 'Sent_to_Driver' || claim.status === 'Submitted_to_Uber';
}

export interface StepCounts {
  actionable: number;
  informational: number;
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
  const {
    classified,
    underpaidClaims,
    disputeRefunds,
    unclaimedRefundTrips,
    underpaidPipeline,
    periodWeekKey,
    fleetTz,
    periodTollIds,
    periodClaimIds,
    unlinkedSuggestionStatusByTripId,
    unlinkedRecommendedShortfallTripIds,
  } = input;

  const scopedDisputeRefunds =
    periodWeekKey && fleetTz
      ? disputeRefunds.filter((r) =>
          isDisputeRefundInWizardPeriod(r, periodWeekKey, fleetTz, periodTollIds, periodClaimIds),
        )
      : disputeRefunds;

  const actionableClaims = underpaidClaims.filter(isClaimActionableNow).length;
  const informationalClaims = underpaidClaims.filter(isClaimInformationalOnly).length;

  const unmatchedDisputeRefunds = scopedDisputeRefunds.filter((r) => !isDisputeRefundMatched(r)).length;
  const matchedDisputeRefunds = scopedDisputeRefunds.filter(isDisputeRefundMatched).length;

  let actionableUnlinked = 0;
  let informationalUnlinked = 0;
  for (const t of unclaimedRefundTrips) {
    const actionable = isUnlinkedRefundActionableNow(t, {
      suggestionStatus: unlinkedSuggestionStatusByTripId?.get(t.id) ?? null,
      hasRecommendedShortfall: unlinkedRecommendedShortfallTripIds?.has(t.id) ?? false,
    });
    if (actionable) actionableUnlinked++;
    else informationalUnlinked++;
  }

  const underpaidActionable =
    underpaidPipeline?.actionable ??
    classified['underpaid'].length + actionableClaims;
  const underpaidInformational =
    underpaidPipeline?.informational ?? informationalClaims;

  return {
    'needs-review': { actionable: classified['needs-review'].length, informational: 0 },
    'personal-use': { actionable: classified['personal-use'].length, informational: 0 },
    'deadhead': { actionable: classified['deadhead'].length, informational: 0 },
    'underpaid-claims': {
      actionable: underpaidActionable,
      informational: underpaidInformational,
    },
    'dispute-refunds': { actionable: unmatchedDisputeRefunds, informational: matchedDisputeRefunds },
    'unlinked-refunds': { actionable: actionableUnlinked, informational: informationalUnlinked },
  };
}
