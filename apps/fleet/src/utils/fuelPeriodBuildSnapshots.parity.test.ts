/**
 * NEW-13 — real dual-path parity (Flawless Wave 2).
 * Path A: assembleWeekSnapshotsFromCalcInput (low-level)
 * Path B: assembleWeekSnapshotsFromRawEntries (Deno build-snapshots / emergency path)
 * Both live in @roam/fuel-core — if either drifts, weekSnapshotMoneyDelta fails CI.
 */
import { describe, expect, it } from 'vitest';
import {
  assembleWeekSnapshotsFromCalcInput,
  assembleWeekSnapshotsFromRawEntries,
  weekSnapshotMoneyDelta,
  type WeekSnapEntry,
  type WeekSnapFuelRule,
} from '@roam/fuel-core';
import { freezeReportMoneyThroughAssembler } from './fuelFinalizeWeekSnapAdapter';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';

const WEEK_START = '2026-08-25';
const WEEK_END = '2026-08-31';
const ORG = 'org-parity';

/** Golden fixture: 2 drivers, shared-car edge, stamped ratio + rule-derived ratio. */
const RAW_ENTRIES = [
  {
    id: 'e-a1',
    amount: 10_000,
    date: '2026-08-25',
    driverId: 'driver-a',
    vehicleId: 'veh-shared',
    reconciliationStatus: 'Pending',
    driverShareRatio: null as number | null,
  },
  {
    id: 'e-a2',
    amount: 5_000,
    date: '2026-08-26',
    driverId: 'driver-a',
    vehicleId: 'veh-2',
    reconciliationStatus: 'Pending',
    driverShareRatio: 0.35,
  },
  {
    id: 'e-b1',
    amount: 8_000,
    date: '2026-08-27',
    driverId: 'driver-b',
    vehicleId: 'veh-shared',
    reconciliationStatus: 'Verified',
    driverShareRatio: null as number | null,
  },
];

const RULE_A: WeekSnapFuelRule = { coverageType: 'Percentage', rideShareCoverage: 60 };
const RULE_B: WeekSnapFuelRule = { coverageType: 'Percentage', rideShareCoverage: 50 };

function pathA_CalcInput() {
  const entriesByDriver = new Map<string, WeekSnapEntry[]>();
  const driverContexts = new Map([
    [
      'driver-a',
      {
        driverId: 'driver-a',
        vehicleId: 'veh-shared',
        vehicleIds: ['veh-shared', 'veh-2'],
        fuelRule: RULE_A,
      },
    ],
    [
      'driver-b',
      {
        driverId: 'driver-b',
        vehicleId: 'veh-shared',
        vehicleIds: ['veh-shared'],
        fuelRule: RULE_B,
      },
    ],
  ]);
  for (const e of RAW_ENTRIES) {
    const list = entriesByDriver.get(e.driverId) || [];
    list.push({
      id: e.id,
      amount: e.amount,
      date: e.date,
      driverId: e.driverId,
      vehicleId: e.vehicleId,
      driverShareRatio: e.driverShareRatio,
    });
    entriesByDriver.set(e.driverId, list);
  }
  return assembleWeekSnapshotsFromCalcInput({
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    orgId: ORG,
    entriesByDriver,
    driverContexts,
    builtBy: 'parity-path-a',
  });
}

function pathB_RawEntries() {
  const fuelRuleByDriver = new Map<string, WeekSnapFuelRule | null>([
    ['driver-a', RULE_A],
    ['driver-b', RULE_B],
  ]);
  return assembleWeekSnapshotsFromRawEntries({
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    orgId: ORG,
    entries: RAW_ENTRIES,
    fuelRuleByDriver,
    builtBy: 'parity-path-b',
  });
}

