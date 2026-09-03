import { describe, expect, it } from 'vitest';
import { assembleLeftoverWeekMoney, computeMiscellaneousCost } from './fuelCoverageSplit';
import { assembleWeekSnapshotsFromCalcInput } from './weekSnapshotEngine';

describe('leftover / misc engine', () => {
  it('computes residual spend after categorized costs', () => {
    expect(
      computeMiscellaneousCost(36500, {
        rideShare: 20000,
        companyUsage: 5000,
        deadhead: 2000,
        personal: 7444.61,
      }),
    ).toBeCloseTo(2055.39, 2);
  });

  it('assembleLeftoverWeekMoney matches Percentage split + leftover', () => {
    const money = assembleLeftoverWeekMoney({
      totalSpend: 1000,
      rideShareCost: 700,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 100,
      rule: { coverageType: 'Percentage', rideShareCoverage: 60, personalCoverage: 0, miscCoverage: 50 },
    });
    expect(money.miscellaneousCost).toBeCloseTo(200, 5);
    // rideShare company 60% of 700 = 420; personal 0%; misc 50% of 200 = 100
    expect(money.companyShare).toBeCloseTo(520, 5);
    expect(money.driverShare).toBeCloseTo(480, 5);
  });

  it('weekSnapshotEngine preserves leftover when categoryCosts provided', () => {
    const snaps = assembleWeekSnapshotsFromCalcInput({
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      orgId: 'org1',
      entriesByDriver: new Map([
        [
          'd1',
          [
            {
              id: 'e1',
              amount: 36500,
              date: '2026-08-18',
              driverId: 'd1',
              vehicleId: 'v1',
            },
          ],
        ],
      ]),
      driverContexts: new Map([
        [
          'd1',
          {
            driverId: 'd1',
            vehicleId: 'v1',
            fuelRule: {
              coverageType: 'Percentage',
              rideShareCoverage: 50,
              personalCoverage: 0,
              miscCoverage: 50,
            },
            categoryCosts: {
              rideShareCost: 20000,
              companyUsageCost: 5000,
              deadheadCost: 2000,
              personalUsageCost: 7444.61,
            },
          },
        ],
      ]),
    });
    expect(snaps[0].miscellaneousCost).toBeCloseTo(2055.39, 2);
    expect(snaps[0].miscellaneousCost).not.toBe(0);
  });

  it('explicit miscellaneousCost is not wiped when categories omitted', () => {
    const snaps = assembleWeekSnapshotsFromCalcInput({
      weekStart: '2026-08-17',
      weekEnd: '2026-08-23',
      orgId: 'org1',
      entriesByDriver: new Map([
        [
          'd1',
          [{ id: 'e1', amount: 1000, date: '2026-08-18', driverId: 'd1', vehicleId: 'v1' }],
        ],
      ]),
      driverContexts: new Map([
        [
          'd1',
          {
            driverId: 'd1',
            vehicleId: 'v1',
            fuelRule: { coverageType: 'Percentage', rideShareCoverage: 50 },
            miscellaneousCost: 2055.39,
          },
        ],
      ]),
    });
    expect(snaps[0].miscellaneousCost).toBeCloseTo(2055.39, 2);
  });
});
