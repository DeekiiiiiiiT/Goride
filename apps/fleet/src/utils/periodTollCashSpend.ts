/**
 * Shared toll cash / spend rules for driver financial period rebuild.
 * Must stay aligned with Toll Recon (cash_wash-only trip add-on + linked trip set).
 */

export type PeriodTollLike = {
  id?: string | null;
  tripId?: string | null;
  preUnlinkedTripId?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PeriodTripLike = {
  id?: string | null;
  tollCharges?: number | null;
  tollRefundResolution?: { status?: string | null } | null;
  dropoffTime?: string | null;
  date?: string | null;
  platform?: string | null;
};

/** Confirmed toll↔trip links (same as collectLinkedTripIds on the server). */
export function collectConfirmedLinkedTripIds(tolls: PeriodTollLike[]): Set<string> {
  const ids = new Set<string>();
  for (const tx of tolls || []) {
    if (!tx) continue;
    const tripId = tx.tripId ?? (tx.metadata?.tripId as string | null | undefined) ?? null;
    if (tripId) ids.add(String(tripId));
    const pre =
      tx.preUnlinkedTripId ??
      (tx.metadata?.preUnlinkedTripId as string | null | undefined) ??
      null;
    if (pre) ids.add(String(pre));
  }
  return ids;
}

export function isCashPaidTollRow(tx: PeriodTollLike): boolean {
  const pm = String(tx?.paymentMethod || '').toLowerCase();
  // Receipt is proof only — payment method controls settlement cash wash.
  return pm.includes('cash');
}

/**
 * Trip plaza cash that still belongs in Expenses/Settlement wash.
 * Pending unlinked refunds are reimbursements only — never inflate cash spend.
 */
export function isTripCashWashSpend(
  trip: PeriodTripLike,
  linkedTripIds: Set<string>,
): boolean {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return false;
  const amt = Math.abs(Number(trip.tollCharges) || 0);
  if (amt <= 0.005) return false;
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom' || status === 'expense_logged') return false;
  return status === 'cash_wash';
}

/**
 * Unlinked trip tolls that must block finalization without crediting cash wash.
 * pending / null / undefined count as actionable; phantom / expense_logged / cash_wash do not
 * (cash_wash is handled via isTripCashWashSpend).
 */
export function isTripTollActionable(
  trip: PeriodTripLike,
  linkedTripIds: Set<string>,
): boolean {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return false;
  const amt = Math.abs(Number(trip.tollCharges) || 0);
  if (amt <= 0.005) return false;
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom' || status === 'expense_logged' || status === 'cash_wash') {
    return false;
  }
  // pending, null, undefined, or any other unresolved status
  return !status || status === 'pending';
}

export function sumExcludedCashFromWeek(
  weekTollsIncludingExcluded: PeriodTollLike[],
  isIncludedInSpend: (t: PeriodTollLike) => boolean,
): { excludedCashSpend: number; excludedCashCount: number } {
  let excludedCashSpend = 0;
  let excludedCashCount = 0;
  for (const tx of weekTollsIncludingExcluded || []) {
    if (!isCashPaidTollRow(tx)) continue;
    if (isIncludedInSpend(tx)) continue;
    const amt = Math.abs(Number(tx.amount) || 0);
    if (amt <= 0.005) continue;
    excludedCashSpend += amt;
    excludedCashCount += 1;
  }
  return {
    excludedCashSpend: Math.round(excludedCashSpend * 100) / 100,
    excludedCashCount,
  };
}

/**
 * Settlement wash credit for a period row.
 * Prefers metadata.financeCore.tollCashWashEligible (post NEW-4);
 * legacy rows stored wash in tollCashSpend.
 */
export function resolvePeriodTollCashWash(p: {
  tollCashSpend?: number | null;
  metadata?: Record<string, unknown> | null;
}): number {
  const fc = (p.metadata as any)?.financeCore;
  if (fc != null && fc.tollCashWashEligible != null && Number.isFinite(Number(fc.tollCashWashEligible))) {
    return Math.round(Math.max(0, Number(fc.tollCashWashEligible)) * 100) / 100;
  }
  return Math.round(Math.max(0, Number(p.tollCashSpend) || 0) * 100) / 100;
}
