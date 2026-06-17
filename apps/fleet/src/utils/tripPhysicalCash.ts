import type { Trip } from '../types/data';

/**
 * Physical cash the driver collected on a trip (for cash wallet / settlement).
 * Only counts cash when there is explicit evidence — never assumes Roam/InDrive
 * card trips are cash just because of platform name.
 */
export function getTripPhysicalCashCollected(trip: Pick<Trip, 'cashCollected' | 'paymentMethod' | 'platform' | 'amount'>): number {
  const raw = Math.abs(Number(trip.cashCollected ?? 0));
  if (raw > 0.005) return raw;

  const pm = String(trip.paymentMethod ?? '').trim().toLowerCase();
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
