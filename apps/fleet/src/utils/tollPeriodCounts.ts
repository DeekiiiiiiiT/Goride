/**
 * Shared toll-reconciliation period step counts — dependency-light so Deno
 * edge can import alongside tollReconPeriodStatus.ts.
 */
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import type { PeriodBucket } from './tollPeriodBucket.ts';
import {
  isClaimActionableNow,
  isClaimInformationalOnly,
  countUnclaimedUnderpaidAsPeriodActionable,
  type StepCounts,
  type StepId,
} from './tollPeriodStepTypes.ts';
import {
  isDisputeRefundInWizardPeriod,
  isDisputeRefundMatched,
  isTollCoveredByDisputeRefund,
  isVisiblePartialShortfallClaim,
} from './tollPeriodDisputeHelpers.ts';
import { isUnlinkedRefundActionableNow } from './unlinkedShortfallEligibility.ts';

export type { StepCounts, StepId };

/** Increment underpaid-claims for one claim — shared by landing single-pass and wizard batch. */
export function incrementUnderpaidClaimCount(
  counts: Record<StepId, StepCounts>,
  claim: Claim,
  toll: FinancialTransaction | undefined,
  disputeRefunds: DisputeRefund[],
): void {
  if (claim.status === 'Sent_to_Driver' || claim.status === 'Submitted_to_Uber') {
    counts['underpaid-claims'].informational++;
    return;
  }
  if (claim.status === 'Rejected') {
    counts['underpaid-claims'].actionable++;
    return;
  }
  if (claim.status === 'Open') {
    if (isTollCoveredByDisputeRefund(claim, disputeRefunds)) return;
    counts['underpaid-claims'].actionable++;
    return;
  }
  if (isVisiblePartialShortfallClaim(claim, toll ?? null, disputeRefunds)) {
    counts['underpaid-claims'].actionable++;
  }
}

/** Increment dispute-refunds for one refund row. */
export function incrementDisputeRefundCount(
  counts: Record<StepId, StepCounts>,
  refund: DisputeRefund,
): void {
  if (isDisputeRefundMatched(refund)) {
    counts['dispute-refunds'].informational++;
  } else {
    counts['dispute-refunds'].actionable++;
  }
}

/** Increment unlinked-refunds for one trip. */
export function incrementUnlinkedRefundCount(
  counts: Record<StepId, StepCounts>,
  trip: Trip,
  opts?: {
    suggestionStatus?: string | null;
    hasRecommendedShortfall?: boolean;
  },
): void {
  const actionable = isUnlinkedRefundActionableNow(trip, {
    suggestionStatus: opts?.suggestionStatus ?? null,
    hasRecommendedShortfall: opts?.hasRecommendedShortfall ?? false,
  });
  if (actionable) counts['unlinked-refunds'].actionable++;
  else counts['unlinked-refunds'].informational++;
}

/**
 * Landing: count one unclaimed toll into matching / underpaid buckets.
 * Skips trip-linked rows (mirrors toll_period_controller).
 */
export function incrementLandingUnclaimedTollCount(
  counts: Record<StepId, StepCounts>,
  tx: FinancialTransaction,
  bucket: PeriodBucket | null,
): void {
  if (tx.tripId) return;
  if (!bucket) return;
  if (bucket === 'underpaid-claims') {
    if (
      countUnclaimedUnderpaidAsPeriodActionable(bucket, {
        isReconciled: tx.isReconciled,
        hasTripId: !!tx.tripId,
      })
    ) {
      counts['underpaid-claims'].actionable++;
    }
    return;
  }
  if (bucket === 'needs-review' || bucket === 'personal-use' || bucket === 'deadhead') {
    counts[bucket].actionable++;
  }
}

/**
 * Per-step actionable/informational counts for one scoped period (wizard +
 * any caller with pre-classified buckets). Landing uses increment* helpers
 * in a single pass over all rows.
 */
export function computePeriodCounts(input: {
  classified: Record<'needs-review' | 'personal-use' | 'deadhead' | 'underpaid', FinancialTransaction[]>;
  underpaidClaims: Claim[];
  disputeRefunds: DisputeRefund[];
  unclaimedRefundTrips: Trip[];
  underpaidPipeline?: { actionable: number; informational: number };
  periodWeekKey?: string;
  fleetTz?: string;
  periodTollIds?: ReadonlySet<string>;
  periodClaimIds?: ReadonlySet<string>;
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
    underpaidPipeline?.actionable ?? classified.underpaid.length + actionableClaims;
  const underpaidInformational = underpaidPipeline?.informational ?? informationalClaims;

  return {
    'needs-review': { actionable: classified['needs-review'].length, informational: 0 },
    'personal-use': { actionable: classified['personal-use'].length, informational: 0 },
    deadhead: { actionable: classified.deadhead.length, informational: 0 },
    'underpaid-claims': {
      actionable: underpaidActionable,
      informational: underpaidInformational,
    },
    'dispute-refunds': { actionable: unmatchedDisputeRefunds, informational: matchedDisputeRefunds },
    'unlinked-refunds': { actionable: actionableUnlinked, informational: informationalUnlinked },
  };
}
