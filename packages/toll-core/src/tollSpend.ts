/**
 * Shared Toll Spend formula (TR-H1) — landing /periods and wizard cards must agree.
 *
 * Spend = plaza ledger debits (negative usage amounts)
 *       + cash-wash trips with no linked tag debit (driver paid cash at plaza).
 * Pending Unlinked Refunds are reimbursements only — never spend.
 */

/** Absolute plaza debit from a toll ledger / financial_transaction row. */
export function ledgerDebitSpendAmount(tx: {
  amount?: number | null;
}): number {
  const amt = Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0;
  return amt > 0 ? amt : 0;
}

/**
 * Extra plaza spend that never hit the tag: cash-wash trip, unlinked.
 * Returns 0 when the trip is linked or not cash_wash.
 */
export function cashWashTripSpendAmount(
  trip: {
    id?: string | null;
    tollCharges?: number | null;
    tollRefundResolution?: { status?: string | null } | null;
  },
  linkedTripIds: ReadonlySet<string>,
): number {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return 0;
  if (trip.tollRefundResolution?.status !== 'cash_wash') return 0;
  const tc = Math.abs(Number(trip.tollCharges) || 0);
  return tc > 0 ? tc : 0;
}

/**
 * A charged personal toll is reconciled and has no trip. It used to match
 * both lists, so Toll Spend added it twice. It belongs on the reconciled
 * list only.
 */
export function isOpenUnreconciledToll(tx: {
  isReconciled?: boolean | null;
  tripId?: string | null;
  resolution?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  status?: string | null;
}): boolean {
  const isCashClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
  if (isCashClaim) {
    return String(tx.status || '') === 'Pending' && !tx.isReconciled;
  }
  if (!tx.isReconciled) return true;
  return !tx.tripId && !String(tx.resolution || '').trim();
}

/** First copy wins. Overlapping reconciled and unreconciled rows count once. */
export function uniqueTollRowsById<T extends { id?: string | null }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = row?.id ? String(row.id) : '';
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(row);
  }
  return out;
}
