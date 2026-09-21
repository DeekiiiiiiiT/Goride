import { describe, expect, it } from 'vitest';
import { stopToStopClosableFlagsFromReports } from './stopToStopClosableFlags';
import type { WeeklyFuelReport } from '../types/fuel';
import type { OdometerBucket } from '@roam/fuel-core';

function bucket(partial: Partial<OdometerBucket> & Pick<OdometerBucket, 'id' | 'endDate'>): OdometerBucket {
  return {
    vehicleId: 'v1',
    startOdometer: 1000,
    endOdometer: 1100,
    startDate: '2026-09-08',
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

describe('stopToStopClosableFlagsFromReports + week scope', () => {
  it('clears attribution when OVER-LOG windows are accepted', () => {
    const reports = [
      {
        odometerBuckets: [bucket({ id: 'b1', endDate: '2026-09-09' })],
        totalGasCardCost: 100,
      },
    ] as WeeklyFuelReport[];

    const blocked = stopToStopClosableFlagsFromReports({
      reports,
      fuelEntries: [],
      weekStartYmd: '2026-09-08',
      weekEndYmd: '2026-09-14',
    });
    expect(blocked.stopToStopAttributionFailed).toBe(true);

    const cleared = stopToStopClosableFlagsFromReports({
      reports,
      fuelEntries: [],
      weekStartYmd: '2026-09-08',
      weekEndYmd: '2026-09-14',
      gapAccepts: [
        {
          bucketId: 'b1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'platform overstated trips',
        },
      ],
    });
    expect(cleared.stopToStopAttributionFailed).toBe(false);
  });

  it('does not set chain failed for historical chainAnomaly outside the week', () => {
    const reports = [
      {
        odometerBuckets: [
          bucket({
            id: 'hist-chain',
            endDate: '2026-08-20',
            chainAnomaly: true,
            confidenceTier: 'indeterminate',
            endOdometer: 900,
            rideShareDistance: 0,
            unaccountedDistance: 0,
          }),
          bucket({
            id: 'week-over',
            endDate: '2026-09-09',
            rideShareDistance: 180,
            unaccountedDistance: 80,
          }),
        ],
        totalGasCardCost: 100,
      },
    ] as WeeklyFuelReport[];

    const flags = stopToStopClosableFlagsFromReports({
      reports,
      fuelEntries: [],
      weekStartYmd: '2026-09-07',
      weekEndYmd: '2026-09-13',
      gapAccepts: [
        {
          bucketId: 'week-over',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'accepted overlog for week',
        },
      ],
    });
    expect(flags.stopToStopChainFailed).toBe(false);
    expect(flags.stopToStopAttributionFailed).toBe(false);
  });
});
