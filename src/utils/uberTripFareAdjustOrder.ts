/**
 * Uber `payments_transaction.csv` — rows with Description `trip fare adjust order` carry
 * “Adjustments from previous periods” in the app. Amounts often appear in the Tip column; use
 * `isUberTripFareAdjustOrderDescription` before classifying column values as tips.
 */

/** Normalized primary token (trim, lower-case, single spaces). */
export const UBER_PAYMENTS_TX_DESCRIPTION_TRIP_FARE_ADJUST_ORDER = 'trip fare adjust order';

export function normalizeUberPaymentsTransactionDescription(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Primary match: normalized description equals `trip fare adjust order`.
 * Secondary: same token followed by space (e.g. locale suffixes) — not a loose substring match on "adjustment".
 */
export function isUberTripFareAdjustOrderDescription(raw: unknown): boolean {
  const n = normalizeUberPaymentsTransactionDescription(raw);
  if (n === UBER_PAYMENTS_TX_DESCRIPTION_TRIP_FARE_ADJUST_ORDER) return true;
  if (n.startsWith(UBER_PAYMENTS_TX_DESCRIPTION_TRIP_FARE_ADJUST_ORDER + ' ')) return true;
  return false;
}
