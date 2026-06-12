import type { RideRequestRow } from '@roam/types/rides';

export function isCashRide(ride: Pick<RideRequestRow, 'payment_method'> | null | undefined): boolean {
  return (ride?.payment_method ?? 'cash') === 'cash';
}

/** Cash trips use settlement when the server has CASH_SETTLEMENT_ENABLED (do not gate on client flag). */
export function shouldCollectCashAtDropoff(ride: Pick<RideRequestRow, 'payment_method'> | null | undefined): boolean {
  return isCashRide(ride);
}

export function isAwaitingCashSettlement(
  ride: Pick<RideRequestRow, 'status' | 'payment_method'> | null | undefined,
): boolean {
  return Boolean(ride && ride.status === 'awaiting_cash_settlement' && isCashRide(ride));
}
