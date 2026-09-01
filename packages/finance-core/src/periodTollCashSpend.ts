/**
 * Toll cash spend helpers for period projection (finance-core).
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

export function isCashPaidTollRow(tx: PeriodTollLike): boolean {
  const pm = String(tx?.paymentMethod || '').toLowerCase();
  return pm.includes('cash');
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
