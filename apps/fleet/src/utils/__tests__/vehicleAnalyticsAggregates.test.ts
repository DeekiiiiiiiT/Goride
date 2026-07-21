import { describe, expect, it } from 'vitest';
import {
  pctDelta,
  revenuePerTrip,
  revenuePerKm,
  cancellationRate,
  idleHoursFromMetrics,
  utilizationFromMetrics,
  aggregateLedgerCosts,
  buildDailyCostBreakdown,
  commissionByVehicle,
  profitByVehicle,
  buildUtilizationHeatmap,
  tripsInHeatCell,
  sparklineBuckets,
} from '../vehicleAnalyticsAggregates';
import { previousPeriod, resolvePeriod, inPeriod } from '../../components/business-finance/periodRange';
import type { Trip, VehicleMetrics } from '../../types/data';
import type { Vehicle } from '../../types/vehicle';

const period = { preset: 'this_week' as const, startYmd: '2026-07-13', endYmd: '2026-07-19' };

function trip(partial: Partial<Trip> & { id: string }): Trip {
  return {
    platform: 'Uber',
    date: '2026-07-15',
    driverId: 'd1',
    amount: 1000,
    status: 'Completed',
    ...partial,
  } as Trip;
}

describe('period helpers', () => {
  it('resolves today to a single day', () => {
    const p = resolvePeriod('today', undefined, undefined, new Date('2026-07-21T12:00:00'));
    expect(p.startYmd).toBe('2026-07-21');
    expect(p.endYmd).toBe('2026-07-21');
  });

  it('previousPeriod for today is yesterday', () => {
    const p = resolvePeriod('today', undefined, undefined, new Date('2026-07-21T12:00:00'));
    const prev = previousPeriod(p);
    expect(prev.startYmd).toBe('2026-07-20');
    expect(prev.endYmd).toBe('2026-07-20');
  });

  it('previousPeriod for custom preserves length', () => {
    const prev = previousPeriod({
      preset: 'custom',
      startYmd: '2026-07-10',
      endYmd: '2026-07-12',
    });
    expect(prev.endYmd).toBe('2026-07-09');
    expect(prev.startYmd).toBe('2026-07-07');
  });
});

describe('kpi math', () => {
  it('pctDelta returns null when previous is zero', () => {
    expect(pctDelta(100, 0)).toBeNull();
    expect(pctDelta(110, 100)).toBeCloseTo(10);
  });

  it('revenue per trip/km guard division by zero', () => {
    expect(revenuePerTrip(100, 0)).toBeNull();
    expect(revenuePerKm(100, 0)).toBeNull();
    expect(revenuePerTrip(100, 4)).toBe(25);
    expect(revenuePerKm(100, 50)).toBe(2);
  });

  it('cancellation rate', () => {
    expect(cancellationRate(0, 0)).toBeNull();
    expect(cancellationRate(9, 1)).toBeCloseTo(10);
  });

  it('idle/utilization only from real metrics', () => {
    expect(idleHoursFromMetrics(undefined)).toBeNull();
    expect(idleHoursFromMetrics({ onlineHours: 10, onTripHours: 4 } as VehicleMetrics)).toBe(6);
    expect(utilizationFromMetrics({ onlineHours: 10, onTripHours: 4 } as VehicleMetrics)).toBe(40);
    expect(utilizationFromMetrics({ onlineHours: 0, onTripHours: 0 } as VehicleMetrics)).toBeNull();
  });
});

