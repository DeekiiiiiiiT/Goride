import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { isActionablePartialShortfall, isTollInWizardPeriod } from './tollWeekPeriod';
import {
  VARIANCE_THRESHOLD,
  buildTollFinancialsContext,
  buildTripRefundAllocation,
  calculateTollFinancials,
  spentUnlinkedCreditsByTripId,
  type TollFinancials,
} from './tollReconciliation';

/** Per-toll share of pooled trip refunds (from buildTripRefundAllocation). */
type TripRefundAllocation = Map<string, number>;

export type PendingUnderpaidTx = FinancialTransaction & { matchedTripId?: string | null };

/** Suggestion map — embedded trip is a fallback when the trips dump omitted the row. */
export type PendingUnderpaidSuggestions = Map<
  string,
  Array<{ trip?: (Partial<Trip> & { id?: string }) | null }>
>;

/** Trip id for a post-reset underpaid toll: live suggestion, else matchedTripId. */
export function resolvePendingUnderpaidTripId(
  tx: PendingUnderpaidTx,
  suggestions?: PendingUnderpaidSuggestions | null,
): string | null {
  return suggestions?.get(tx.id)?.[0]?.trip?.id || tx.matchedTripId || null;
}

/**
 * Resolve the trip used for underpaid financials. Prefer the full trips list;
 * fall back to the suggestion stub so Finish cannot hide open tolls when the
 * trips dump is incomplete or still loading.
 */
