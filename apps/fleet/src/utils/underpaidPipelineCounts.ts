import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { buildClaimByTollId, dedupeClaimsForDisplay } from './claimByToll';
import {
  isActionablePartialShortfall,
  isTollInWizardPeriod,
  isVisiblePartialShortfallClaim,
} from './tollWeekPeriod';
import {
  VARIANCE_THRESHOLD,
  buildTollFinancialsContext,
  buildTripRefundAllocation,
  calculateTollFinancials,
} from './tollReconciliation';

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
 */
export function computeUnderpaidPipelineCounts(input: {
  reconciledTolls: FinancialTransaction[];
  periodClaims: Claim[];
  allClaims: Claim[];
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  periodWeekKey: string;
  fleetTz: string;
}): UnderpaidPipelineCounts {
  const {
    reconciledTolls,
    periodClaims,
    allClaims,
    trips,
    disputeRefunds,
    periodWeekKey,
    fleetTz,
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

  let underpaidTolls = 0;
  for (const tx of reconciledTolls) {
    if (!tx.tripId) continue;
    if (!isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) continue;
    const trip = tripMap.get(tx.tripId);
    if (!trip) continue;
    const claim = claimByTollId.get(tx.id);
    if (partialByTollId.has(tx.id)) continue;
    if (claim && ['Sent_to_Driver', 'Submitted_to_Uber', 'Rejected'].includes(claim.status)) {
      continue;
    }
    if (claim?.status === 'Resolved' && !isActionablePartialShortfall(claim, reconciledTollById.get(tx.id))) {
      continue;
    }
    const ctx = buildTollFinancialsContext(tx, trip, claim, trips, disputeRefunds, allocation);
    const financials = calculateTollFinancials(tx, trip, claim, ctx);
    if (financials.netLoss <= VARIANCE_THRESHOLD) continue;
    underpaidTolls++;
  }

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
