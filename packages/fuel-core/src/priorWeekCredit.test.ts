import { describe, expect, it } from 'vitest';
import { FUEL_ENGINE_VERSION } from './fuelEngine.ts';
import { buildPriorWeekCredit, priorWeekStarts } from './priorWeekCredit.ts';

describe('prior week credit', () => {
  it('looks back three Jamaica weeks', () => {
    expect(priorWeekStarts('2026-10-05')).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('counts a locked week and treats an open week as zero', () => {
    const credit = buildPriorWeekCredit([
      {
        weekStart: '2026-09-14',
        status: 'locked',
        version: 2,
        engineVersion: FUEL_ENGINE_VERSION,
        variances: [{ driverId: 'd1', vehicleId: 'v1', miscellaneousCost: -1200 }],
      },
      {
        weekStart: '2026-09-21',
        status: 'open',
        version: 4,
        engineVersion: FUEL_ENGINE_VERSION,
        variances: [{ driverId: 'd1', vehicleId: 'v1', miscellaneousCost: -9000 }],
      },
      {
        weekStart: '2026-09-28',
        status: '',
        version: 0,
        engineVersion: '',
        variances: [],
      },
    ]);
    expect(credit.byKey.get('d1:v1')).toEqual([-1200, 0, 0]);
    expect(credit.openWeekStarts).toEqual(['2026-09-21']);
  });

  it('a reopened week blocks and does not lend its fuel difference', () => {
    const credit = buildPriorWeekCredit([
      {
        weekStart: '2026-08-31',
        status: 'locked',
        version: 1,
        engineVersion: FUEL_ENGINE_VERSION,
        variances: [{ driverId: 'd1', vehicleId: 'v1', miscellaneousCost: 400 }],
      },
      {
        weekStart: '2026-09-07',
        status: 'reopened',
        version: 3,
        engineVersion: FUEL_ENGINE_VERSION,
        variances: [{ driverId: 'd1', vehicleId: 'v1', miscellaneousCost: -500 }],
      },
      {
        weekStart: '2026-09-14',
        status: 'locked',
        version: 1,
        engineVersion: 'fuel-chain-v1',
        variances: [{ driverId: 'd1', vehicleId: 'v1', miscellaneousCost: 800 }],
      },
    ]);
    expect(credit.byKey.get('d1:v1')).toEqual([400, 0, 0]);
    expect(credit.openWeekStarts).toEqual(['2026-09-07']);
  });
});
