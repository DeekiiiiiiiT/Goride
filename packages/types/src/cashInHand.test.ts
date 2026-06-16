import { describe, expect, it } from 'vitest';
import { cashReceivedMinorFromTripRow, sumCashInHandFromTrips } from './cashInHand';
import type { RideRequestRow } from './rides';

function trip(partial: Partial<RideRequestRow>): RideRequestRow {
  return {
    id: 'trip-1',
    rider_user_id: 'rider-1',
    status: 'completed',
    payment_method: 'cash',
    pickup_lat: 0,
    pickup_lng: 0,
    dropoff_lat: 0,
    dropoff_lng: 0,
    fare_estimate_minor: 62320,
    currency: 'JMD',
    vehicle_option: 'standard',
    surge_multiplier: 1,
    created_at: '',
    updated_at: '',
    ...partial,
  } as RideRequestRow;
}

describe('cashReceivedMinorFromTripRow', () => {
  it('uses cash_received_minor from settlement', () => {
    expect(cashReceivedMinorFromTripRow(trip({ cash_received_minor: 100000 }))).toBe(100000);
  });

  it('reads snapshot when column is missing on row', () => {
    expect(
      cashReceivedMinorFromTripRow(
        trip({
          cash_settlement_snapshot: {
            settlement_version: 2,
            owed_minor: 62320,
            cash_received_minor: 100000,
            change_credit_minor: 37680,
            arrears_minor: 0,
            outcome: 'overpay',
            settled_at: '',
          },
        }),
      ),
    ).toBe(100000);
  });
});

describe('sumCashInHandFromTrips', () => {
  it('sums physical cash entered across trips', () => {
    expect(
      sumCashInHandFromTrips([
        trip({ cash_received_minor: 62320 }),
        trip({ id: 'trip-2', cash_received_minor: 100000 }),
      ]),
    ).toBe(162320);
  });
});
