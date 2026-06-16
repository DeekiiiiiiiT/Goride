import type { RideRequestRow } from './rides';
import { isCashRide } from './cashSettlementDisplay';

export type CashInHandTripPick = Pick<
  RideRequestRow,
  'payment_method' | 'status' | 'cash_received_minor' | 'cash_settlement_snapshot'
>;

/** Physical cash the driver entered at settlement — never the trip fare.
 *  For rider wallet / split amounts see cashSettlementDisplay (resolveWalletPaidMinor). */
export function cashReceivedMinorFromTripRow(row: CashInHandTripPick): number {
  if (row.status !== 'completed' || !isCashRide(row)) return 0;

  const raw = row.cash_received_minor;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }

  const snap = row.cash_settlement_snapshot as { cash_received_minor?: number | string } | null | undefined;
  if (snap?.cash_received_minor != null && Number.isFinite(Number(snap.cash_received_minor))) {
    return Math.max(0, Math.floor(Number(snap.cash_received_minor)));
  }

  return 0;
}

export function sumCashInHandFromTrips(trips: CashInHandTripPick[]): number {
  return trips.reduce((sum, trip) => sum + cashReceivedMinorFromTripRow(trip), 0);
}
