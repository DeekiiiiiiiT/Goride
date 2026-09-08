/** Minimal shape — do not import apps/fleet types (Deno edge packager / BOOT_ERROR). */
type TripCashLike = {
  cashCollected?: number;
  paymentMethod?: string;
  platform?: string;
  amount?: number;
};

const NON_CASH_PAYMENT_METHODS = new Set([
  'card',
  'credit',
  'debit',
  'digital',
  'bank',
  'wallet',
  'in-app',
  'in app',
  'online',
  'transfer',
]);

export function getTripPhysicalCashCollected(
  trip: Pick<TripCashLike, 'cashCollected' | 'paymentMethod' | 'platform' | 'amount'>,
): number {
  const pm = String(trip.paymentMethod ?? '').trim().toLowerCase();
  if (pm && NON_CASH_PAYMENT_METHODS.has(pm)) return 0;

  // Present cashCollected (including 0) is authoritative — never invent from fare.
  // Amount fallback is only for legacy Cash trips that never had the field.
  if (trip.cashCollected != null && Number.isFinite(Number(trip.cashCollected))) {
    const raw = Math.abs(Number(trip.cashCollected));
    return raw > 0.005 ? raw : 0;
  }

  if (pm === 'cash') return Math.abs(Number(trip.amount ?? 0));

  const platform = String(trip.platform ?? '').trim().toLowerCase();
  if (platform === 'cash' || platform === 'private') {
    return Math.abs(Number(trip.amount ?? 0));
  }

  return 0;
}

export function sumTripPhysicalCashCollected(
  trips: Pick<TripCashLike, 'cashCollected' | 'paymentMethod' | 'platform' | 'amount'>[],
): number {
  return trips.reduce((sum, trip) => sum + getTripPhysicalCashCollected(trip), 0);
}
