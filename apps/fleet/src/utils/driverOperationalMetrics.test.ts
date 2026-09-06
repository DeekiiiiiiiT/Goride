import { describe, it, expect } from 'vitest';
import {
  computeServiceQualityRates,
  normalizeAcceptancePercent,
  computeDriverOperationalMetrics,
  emptyDriverOperationalMetrics,
  getSortedTripsInRange,
  parseTripDate,
  buildOperationalPeriodSummary,
} from './driverOperationalMetrics';
import type { Trip } from '../types/data';
import { DEFAULT_FUEL_ECONOMY_KM_PER_L } from '../config/driverOpsDefaults';

describe('buildOperationalPeriodSummary', () => {
  it('golden: counts completed/cancelled and distance in YMD range', () => {
    const trips = [
      { date: '2026-03-10', status: 'Completed', platform: 'Uber', distance: 10 },
      { date: '2026-03-10', status: 'Cancelled', platform: 'Uber', distance: 3 },
      { date: '2026-03-11', status: 'Completed', platform: 'Roam', distance: 5 },
    ];
    const s = buildOperationalPeriodSummary(trips, '2026-03-10', '2026-03-10');
    expect(s.completed).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.totalTrips).toBe(2);
    expect(s.totalDistanceKm).toBe(10);
    expect(s.completionRate).toBe(50);
  });
});

describe('normalizeAcceptancePercent', () => {
  it('scales fractions 0–1 to percent', () => {
    expect(normalizeAcceptancePercent(0.85)).toBe(85);
  });

  it('passes through already-percent values', () => {
    expect(normalizeAcceptancePercent(92)).toBe(92);
  });
});

describe('computeServiceQualityRates', () => {
  it('golden: 80 completed + 20 cancelled → 80% completion / 20% cancel', () => {
    const r = computeServiceQualityRates({ completed: 80, cancelled: 20 });
    expect(r.totalTrips).toBe(100);
    expect(r.completionRate).toBe(80);
    expect(r.cancellationRate).toBe(20);
    // No CSV → acceptance mirrors completion
    expect(r.acceptanceRate).toBe(80);
  });

  it('prefers CSV acceptance over trip-derived completion', () => {
    const r = computeServiceQualityRates({ completed: 50, cancelled: 50 }, 0.91);
    expect(r.completionRate).toBe(50);
    expect(r.acceptanceRate).toBe(91);
  });

  it('returns null acceptance when no trips and no CSV', () => {
    const r = computeServiceQualityRates({ completed: 0, cancelled: 0 });
    expect(r.totalTrips).toBe(0);
    expect(r.acceptanceRate).toBeNull();
  });
});

describe('parseTripDate / getSortedTripsInRange', () => {
  it('parses ISO date-only as local calendar day', () => {
    const d = parseTripDate('2026-03-10');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2);
    expect(d!.getDate()).toBe(10);
  });

  it('sorts period trips ascending by requestTime', () => {
    const trips = [
      { id: 'b', date: '2026-03-10T14:00:00', requestTime: '2026-03-10T14:00:00', platform: 'Uber', status: 'Completed', amount: 1 } as Trip,
      { id: 'a', date: '2026-03-10T09:00:00', requestTime: '2026-03-10T09:00:00', platform: 'Uber', status: 'Completed', amount: 1 } as Trip,
    ];
    const start = new Date(2026, 2, 10, 0, 0, 0);
    const end = new Date(2026, 2, 10, 23, 59, 59);
    const sorted = getSortedTripsInRange(trips, start, end, 'asc');
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('computeDriverOperationalMetrics', () => {
  const baseInput = {
    allTrips: [] as Trip[],
    dateRange: undefined as undefined,
    csvMetrics: null,
    transactions: [],
    vehicleMetrics: null,
    driver: null,
    selectedPlatforms: new Set(['All']),
    timeFilter: { preset: 'all' as const },
    activeTab: 'overview',
  };

  it('returns empty shell when no date range', () => {
    const r = computeDriverOperationalMetrics(baseInput);
    expect(r.totalTrips).toBe(0);
    expect(r.periodEarnings).toBe(0);
    expect(r.platformStats.Uber.trips).toBe(0);
    expect(emptyDriverOperationalMetrics().cashCollected).toBe(0);
  });

  it('golden: one completed 12 km Uber trip → platform + distance + fuel rideShare', () => {
    const tripDate = '2026-03-10T12:00:00';
    const trip: Trip = {
      id: 't1',
      date: tripDate,
      requestTime: '2026-03-10T11:50:00',
      pickupTime: '2026-03-10T12:00:00',
      dropoffTime: '2026-03-10T12:30:00',
      platform: 'Uber',
      status: 'Completed',
      amount: 1000,
      distance: 12,
      duration: 30,
    } as Trip;

    const r = computeDriverOperationalMetrics({
      ...baseInput,
      allTrips: [trip],
      dateRange: {
        from: new Date(2026, 2, 10),
        to: new Date(2026, 2, 10),
      },
    });

    expect(r.periodCompletedTrips).toBe(1);
    expect(r.totalTrips).toBe(1);
    expect(r.completionRate).toBe(100);
    expect(r.platformStats.Uber.completed).toBe(1);
    expect(r.platformStats.Uber.earnings).toBe(1000);
    expect(r.totalDistance).toBe(12);
    expect(r.distanceMetrics.onTrip).toBe(12);
    // Enroute fallback ~0.083h → estimateEnrouteFallback may add distance; rideShare uses onTrip+enroute
    const expectedRideShareMin = 12 / DEFAULT_FUEL_ECONOMY_KM_PER_L;
    expect(r.fuelMetrics.rideShare).toBeGreaterThanOrEqual(expectedRideShareMin - 0.001);
    expect(r.fuelMetrics.total).toBeGreaterThanOrEqual(r.fuelMetrics.rideShare);
  });

  it('golden: 2 completed + 1 cancelled → rates match computeServiceQualityRates', () => {
    const mk = (id: string, status: string, hour: number): Trip =>
      ({
        id,
        date: `2026-03-10T${String(hour).padStart(2, '0')}:00:00`,
        requestTime: `2026-03-10T${String(hour).padStart(2, '0')}:00:00`,
        platform: 'Roam',
        status,
        amount: 100,
        distance: 5,
        duration: 15,
      }) as Trip;

    const r = computeDriverOperationalMetrics({
      ...baseInput,
      allTrips: [mk('1', 'Completed', 10), mk('2', 'Completed', 11), mk('3', 'Cancelled', 12)],
      dateRange: {
        from: new Date(2026, 2, 10),
        to: new Date(2026, 2, 10),
      },
    });

    const rates = computeServiceQualityRates({ completed: 2, cancelled: 1 });
    expect(r.completionRate).toBe(rates.completionRate);
    expect(r.cancellationRate).toBe(rates.cancellationRate);
    expect(r.acceptanceRate).toBe(rates.acceptanceRate);
  });
});
