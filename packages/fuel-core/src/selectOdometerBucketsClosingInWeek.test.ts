import { describe, expect, it } from 'vitest';
import {
  inventoryStopToStopWeekBlockers,
  summarizeStopToStopRemediation,
} from './classifyStopToStopBucketRemediation.ts';
import { selectOdometerBucketsClosingInWeek } from './fuelWeekRange.ts';
import type { OdometerBucket } from './fuelTypes.ts';

function bucket(partial: Partial<OdometerBucket> & Pick<OdometerBucket, 'id' | 'endDate'>): OdometerBucket {
  return {
    vehicleId: 'v1',
    startOdometer: 1000,
    endOdometer: 1100,
    startDate: '2026-09-01',
    actualFuelLiters: 10,
    actualFuelCost: 100,
    associatedReceipts: [],
    totalTripDistance: 0,
    tripsCount: 0,
    expectedFuelLiters: 10,
    varianceLiters: 0,
    variancePercent: 0,
    rideShareDistance: 180,
    personalDistance: 0,
    companyMiscDistance: 0,
    unaccountedDistance: 80,
    unexplainedDistance: 0,
    status: 'Anomaly',
    ...partial,
  };
}

describe('selectOdometerBucketsClosingInWeek', () => {
  it('keeps only buckets whose endDate is in the week', () => {
    const all = [
      bucket({ id: 'hist', endDate: '2026-08-30', chainAnomaly: true, confidenceTier: 'indeterminate' }),
      bucket({ id: 'week', endDate: '2026-09-09', rideShareDistance: 180, unaccountedDistance: 80 }),
    ];
    const week = selectOdometerBucketsClosingInWeek(all, '2026-09-07', '2026-09-13');
    expect(week.map((b) => b.id)).toEqual(['week']);
  });
});

describe('inventoryStopToStopWeekBlockers', () => {
  it('ignores accepted OVER-LOG and lists chain', () => {
    const weekBuckets = [
      bucket({ id: 'over', endDate: '2026-09-09' }),
      bucket({
        id: 'chain',
        endDate: '2026-09-10',
        chainAnomaly: true,
        confidenceTier: 'indeterminate',
        endOdometer: 900,
        rideShareDistance: 0,
        unaccountedDistance: 0,
      }),
    ];
    const inv = inventoryStopToStopWeekBlockers(weekBuckets, {
      isAccepted: (b) => b.id === 'over',
    });
    expect(inv.unacceptedOverLog).toHaveLength(0);
    expect(inv.chainWindows).toHaveLength(1);
    expect(inv.focusBucket?.id).toBe('chain');
    expect(inv.weekSummary).not.toMatch(/is clear/i);
  });

  it('week summary says clear when only accepted OVER-LOG remain', () => {
    const weekBuckets = [bucket({ id: 'over', endDate: '2026-09-09' })];
    const inv = inventoryStopToStopWeekBlockers(weekBuckets, {
      isAccepted: () => true,
    });
    expect(inv.blockingCount).toBe(0);
    expect(
      summarizeStopToStopRemediation(weekBuckets, undefined, {
        isAccepted: () => true,
        weekScope: true,
      }),
    ).toMatch(/clear for this week/i);
  });
});