describe('ledger cost attribution', () => {
  it('keeps unattributed costs out of per-vehicle profit and reports coverage', () => {
    const events = [
      {
        eventType: 'fare_earning',
        date: '2026-07-15',
        vehicleId: 'v1',
        netAmount: 800,
        grossAmount: 1000,
        platform: 'Uber',
      },
      {
        eventType: 'platform_fee',
        date: '2026-07-15',
        vehicleId: 'v1',
        netAmount: -200,
        grossAmount: 0,
        platform: 'Uber',
      },
      {
        eventType: 'fuel_expense',
        date: '2026-07-15',
        vehicleId: 'v1',
        netAmount: -100,
        grossAmount: 100,
      },
      {
        eventType: 'maintenance',
        date: '2026-07-15',
        // no vehicleId — fleet only
        netAmount: -500,
        grossAmount: 500,
      },
    ];

    const agg = aggregateLedgerCosts(events, period);
    expect(agg.byVehicle.get('v1')?.fuel).toBeGreaterThan(0);
    expect(agg.byVehicle.get('v1')?.maintenance ?? 0).toBe(0);
    expect(agg.unattributedTotal).toBeGreaterThan(0);
    expect(agg.coveragePct).not.toBeNull();
    expect(agg.coveragePct!).toBeLessThan(100);
  });

  it('profitByVehicle requires attributed costs for scatter eligibility', () => {
    const trips = [trip({ id: 't1', vehicleId: 'v1', amount: 2000, date: '2026-07-15' })];
    const vehicles = [{ id: 'v1', licensePlate: 'ABC' } as Vehicle];
    const costs = new Map();
    const rows = profitByVehicle(trips, costs, vehicles, period);
    expect(rows[0].hasAttributedCosts).toBe(false);

    costs.set('v1', {
      fuel: 100,
      tolls: 0,
      maintenance: 0,
      insurance: 0,
      fixedOther: 0,
      operating: 0,
      cleaning: 0,
      platformFees: 0,
      total: 100,
    });
    const withCosts = profitByVehicle(trips, costs, vehicles, period);
    expect(withCosts[0].hasAttributedCosts).toBe(true);
    expect(withCosts[0].profit).toBeLessThan(withCosts[0].revenue);
  });

  it('commissionByVehicle ignores events without vehicleId', () => {
    const events = [
      {
        eventType: 'fare_earning',
        date: '2026-07-15',
        netAmount: 800,
        grossAmount: 1000,
        platform: 'Uber',
      },
      {
        eventType: 'fare_earning',
        date: '2026-07-15',
        vehicleId: 'v1',
        netAmount: 800,
        grossAmount: 1000,
        platform: 'Uber',
      },
    ];
    const rows = commissionByVehicle(events, period, [{ id: 'v1', licensePlate: 'ABC' } as Vehicle]);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleId).toBe('v1');
  });
});

describe('daily + heatmap', () => {
  it('builds daily cost points for each day in period', () => {
    const trips = [trip({ id: 't1', vehicleId: 'v1', amount: 500, date: '2026-07-15' })];
    const events = [
      { eventType: 'fuel_expense', date: '2026-07-15', netAmount: -50, grossAmount: 50 },
    ];
    const days = buildDailyCostBreakdown(trips, events, period);
    expect(days.length).toBe(7);
    const hit = days.find((d) => d.dateYmd === '2026-07-15');
    expect(hit?.revenue).toBeGreaterThan(0);
    expect(hit?.fuel).toBe(50);
  });

  it('heatmap cell drill returns matching trips', () => {
    // Wednesday 2026-07-15 midday
    const trips = [
      trip({
        id: 't1',
        vehicleId: 'v1',
        date: '2026-07-15T12:00:00',
        requestTime: '2026-07-15T12:00:00',
      }),
    ];
    const heat = buildUtilizationHeatmap(trips);
    expect(heat.maxCount).toBeGreaterThanOrEqual(1);
    // Wed = index 2, 10–14 = row 1
    const found = tripsInHeatCell(trips, 1, 2);
    expect(found).toHaveLength(1);
  });

  it('sparklineBuckets stays inside period', () => {
    const trips = [
      trip({ id: 't1', date: '2026-07-15', amount: 100 }),
      trip({ id: 't2', date: '2026-07-01', amount: 999 }),
    ];
    const spark = sparklineBuckets(trips, period, (t) => t.amount);
    expect(spark.some((v) => v === 100)).toBe(true);
    expect(spark.every((v) => v !== 999)).toBe(true);
  });

  it('inPeriod is inclusive', () => {
    expect(inPeriod('2026-07-13', period)).toBe(true);
    expect(inPeriod('2026-07-19', period)).toBe(true);
    expect(inPeriod('2026-07-12', period)).toBe(false);
  });
});