export function resolvePendingUnderpaidTrip(
  tx: PendingUnderpaidTx,
  tripMap: Map<string, Trip>,
  suggestions?: PendingUnderpaidSuggestions | null,
): Trip | null {
  const tripId = resolvePendingUnderpaidTripId(tx, suggestions);
  if (!tripId) return null;
  const fromMap = tripMap.get(tripId);
  if (fromMap) return fromMap;
  const stub = suggestions?.get(tx.id)?.[0]?.trip;
  if (!stub || stub.id !== tripId) return null;
  return {
    id: tripId,
    date: stub.date || tx.date,
    platform: stub.platform || 'Uber',
    status: stub.status || 'Completed',
    tollCharges: Number(stub.tollCharges) || 0,
    driverId: stub.driverId || tx.driverId,
    driverName: stub.driverName || tx.driverName,
    pickupLocation: stub.pickupLocation,
    dropoffLocation: stub.dropoffLocation,
    amount: stub.amount,
    requestTime: stub.requestTime,
    dropoffTime: stub.dropoffTime,
    vehicleId: stub.vehicleId,
    duration: stub.duration,
    distance: stub.distance,
    serviceType: stub.serviceType,
  } as Trip;
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
 * Fully covered pending rows are NOT listable — auto-clear them to matched instead.
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
 * Link pending underpaid rows to their trip for refund pooling (matchedTripId /
 * suggestion). Without this, siblings each credit the full trip refund and
 * disappear behind netLoss <= 0.
 */
export function linkPendingUnderpaidToTrips(
  pendingUnderpaidTolls: PendingUnderpaidTx[],
  suggestions?: PendingUnderpaidSuggestions | null,
): Array<PendingUnderpaidTx & { tripId: string }> {
  const out: Array<PendingUnderpaidTx & { tripId: string }> = [];
  for (const tx of pendingUnderpaidTolls) {
    if (!tx?.id) continue;
    const tripId = resolvePendingUnderpaidTripId(tx, suggestions);
    if (!tripId) continue;
    out.push({ ...tx, tripId });
  }
  return out;
}

function buildPendingAwareCtx(input: {
  pendingUnderpaidTolls: PendingUnderpaidTx[];
  suggestions?: PendingUnderpaidSuggestions | null;
  tripMap: Map<string, Trip>;
  claimByTollId: Map<string, Claim>;
  partialByTollId: ReadonlySet<string>;
  reconciledTollById: Map<string, FinancialTransaction>;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  allocation?: TripRefundAllocation;
  periodWeekKey: string;
  fleetTz: string;
}): { linkedPending: Array<PendingUnderpaidTx & { tripId: string }>; ctx: ListableUnderpaidCtx } {
  const linkedPending = linkPendingUnderpaidToTrips(
    input.pendingUnderpaidTolls,
    input.suggestions,
  );
  const reconciled = [...input.reconciledTollById.values()];
  const spentByTripId = spentUnlinkedCreditsByTripId({
    claims: [...input.claimByTollId.values()],
    disputeRefunds: input.disputeRefunds,
    tolls: reconciled,
  });
  // Suggestion stubs must seed tripById so spent-adjusted pools still build
  // when the trips dump omitted the row.
  const tripById = new Map(input.tripMap);
  for (const tx of linkedPending) {
    if (tripById.has(tx.tripId)) continue;
    const trip = resolvePendingUnderpaidTrip(tx, input.tripMap, input.suggestions);
    if (trip) tripById.set(trip.id, trip);
  }
  const allocation =
    input.allocation ??
    buildTripRefundAllocation([...reconciled, ...linkedPending], tripById, spentByTripId);
  return {
    linkedPending,
    ctx: {
      claimByTollId: input.claimByTollId,
      partialByTollId: input.partialByTollId,
      reconciledTollById: input.reconciledTollById,
      trips: input.trips,
      disputeRefunds: input.disputeRefunds,
      allocation,
      periodWeekKey: input.periodWeekKey,
      fleetTz: input.fleetTz,
    },
  };
}

/**
 * Count pending underpaid tolls with a real shortfall (Underpaid Tolls tab + Finish).
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
  allocation?: TripRefundAllocation;
  periodWeekKey: string;
  fleetTz: string;
}): number {
  const { linkedPending, ctx } = buildPendingAwareCtx(input);
  let n = 0;
  const seen = new Set<string>();
  for (const tx of linkedPending) {
    if (seen.has(tx.id)) continue;
    const trip = resolvePendingUnderpaidTrip(tx, input.tripMap, input.suggestions);
    if (!trip) continue;
    if (evaluateListableUnderpaidShortfall(tx, trip, ctx).ok) {
      seen.add(tx.id);
      n++;
    }
  }
  return n;
}

export type CoveredPendingClear = {
  transaction: PendingUnderpaidTx & { tripId: string };
  trip: Trip;
  financials: TollFinancials;
};

/**
 * Pending underpaid whose trip refund pool already covers the toll (netLoss ≈ 0).
 * These should be auto-reconciled to the trip — not shown on Underpaid Tolls.
 */
export function listFullyCoveredPendingUnderpaid(input: {
  pendingUnderpaidTolls: PendingUnderpaidTx[];
  suggestions?: PendingUnderpaidSuggestions | null;
  tripMap: Map<string, Trip>;
  claimByTollId: Map<string, Claim>;
  partialByTollId: ReadonlySet<string>;
  reconciledTollById: Map<string, FinancialTransaction>;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  allocation?: TripRefundAllocation;
  periodWeekKey: string;
  fleetTz: string;
}): CoveredPendingClear[] {
  const { linkedPending, ctx } = buildPendingAwareCtx(input);
  const out: CoveredPendingClear[] = [];
  const seen = new Set<string>();

  for (const tx of linkedPending) {
    if (seen.has(tx.id)) continue;
    if (!isTollInWizardPeriod(tx, ctx.periodWeekKey, ctx.fleetTz)) continue;

    const claim = ctx.claimByTollId.get(tx.id);
    if (ctx.partialByTollId.has(tx.id)) continue;
    if (claim && ['Sent_to_Driver', 'Submitted_to_Uber', 'Rejected', 'Open'].includes(claim.status)) {
      continue;
    }

    const trip = resolvePendingUnderpaidTrip(tx, input.tripMap, input.suggestions);
    if (!trip) continue;

    const finCtx = buildTollFinancialsContext(
      tx,
      trip,
      claim,
      ctx.trips,
      ctx.disputeRefunds,
      ctx.allocation,
    );
    const financials = calculateTollFinancials(tx, trip, claim, finCtx);
    if (financials.netLoss > VARIANCE_THRESHOLD) continue;

    seen.add(tx.id);
    out.push({ transaction: tx, trip, financials });
  }
  return out;
}

/** Compact underpaid shortfall row for Dispute Refund match "This period" list. */
export type PeriodDisputeShortfall = {
  tollId: string;
  date: string;
  driverName: string;
  tollAmount: number;
  tripRefund: number;
  shortfall: number;
  tripId: string | null;
  claimId: string | null;
};

/**
 * Same shortfalls as Underpaid & Claims "Underpaid Tolls" for this period —
 * used so Dispute Refund match can offer every period shortfall, not only the
 * sparse match-candidates API bare-toll set.
 */
export function listPeriodUnderpaidShortfallsForDispute(input: {
  reconciledTolls: FinancialTransaction[];
  pendingUnderpaidTolls: PendingUnderpaidTx[];
  suggestions?: PendingUnderpaidSuggestions | null;
  tripMap: Map<string, Trip>;
  claimByTollId: Map<string, Claim>;
  partialByTollId: ReadonlySet<string>;
  reconciledTollById: Map<string, FinancialTransaction>;
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  periodWeekKey: string;
  fleetTz: string;
}): PeriodDisputeShortfall[] {
  const { linkedPending, ctx } = buildPendingAwareCtx(input);
  const seen = new Set<string>();
  const rows: PeriodDisputeShortfall[] = [];

  const push = (tx: FinancialTransaction, trip: Trip) => {
    if (seen.has(tx.id)) return;
    const result = evaluateListableUnderpaidShortfall(tx, trip, ctx);
    if (!result.ok) return;
    seen.add(tx.id);
    const tollAmount = Math.abs(Number(tx.amount) || 0);
    const shortfall = Math.abs(result.financials.netLoss);
    const tripRefund = Math.max(0, tollAmount - shortfall);
    rows.push({
      tollId: tx.id,
      date: String(tx.date || ''),
      driverName: String(tx.driverName || 'Unknown'),
      tollAmount,
      tripRefund,
      shortfall,
      tripId: trip.id || null,
      claimId: result.claim?.id || null,
    });
  };

  for (const tx of input.reconciledTolls) {
    if (!tx.tripId) continue;
    const trip = input.tripMap.get(tx.tripId);
    if (!trip) continue;
    push(tx, trip);
  }

  for (const tx of linkedPending) {
    if (seen.has(tx.id)) continue;
    const trip = resolvePendingUnderpaidTrip(tx, input.tripMap, input.suggestions);
    if (!trip) continue;
    push({ ...tx, tripId: trip.id }, trip);
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
