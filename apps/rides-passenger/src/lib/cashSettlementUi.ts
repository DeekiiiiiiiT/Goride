import type { RideRequestRow } from '@roam/types/rides';
import {
  isCashRide as isCashRideFromTypes,
  shouldShowRiderCashTripSummary as shouldShowRiderCashTripSummaryFromTypes,
} from '@roam/types/cashSettlementDisplay';

export function isCashRide(
  ride: Pick<RideRequestRow, 'payment_method'> | null | undefined,
): boolean {
  return isCashRideFromTypes(ride);
}

export function shouldShowRiderCashTripSummary(
  ride: Pick<RideRequestRow, 'payment_method' | 'status'> | null | undefined,
): boolean {
  return shouldShowRiderCashTripSummaryFromTypes(ride);
}

export function isAwaitingCashSettlement(
  ride: Pick<RideRequestRow, 'status' | 'payment_method'> | null | undefined,
): boolean {
  return Boolean(ride && ride.status === 'awaiting_cash_settlement' && isCashRide(ride));
}