describe('fuelPeriodBuildSnapshots dual-path parity (NEW-13)', () => {
  it('Path A and Path B money match within EPS for golden fixture week', () => {
    const a = pathA_CalcInput().sort((x, y) => x.driverId.localeCompare(y.driverId));
    const b = pathB_RawEntries().sort((x, y) => x.driverId.localeCompare(y.driverId));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].driverId).toBe(b[i].driverId);
      const delta = weekSnapshotMoneyDelta(a[i], b[i]);
      expect(delta.spend).toBeLessThan(0.01);
      expect(delta.driver).toBeLessThan(0.01);
      expect(delta.company).toBeLessThan(0.01);
      expect(delta.misc).toBeLessThan(0.01);
      expect(a[i].metadata.settledEntries.map((e) => e.id).sort()).toEqual(
        b[i].metadata.settledEntries.map((e) => e.id).sort(),
      );
    }
  });

  it('emergency 50% path matches explicit null-rule assembly', () => {
    const emergency = assembleWeekSnapshotsFromRawEntries({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      orgId: ORG,
      entries: [
        {
          id: 'e1',
          amount: 150,
          date: '2026-08-25',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
        },
        {
          id: 'e2',
          amount: 50,
          date: '2026-08-26',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
        },
      ],
      builtBy: 'fuel_period_build_snapshots',
    });
    expect(emergency).toHaveLength(1);
    expect(emergency[0].totalGasCardCost).toBe(200);
    expect(emergency[0].driverShare).toBeCloseTo(100, 5);
    expect(emergency[0].companyShare).toBeCloseTo(100, 5);
    expect(emergency[0].metadata.settledEntries).toHaveLength(2);
  });

  it('stamped ratio wins over rule on Path B (Deno scenario path)', () => {
    const snaps = assembleWeekSnapshotsFromRawEntries({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      orgId: ORG,
      entries: [
        {
          id: 'stamped',
          amount: 1_000,
          date: '2026-08-25',
          driverId: 'd1',
          vehicleId: 'v1',
          reconciliationStatus: 'Pending',
          driverShareRatio: 0.25,
        },
      ],
      fuelRuleByDriver: new Map([['d1', { coverageType: 'Percentage', rideShareCoverage: 90 }]]),
    });
    expect(snaps[0].driverShare).toBeCloseTo(250, 5);
    expect(snaps[0].companyShare).toBeCloseTo(750, 5);
  });

  it('client finalize adapter (FCS-shaped report) matches CalcInput with categoryCosts', () => {
    const report = {
      id: 'driver-a_2026-08-25',
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      vehicleId: 'veh-shared',
      driverId: 'driver-a',
      vehicleIds: ['veh-shared', 'veh-2'],
      totalGasCardCost: 15_000,
      totalTripDistance: 0,
      rideShareCost: 9_000,
      companyMiscDistance: 0,
      companyUsageCost: 0,
      personalDistance: 0,
      personalUsageCost: 0,
      deadheadDistance: 0,
      deadheadCost: 0,
      miscellaneousCost: 6_000,
      companyShare: 0,
      driverShare: 0,
      status: 'Draft',
    } as WeeklyFuelReport;

    const entries = RAW_ENTRIES.filter((e) => e.driverId === 'driver-a').map(
      (e) =>
        ({
          id: e.id,
          amount: e.amount,
          date: e.date,
          driverId: e.driverId,
          vehicleId: e.vehicleId,
          reconciliationStatus: e.reconciliationStatus,
          driverShareRatio: e.driverShareRatio,
        }) as FuelEntry,
    );

    const frozen = freezeReportMoneyThroughAssembler({
      report,
      settleEntries: entries,
      fuelRule: RULE_A,
      orgId: ORG,
      builtBy: 'parity-client-finalize',
    });

    const viaCalc = assembleWeekSnapshotsFromCalcInput({
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      orgId: ORG,
      entriesByDriver: new Map([
        [
          'driver-a',
          entries.map((e) => ({
            id: e.id,
            amount: Number(e.amount) || 0,
            date: String(e.date).split('T')[0],
            driverId: e.driverId || 'driver-a',
            vehicleId: e.vehicleId || 'veh-shared',
            driverShareRatio: (e as { driverShareRatio?: number | null }).driverShareRatio ?? null,
          })),
        ],
      ]),
      driverContexts: new Map([
        [
          'driver-a',
          {
            driverId: 'driver-a',
            vehicleId: 'veh-shared',
            vehicleIds: ['veh-shared', 'veh-2'],
            fuelRule: RULE_A,
            categoryCosts: {
              rideShareCost: 9_000,
              companyUsageCost: 0,
              deadheadCost: 0,
              personalUsageCost: 0,
            },
          },
        ],
      ]),
      builtBy: 'parity-calc-with-costs',
    })[0];

    const delta = weekSnapshotMoneyDelta(
      {
        totalGasCardCost: frozen.totalGasCardCost,
        driverShare: frozen.driverShare,
        companyShare: frozen.companyShare,
        miscellaneousCost: frozen.miscellaneousCost,
      },
      viaCalc,
    );
    expect(delta.spend).toBeLessThan(0.01);
    expect(delta.driver).toBeLessThan(0.01);
    expect(delta.company).toBeLessThan(0.01);
    expect(delta.misc).toBeLessThan(0.01);
    expect(frozen.built.metadata.builtBy).toBe('parity-client-finalize');
  });
});
