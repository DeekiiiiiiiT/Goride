import { describe, expect, it } from 'vitest';
import { resolveDriverDetailFinancials } from './resolveDriverDetailFinancials';
import type { LedgerDriverOverview } from '../types/data';
import type { DriverOperationalMetrics } from './driverOperationalMetrics';

function emptyMetrics(overrides: Partial<DriverOperationalMetrics> = {}): DriverOperationalMetrics {
  return {
    periodEarnings: 0,
    prevPeriodEarnings: 0,
    trendPercent: '0.0',
    trendUp: true,
    cashCollected: 0,
    totalTolls: 0,
    totalTips: 0,
    totalBaseFare: 0,
    totalDistance: 0,
    totalTrips: 0,
    periodCompletedTrips: 0,
    platformStats: {
      Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      Roam: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
    },
    weeklyEarningsData: [],
    daysDiff: 7,
    tripRatio: { totalOnline: 0, available: 0, toTrip: 0, onTrip: 0, unavailable: 0 },
    ...overrides,
  } as DriverOperationalMetrics;
}

function baseOverview(overrides: Partial<LedgerDriverOverview> = {}): LedgerDriverOverview {
  return {
    period: {
      earnings: 93462.4,
      cashCollected: 46085.61,
      tolls: 0,
      tips: 300,
      baseFare: 0,
      tripCount: 67,
      disputeRefunds: 0,
      platformFees: 0,
      platformFeesByPlatform: {},
      fareGrossMinusNetByPlatform: {},
      bankTransferred: 0,
    },
    prevPeriod: { earnings: 0, cashCollected: 0, tolls: 0, tips: 0, baseFare: 0, tripCount: 0 },
    lifetime: { earnings: 0, cashCollected: 0, tolls: 0, tripCount: 0, disputeRefunds: 0 },
    platformStats: {
      Uber: { earnings: 73362.4, tripCount: 40, cashCollected: 25985.61, tolls: 0 },
      Roam: { earnings: 20100, tripCount: 20, cashCollected: 20100, tolls: 0 },
    },
    dailyEarnings: [],
    source: 'driver_financial_periods',
    readModelSource: 'driver_financial_periods',
    ...overrides,
  } as LedgerDriverOverview;
}

describe('resolveDriverDetailFinancials', () => {
  it('aligns card totals to platform chips when DFP period.* lags InDrive backfill', () => {
    const metrics = emptyMetrics({
      periodEarnings: 98678.31,
      cashCollected: 52025.61,
      periodCompletedTrips: 70,
      platformStats: {
        Uber: { earnings: 73362.4, trips: 40, completed: 40, distance: 700, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 25985.61 },
        InDrive: { earnings: 5215.91, trips: 10, completed: 10, distance: 61.8, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 5940 },
        Roam: { earnings: 20100, trips: 20, completed: 20, distance: 126.9, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 20100 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      },
    });

    // Ledger already has InDrive (complete) but DFP overlay left period totals stale.
    const ledgerOverview = baseOverview({
      platformStats: {
        Uber: { earnings: 73362.4, tripCount: 40, cashCollected: 25985.61, tolls: 0 },
        InDrive: { earnings: 5215.91, tripCount: 10, cashCollected: 5940, tolls: 0 },
        Roam: { earnings: 20100, tripCount: 20, cashCollected: 20100, tolls: 0 },
      },
    });

    const r = resolveDriverDetailFinancials({
      ledgerOverview,
      ledgerOverviewLoaded: true,
      metrics,
      allTrips: [],
      period: { from: new Date('2026-09-07'), to: new Date('2026-09-13') },
      periodCompletedFromOps: 70,
    });

    expect(r.periodEarnings).toBeCloseTo(98678.31, 2);
    expect(r.cashCollected).toBeCloseTo(52025.61, 2);
    expect(r.source).toBe('ledger');
    expect(r.isLedgerComplete).toBe(true);
  });

  it('falls back to trips when InDrive is missing from ledger platformStats', () => {
    const metrics = emptyMetrics({
      periodEarnings: 98678.31,
      cashCollected: 52025.61,
      periodCompletedTrips: 70,
      platformStats: {
        Uber: { earnings: 73362.4, trips: 40, completed: 40, distance: 700, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 25985.61 },
        InDrive: { earnings: 5215.91, trips: 10, completed: 10, distance: 61.8, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 5940 },
        Roam: { earnings: 20100, trips: 20, completed: 20, distance: 126.9, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 20100 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      },
    });

    const r = resolveDriverDetailFinancials({
      ledgerOverview: baseOverview(), // Uber + Roam only
      ledgerOverviewLoaded: true,
      metrics,
      allTrips: [],
      period: { from: new Date('2026-09-07'), to: new Date('2026-09-13') },
      periodCompletedFromOps: 70,
    });

    expect(r.source).toBe('trips');
    expect(r.tripFallback).toBe(true);
    expect(r.dataIncomplete).toBe(true);
    expect(r.missingPlatforms).toContain('InDrive');
    expect(r.periodEarnings).toBeCloseTo(98678.31, 2);
    expect(r.cashCollected).toBeCloseTo(52025.61, 2);
  });
});
