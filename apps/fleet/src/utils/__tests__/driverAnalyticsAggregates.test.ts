import { describe, expect, it } from 'vitest';
import {
  buildDriverRows,
  buildDriverAlerts,
  buildPlatformMix,
  pctDelta,
  latestMetricsByDriver,
} from '../driverAnalyticsAggregates';
import type { Trip, DriverMetrics } from '../../types/data';

function trip(partial: Partial<Trip> & { id: string; driverId: string }): Trip {
  return {
    platform: 'Uber',
    date: '2026-07-20',
    amount: 1000,
    status: 'Completed',
    ...partial,
  } as Trip;
}

describe('driverAnalyticsAggregates', () => {
  it('pctDelta handles zero baseline', () => {
    expect(pctDelta(10, 0)).toBeNull();
    expect(pctDelta(120, 100)).toBeCloseTo(20);
  });

  it('builds rows from trips + metrics', () => {
    const metrics: DriverMetrics[] = [
      {
        id: 'm1',
        driverId: 'd1',
        driverName: 'Alex',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        acceptanceRate: 0.9,
        cancellationRate: 0.05,
        completionRate: 0.95,
        ratingLast500: 4.8,
        ratingLast4Weeks: 4.9,
        onlineHours: 40,
        onTripHours: 28,
        tripsCompleted: 50,
      },
    ];
    const map = latestMetricsByDriver(metrics);
    const rows = buildDriverRows(
      [
        trip({ id: 't1', driverId: 'd1', amount: 2000, distance: 10 }),
        trip({ id: 't2', driverId: 'd1', amount: 1500, status: 'Cancelled' }),
      ],
      [{ id: 'd1', name: 'Alex' }],
      map,
    );
    const r = rows.find((x) => x.driverId === 'd1')!;
    expect(r.trips).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.utilizationPct).toBeCloseTo(70);
    expect(r.acceptanceRate).toBe(0.9);
  });

  it('flags cancellation surge', () => {
    const rows = buildDriverRows(
      [
        trip({ id: 'a', driverId: 'd2', amount: 100 }),
        trip({ id: 'b', driverId: 'd2', amount: 0, status: 'Cancelled' }),
        trip({ id: 'c', driverId: 'd2', amount: 0, status: 'Cancelled' }),
        trip({ id: 'd', driverId: 'd2', amount: 0, status: 'Cancelled' }),
      ],
      [{ id: 'd2', name: 'Sam' }],
      new Map(),
    );
    const alerts = buildDriverAlerts(rows, []);
    expect(alerts.some((a) => a.title.includes('Cancellation'))).toBe(true);
  });

  it('platform mix uses real trip earnings', () => {
    const slices = buildPlatformMix([
      trip({ id: '1', driverId: 'd1', platform: 'Uber', amount: 300 }),
      trip({ id: '2', driverId: 'd1', platform: 'InDrive', amount: 100 }),
    ]);
    expect(slices[0].name).toBe('Uber');
    expect(slices[0].pct).toBe(75);
  });
});
