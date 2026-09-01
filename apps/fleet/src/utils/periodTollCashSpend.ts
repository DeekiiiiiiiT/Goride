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

export {
  isTripCashWashSpend,
  isTripTollActionable,
} from '../../../../packages/finance-core/src/periodTollTrip.ts';

export {
  isCashPaidTollRow,
  sumExcludedCashFromWeek,
} from '../../../../packages/finance-core/src/periodTollCashSpend.ts';
export type { PeriodTollLike } from '../../../../packages/finance-core/src/periodTollCashSpend.ts';

/** Settlement wash credit for a period row — re-export for fleet callers. */
export { resolvePeriodTollCashWash } from '../../../../packages/finance-core/src/periodTollCashWash.ts';
