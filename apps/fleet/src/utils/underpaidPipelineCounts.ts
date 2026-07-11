import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { buildClaimByTollId, dedupeClaimsForDisplay } from './claimByToll';
import {
  isTollInWizardPeriod,
  isVisiblePartialShortfallClaim,
} from './tollWeekPeriod';
import { buildTripRefundAllocation } from './tollReconciliation';
import {
  countListablePendingUnderpaid,
  evaluateListableUnderpaidShortfall,
  type PendingUnderpaidSuggestions,
  type PendingUnderpaidTx,
} from './pendingUnderpaidListable';

export interface UnderpaidPipelineCounts {
  underpaidTolls: number;
  partialShortfalls: number;
  disputeLost: number;
  awaitingDriver: number;
  pendingReimbursement: number;
  /** Matches visible tabs that still need a fleet decision. */
  actionable: number;
  /** Waiting on driver or Uber — visible but non-blocking. */
  informational: number;
}

/**
 * Same rules as UnderpaidClaimsStep tab lists — used for wizard step completion.
 * Optional pendingUnderpaidTolls count only listable shortfalls (not bucket length).
 */
export function computeUnderpaidPipelineCounts(input: {
  reconciledTolls: FinancialTransaction[];
  periodClaims: Claim[];
  allClaims: Claim[];
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  periodWeekKey: string;
  fleetTz: string;
  /** Unreconciled underpaid after reset — only listable rows add to actionable. */
  pendingUnderpaidTolls?: PendingUnderpaidTx[];
  suggestions?: PendingUnderpaidSuggestions | null;
}): UnderpaidPipelineCounts {
  const {
    reconciledTolls,
    periodClaims,
    allClaims,
    trips,
    disputeRefunds,
    periodWeekKey,
    fleetTz,
    pendingUnderpaidTolls = [],
    suggestions,
  } = input;

  const tripMap = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
  const claimByTollId = buildClaimByTollId(allClaims);
  const reconciledTollById = new Map(reconciledTolls.map((t) => [t.id, t]));
  const allocation = buildTripRefundAllocation(reconciledTolls, tripMap);

  const visibleTollIds = new Set<string>();
  for (const tx of reconciledTolls) {
    if (tx?.id && isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) visibleTollIds.add(tx.id);
  }
  for (const c of periodClaims) {
    if (c.transactionId) visibleTollIds.add(c.transactionId);
  }

  const partialClaims = dedupeClaimsForDisplay(
    periodClaims.filter((c) => {
      if (!c.transactionId || !visibleTollIds.has(c.transactionId)) return false;
      return isVisiblePartialShortfallClaim(
        c,
        reconciledTollById.get(c.transactionId),
        disputeRefunds,
      );
    }),
  ).displayClaims;
  const partialByTollId = new Set(partialClaims.map((c) => c.transactionId!));

  const listableCtx = {
    claimByTollId,
    partialByTollId,
    reconciledTollById,
    trips,
    disputeRefunds,
    allocation,
    periodWeekKey,
    fleetTz,
  };

  let underpaidTolls = 0;
  for (const tx of reconciledTolls) {
    if (!tx.tripId) continue;
    const trip = tripMap.get(tx.tripId);
    if (!trip) continue;
    if (evaluateListableUnderpaidShortfall(tx, trip, listableCtx).ok) underpaidTolls++;
  }

  const pendingListable = countListablePendingUnderpaid({
    pendingUnderpaidTolls,
    suggestions,
    tripMap,
    claimByTollId,
    partialByTollId,
    reconciledTollById,
    trips,
    disputeRefunds,
    allocation,
    periodWeekKey,
    fleetTz,
  });
  underpaidTolls += pendingListable;

  const awaitingDriver = dedupeClaimsForDisplay(
    periodClaims.filter((c) => c.status === 'Sent_to_Driver'),
  ).displayClaims.length;
  const pendingReimbursement = dedupeClaimsForDisplay(
    periodClaims.filter((c) => c.status === 'Submitted_to_Uber'),
  ).displayClaims.length;
  const disputeLost = dedupeClaimsForDisplay(
    periodClaims.filter((c) => c.status === 'Rejected'),
  ).displayClaims.length;

  const actionable = underpaidTolls + partialClaims.length + disputeLost;
  const informational = awaitingDriver + pendingReimbursement;

  return {
    underpaidTolls,
    partialShortfalls: partialClaims.length,
    disputeLost,
    awaitingDriver,
    pendingReimbursement,
    actionable,
    informational,
  };
}
