import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { isActionablePartialShortfall, isTollInWizardPeriod } from './tollWeekPeriod';
import {
  VARIANCE_THRESHOLD,
  buildTollFinancialsContext,
  buildTripRefundAllocation,
  calculateTollFinancials,
  type TollFinancials,
} from './tollReconciliation';

/** Per-toll share of pooled trip refunds (from buildTripRefundAllocation). */
type TripRefundAllocation = Map<string, number>;

export type PendingUnderpaidTx = FinancialTransaction & { matchedTripId?: string | null };

/** Suggestion map shape used by UnderpaidClaimsStep / wizard (trip id only). */
export type PendingUnderpaidSuggestions = Map<
  string,
  Array<{ trip?: { id?: string } | null }>
>;

/** Trip id for a post-reset underpaid toll: live suggestion, else matchedTripId. */
export function resolvePendingUnderpaidTripId(
  tx: PendingUnderpaidTx,
  suggestions?: PendingUnderpaidSuggestions | null,
): string | null {
  return suggestions?.get(tx.id)?.[0]?.trip?.id || tx.matchedTripId || null;
}

export interface ListableUnderpaidCtx {
  claimByTollId: Map<string, Claim>;
  /** Toll ids already shown on Partially Covered — hide from Underpaid Tolls. */
  partialByTollId: ReadonlySet<string>;
  reconciledTollById: Map<string, FinancialTransaction>;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  allocation: TripRefundAllocation;
  periodWeekKey: string;
  fleetTz: string;
}

/**
 * Same gates as UnderpaidClaimsStep `pushLoss` — listable only when period-scoped,
 * not on another pipeline tab, and net shortfall exceeds tolerance.
 */
export function evaluateListableUnderpaidShortfall(
  tx: FinancialTransaction,
  trip: Trip,
  ctx: ListableUnderpaidCtx,
): { ok: true; financials: TollFinancials; claim: Claim | undefined } | { ok: false } {
  if (!isTollInWizardPeriod(tx, ctx.periodWeekKey, ctx.fleetTz)) return { ok: false };

  const claim = ctx.claimByTollId.get(tx.id);
  if (ctx.partialByTollId.has(tx.id)) return { ok: false };
  if (claim && ['Sent_to_Driver', 'Submitted_to_Uber', 'Rejected'].includes(claim.status)) {
    return { ok: false };
  }
  if (
    claim?.status === 'Resolved' &&
    !isActionablePartialShortfall(claim, ctx.reconciledTollById.get(tx.id))
  ) {
    return { ok: false };
  }

  const finCtx = buildTollFinancialsContext(
    tx,
    trip,
    claim,
    ctx.trips,
    ctx.disputeRefunds,
    ctx.allocation,
  );
  const financials = calculateTollFinancials(tx, trip, claim, finCtx);
  if (financials.netLoss <= VARIANCE_THRESHOLD) return { ok: false };

  return { ok: true, financials, claim };
}

/**
 * Count post-reset pending underpaid tolls that would appear on Underpaid Tolls.
 * Blind length of the underpaid bucket over-counts ghosts (no trip / $0 shortfall).
 */
export function countListablePendingUnderpaid(input: {
  pendingUnderpaidTolls: PendingUnderpaidTx[];
  suggestions?: PendingUnderpaidSuggestions | null;
  tripMap: Map<string, Trip>;
  claimByTollId: Map<string, Claim>;
  partialByTollId: ReadonlySet<string>;
  reconciledTollById: Map<string, FinancialTransaction>;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  /** When omitted, built from reconciledTollById values + tripMap. */
  allocation?: TripRefundAllocation;
  periodWeekKey: string;
  fleetTz: string;
}): number {
  const {
    pendingUnderpaidTolls,
    suggestions,
    tripMap,
    claimByTollId,
    partialByTollId,
    reconciledTollById,
    trips,
    disputeRefunds,
    periodWeekKey,
    fleetTz,
  } = input;

  const allocation =
    input.allocation ??
    buildTripRefundAllocation([...reconciledTollById.values()], tripMap);

  const ctx: ListableUnderpaidCtx = {
    claimByTollId,
    partialByTollId,
    reconciledTollById,
    trips,
    disputeRefunds,
    allocation,
    periodWeekKey,
    fleetTz,
  };

  let n = 0;
  const seen = new Set<string>();
  for (const tx of pendingUnderpaidTolls) {
    if (!tx?.id || seen.has(tx.id)) continue;
    const tripId = resolvePendingUnderpaidTripId(tx, suggestions);
    if (!tripId) continue;
    const trip = tripMap.get(tripId);
    if (!trip) continue;
    const linked = { ...tx, tripId };
    if (evaluateListableUnderpaidShortfall(linked, trip, ctx).ok) {
      seen.add(tx.id);
      n++;
    }
  }
  return n;
}
