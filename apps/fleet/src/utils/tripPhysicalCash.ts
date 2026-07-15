import type { Trip } from '../types/data';

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

/**
 * Physical cash the driver collected on a trip (for cash wallet / settlement).
 * Only counts cash when there is explicit evidence — never assumes Roam/InDrive
 * card trips are cash just because of platform name.
 * Explicit non-cash paymentMethod wins over a stale cashCollected amount.
 */
export function getTripPhysicalCashCollected(trip: Pick<Trip, 'cashCollected' | 'paymentMethod' | 'platform' | 'amount'>): number {
  const pm = String(trip.paymentMethod ?? '').trim().toLowerCase();
  if (pm && NON_CASH_PAYMENT_METHODS.has(pm)) return 0;

  const raw = Math.abs(Number(trip.cashCollected ?? 0));
  if (raw > 0.005) return raw;

  if (pm === 'cash') return Math.abs(Number(trip.amount ?? 0));

  const platform = String(trip.platform ?? '').trim().toLowerCase();
  if (platform === 'cash' || platform === 'private') {
    return Math.abs(Number(trip.amount ?? 0));
  }

  return 0;
}

export function sumTripPhysicalCashCollected(
  trips: Pick<Trip, 'cashCollected' | 'paymentMethod' | 'platform' | 'amount'>[],
): number {
  return trips.reduce((sum, trip) => sum + getTripPhysicalCashCollected(trip), 0);
}
