import type { RideRequestRow } from '@roam/types/rides';
import { isCashRide } from '@roam/types/cashSettlementDisplay';

export function isAwaitingCashSettlement(
  ride: Pick<RideRequestRow, 'status' | 'payment_method'> | null | undefined,
): boolean {
  if (!ride || ride.status !== 'awaiting_cash_settlement') return false;
  return isCashRide(ride);
}

export function haulCashQrUrl(rideId: string): string {
  const payload = `roamhaul:cash:${rideId}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
}
