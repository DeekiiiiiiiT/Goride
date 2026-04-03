/**
 * Uber `payments_transaction.csv` — rows with Description `trip fare adjust order` carry
 * amounts that can represent either real tips (extra gratuity) or “Adjustments from previous periods”.
 *
 * This file only detects the row type. The actual classification (tip vs prior-period adjustment)
 * is done later in `csvHelpers.ts` using whether the Trip UUID exists in Uber `trip_activity` exports.
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
