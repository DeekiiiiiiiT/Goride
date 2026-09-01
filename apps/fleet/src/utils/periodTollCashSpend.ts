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
export {
  isTripCashWashSpend,
  isTripTollActionable,
} from '../../../../packages/finance-core/src/periodTollTrip.ts';

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

/** Settlement wash credit for a period row — re-export for fleet callers. */
export { resolvePeriodTollCashWash } from '../../../../packages/finance-core/src/periodTollCashWash.ts';
