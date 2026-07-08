import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import type { TollBucket } from './tollBucket';
import { isDisputeRefundMatched } from './tollWeekPeriod';
import { isPendingOnlyRefundResolution } from './unlinkedShortfallEligibility';

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
}): Record<StepId, StepCounts> {
  const { classified, underpaidClaims, disputeRefunds, unclaimedRefundTrips } = input;

  const actionableClaims = underpaidClaims.filter(isClaimActionableNow).length;
  const informationalClaims = underpaidClaims.filter(isClaimInformationalOnly).length;

  const unmatchedDisputeRefunds = disputeRefunds.filter((r) => !isDisputeRefundMatched(r)).length;
  const matchedDisputeRefunds = disputeRefunds.filter(isDisputeRefundMatched).length;

  // Pending-import unlinked rows stay visible but must not block Finish —
  // only truly unresolved (no resolution yet) stay actionable.
  const actionableUnlinked = unclaimedRefundTrips.filter((t) => !isPendingOnlyRefundResolution(t)).length;
  const informationalUnlinked = unclaimedRefundTrips.filter(isPendingOnlyRefundResolution).length;

  return {
    'needs-review': { actionable: classified['needs-review'].length, informational: 0 },
    'personal-use': { actionable: classified['personal-use'].length, informational: 0 },
    'deadhead': { actionable: classified['deadhead'].length, informational: 0 },
    'underpaid-claims': {
      actionable: classified['underpaid'].length + actionableClaims,
      informational: informationalClaims,
    },
    'dispute-refunds': { actionable: unmatchedDisputeRefunds, informational: matchedDisputeRefunds },
    'unlinked-refunds': { actionable: actionableUnlinked, informational: informationalUnlinked },
  };
}
