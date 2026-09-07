import { describe, expect, it } from 'vitest';
import {
  assembleWeekSnapshotsFromCalcInput,
  assembleWeekSnapshotsFromRawEntries,
  driverShareRatioFromFuelRule,
  weekSnapshotMoneyDelta,
} from './weekSnapshotEngine';
import { getCategoryCoverageSplit } from './fuelCoverageSplit.ts';

describe('weekSnapshotEngine', () => {
  it('Percentage 70% company → 30% driver ratio', () => {
    expect(
      driverShareRatioFromFuelRule({
        coverageType: 'Percentage',
        rideShareCoverage: 70,
      }),
    ).toBeCloseTo(0.3, 5);
  });

  it('assembles settledEntries + shares matching rule', () => {
    const entriesByDriver = new Map([
      [
        'd1',
        [
          {
            id: 'e1',
            amount: 1000,
            date: '2026-08-25',
            driverId: 'd1',
            vehicleId: 'v1',
          },
        ],
      ],
    ]);
    const driverContexts = new Map([
      [
        'd1',
        {
          driverId: 'd1',
          vehicleId: 'v1',
          fuelRule: { coverageType: 'Percentage', rideShareCoverage: 60 },
        },
      ],
    ]);
    const snaps = assembleWeekSnapshotsFromCalcInput({
      weekStart: '2026-08-25',
      weekEnd: '2026-08-31',
      orgId: 'org1',
      entriesByDriver,
      driverContexts,
    });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].totalGasCardCost).toBe(1000);
    expect(snaps[0].driverShare).toBeCloseTo(400, 5);
    expect(snaps[0].companyShare).toBeCloseTo(600, 5);
    expect(snaps[0].metadata.settledEntries.map((e) => e.id)).toEqual(['e1']);
  });

  it('golden parity helper stays within EPS for identical money', () => {
    const delta = weekSnapshotMoneyDelta(
      { totalGasCardCost: 100, driverShare: 40, companyShare: 60, miscellaneousCost: 0 },
      { totalGasCardCost: 100.005, driverShare: 40.004, companyShare: 59.996, miscellaneousCost: 0 },
    );
    expect(delta.spend).toBeLessThan(0.01);
    expect(delta.driver).toBeLessThan(0.01);
    expect(delta.misc).toBeLessThan(0.01);
  });

  it('assembleWeekSnapshotsFromRawEntries matches calc-input path', () => {
    const raw = assembleWeekSnapshotsFromRawEntries({
      weekStart: '2026-08-25',
      weekEnd: '2026-08-31',
      orgId: 'org1',
      entries: [
        {
          id: 'e1',
          amount: 1000,
          date: '2026-08-25',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
        },
      ],
      fuelRuleByDriver: new Map([
        ['d1', { coverageType: 'Percentage', rideShareCoverage: 60 }],
      ]),
    });
    expect(raw[0].driverShare).toBeCloseTo(400, 5);
  });

  it('Fixed_Amount routes through getCategoryCoverageSplit (H-5, not flat 50%)', () => {
    // $1000 spend, $600 weekly allowance → company covers 600, driver bears 400.
    const rule = { coverageType: 'Fixed_Amount', coverageValue: 600 };
    const expected = getCategoryCoverageSplit('rideShare', 1000, rule);

    const snaps = assembleWeekSnapshotsFromRawEntries({
      weekStart: '2026-08-25',
      weekEnd: '2026-08-31',
      orgId: 'org1',
      entries: [
        { id: 'e1', amount: 400, date: '2026-08-25', driverId: 'd1', vehicleId: 'v1' },
        { id: 'e2', amount: 600, date: '2026-08-26', driverId: 'd1', vehicleId: 'v1' },
      ],
      fuelRuleByDriver: new Map([['d1', rule]]),
    });

    expect(snaps[0].totalGasCardCost).toBe(1000);
    // Parity: assembler driver/company shares equal the category-split result…
    expect(snaps[0].driverShare).toBeCloseTo(expected.driver, 5); // 400
    expect(snaps[0].companyShare).toBeCloseTo(expected.company, 5); // 600
    // …and are NOT the old broken flat 50% split.
    expect(snaps[0].driverShare).not.toBeCloseTo(500, 5);
  });

  it('Fixed_Amount honours per-entry stamped ratios over the allowance', () => {
    const rule = { coverageType: 'Fixed_Amount', coverageValue: 600 };
    const snaps = assembleWeekSnapshotsFromRawEntries({
      weekStart: '2026-08-25',
      weekEnd: '2026-08-31',
      orgId: 'org1',
      entries: [
        // stamped 100% driver → contributes full 200 to driverShare
        {
          id: 'e1',
          amount: 200,
          date: '2026-08-25',
          driverId: 'd1',
          vehicleId: 'v1',
          driverShareRatio: 1,
        },
        // unstamped 800 → allowance 600 covers company, driver bears 200
        { id: 'e2', amount: 800, date: '2026-08-26', driverId: 'd1', vehicleId: 'v1' },
      ],
      fuelRuleByDriver: new Map([['d1', rule]]),
    });
    expect(snaps[0].driverShare).toBeCloseTo(200 + 200, 5); // 400
    expect(snaps[0].companyShare).toBeCloseTo(600, 5);
  });
});
