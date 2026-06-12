import type { RideRequestRow } from '@roam/types/rides';

export function isCashRide(ride: Pick<RideRequestRow, 'payment_method'> | null | undefined): boolean {
  return (ride?.payment_method ?? 'cash') === 'cash';
}

export function isAwaitingCashSettlement(
  ride: Pick<RideRequestRow, 'status' | 'payment_method'> | null | undefined,
): boolean {
  return Boolean(ride && ride.status === 'awaiting_cash_settlement' && isCashRide(ride));
}
