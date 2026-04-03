import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NET_FARE_RECON_TOLERANCE,
  reconcileUberNetFareByDriver,
  sumUberTripRollFareComponents,
} from './uberStatementReconciliation';
import type { Trip } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

const trip = (over: Partial<Trip>): Trip =>
  ({
    id: 'x',
    platform: 'Uber',
    status: 'Completed',
    date: '2026-03-03T10:00:00.000Z',
    amount: 100,
    driverId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ...over,
  }) as Trip;

describe('sumUberTripRollFareComponents', () => {
  it('sums uberFareComponents for completed Uber trips in range for driver', () => {
    const d = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const trips = [
      trip({ driverId: d, date: '2026-03-01', uberFareComponents: 10 }),
      trip({ driverId: d, date: '2026-03-10', uberFareComponents: 5 }),
      trip({ driverId: d, date: '2026-02-28', uberFareComponents: 99 }),
      trip({ platform: 'InDrive', driverId: d, date: '2026-03-05', uberFareComponents: 50 }),
    ];
    const s = sumUberTripRollFareComponents(trips, d, '2026-03-01', '2026-03-07');
    expect(s).toBe(10);
  });
});

describe('reconcileUberNetFareByDriver', () => {
  it('returns per-driver statement vs trip roll delta', () => {
    const d = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const ssot: Record<string, UberSsotTotals> = {
      [d]: {
        periodEarningsGross: 0,
        fareComponents: 0,
        statementNetFare: 100,
        promotions: 0,
        tips: 0,
        refundsAndExpenses: 0,
      },
    };
    const trips = [trip({ driverId: d, date: '2026-03-04', uberFareComponents: 99.99 })];
    const rows = reconcileUberNetFareByDriver({
      trips,
      uberStatementsByDriverId: ssot,
      periodStartYmd: '2026-03-01',
      periodEndYmd: '2026-03-07',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].statementNetFare).toBe(100);
    expect(rows[0].tripRollFareComponents).toBe(99.99);
    expect(rows[0].delta).toBeCloseTo(0.01, 5);
    expect(rows[0].withinTolerance).toBe(true);
  });

  it('flags outside tolerance using DEFAULT_NET_FARE_RECON_TOLERANCE', () => {
    const d = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const ssot: Record<string, UberSsotTotals> = {
      [d]: {
        periodEarningsGross: 0,
        fareComponents: 0,
        statementNetFare: 100,
        promotions: 0,
        tips: 0,
        refundsAndExpenses: 0,
      },
    };
    const trips = [trip({ driverId: d, date: '2026-03-04', uberFareComponents: 90 })];
    const rows = reconcileUberNetFareByDriver({
      trips,
      uberStatementsByDriverId: ssot,
      periodStartYmd: '2026-03-01',
      periodEndYmd: '2026-03-07',
      tolerance: DEFAULT_NET_FARE_RECON_TOLERANCE,
    });
    expect(rows[0].withinTolerance).toBe(false);
  });

  it('returns empty when no SSOT map', () => {
    expect(
      reconcileUberNetFareByDriver({
        trips: [],
        uberStatementsByDriverId: null,
        periodStartYmd: '2026-03-01',
        periodEndYmd: '2026-03-07',
      }),
    ).toEqual([]);
  });
});
