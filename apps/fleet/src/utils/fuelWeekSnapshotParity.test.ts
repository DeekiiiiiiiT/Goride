/**
 * Golden parity: shared weekSnapshotEngine money matches scenario-stamped ratios
 * used by Deno build-snapshots (Program 5).
 */
import { describe, expect, it } from 'vitest';
import {
  assembleWeekSnapshotsFromCalcInput,
  weekSnapshotMoneyDelta,
} from '@roam/fuel-core';

describe('fuel week snapshot golden parity', () => {
  it('fixture week spend/shares within EPS', () => {
    const entriesByDriver = new Map([
      [
        'driver-a',
        [
          {
            id: 'fill-1',
            amount: 12_500,
            date: '2026-08-25',
            driverId: 'driver-a',
            vehicleId: 'veh-1',
          },
          {
            id: 'fill-2',
            amount: 8_000,
            date: '2026-08-27',
            driverId: 'driver-a',
            vehicleId: 'veh-1',
            driverShareRatio: 0.4,
          },
        ],
      ],
    ]);
    const snaps = assembleWeekSnapshotsFromCalcInput({
      weekStart: '2026-08-25',
      weekEnd: '2026-08-31',
      orgId: 'org-test',
      entriesByDriver,
      driverContexts: new Map([
        [
          'driver-a',
          {
            driverId: 'driver-a',
            vehicleId: 'veh-1',
            fuelRule: { coverageType: 'Percentage', rideShareCoverage: 50 },
          },
        ],
      ]),
    });
    expect(snaps).toHaveLength(1);
    // fill-1 @ 50% company → 0.5 driver; fill-2 stamped 0.4
    const expectedDriver = 12_500 * 0.5 + 8_000 * 0.4;
    const expectedSpend = 20_500;
    const browserLike = {
      totalGasCardCost: expectedSpend,
      driverShare: expectedDriver,
      companyShare: expectedSpend - expectedDriver,
    };
    const delta = weekSnapshotMoneyDelta(snaps[0], browserLike);
    expect(delta.spend).toBeLessThan(0.01);
    expect(delta.driver).toBeLessThan(0.01);
    expect(delta.company).toBeLessThan(0.01);
    expect(snaps[0].metadata.settledEntries.map((e) => e.id).sort()).toEqual([
      'fill-1',
      'fill-2',
    ]);
  });
});
