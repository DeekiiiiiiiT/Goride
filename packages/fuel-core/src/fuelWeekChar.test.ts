/**
 * Stage 0 characterisation — dual-engine goldens must detect real divergence.
 * R-1: deliberately divergent fixture proves the parity harness can fail.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  assembleWeekSnapshotsFromCalcInput,
  weekSnapshotMoneyDelta,
} from './weekSnapshotEngine.ts';

const root = dirname(fileURLToPath(import.meta.url));
const goldensPath = join(root, '../fixtures/fuel-week-char/dual-engine-goldens.json');
const blastPath = join(root, '../fixtures/fuel-week-char/blast-radius-2026-09-15.json');

type GoldenWeek = {
  id: string;
  weekStart: string;
  weekEnd: string;
  driverId: string;
  totalSpend: number;
  engineA: {
    companyShare: number;
    driverShare: number;
    miscellaneousCost: number;
    categoryCosts?: {
      rideShareCost: number;
      companyUsageCost: number;
      deadheadCost: number;
      personalUsageCost: number;
    };
    fuelRule?: { coverageType: string; rideShareCoverage?: number };
  };
  engineB_incomplete: {
    companyShare: number;
    driverShare: number;
    miscellaneousCost: number;
    fuelRule?: { coverageType: string; rideShareCoverage?: number };
    coverageType?: string;
  };
  expectDivergence: boolean;
};

describe('Stage 0 fuel-week characterisation fixtures', () => {
  const goldens = JSON.parse(readFileSync(goldensPath, 'utf8')) as {
    eps: number;
    weeks: GoldenWeek[];
  };
  const blast = JSON.parse(readFileSync(blastPath, 'utf8')) as {
    q3_statementVsLedger: { deltaRows: unknown[] };
    gateToStage1: { q3Documented: boolean };
  };

  it('blast-radius documents live C-2 statement↔ledger delta', () => {
    expect(blast.gateToStage1.q3Documented).toBe(true);
    expect(blast.q3_statementVsLedger.deltaRows.length).toBeGreaterThan(0);
  });

  it('categoryCosts path reproduces Engine A money for percentage week', () => {
    const w = goldens.weeks.find((x) => x.id === 'percentage_60_with_categories')!;
    const entriesByDriver = new Map([
      [
        w.driverId,
        [
          {
            id: 'e1',
            amount: w.totalSpend,
            date: w.weekStart,
            driverId: w.driverId,
            vehicleId: 'v1',
          },
        ],
      ],
    ]);
    const snaps = assembleWeekSnapshotsFromCalcInput({
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      orgId: 'org-char',
      entriesByDriver,
      driverContexts: new Map([
        [
          w.driverId,
          {
            driverId: w.driverId,
            vehicleId: 'v1',
            fuelRule: w.engineA.fuelRule as any,
            categoryCosts: w.engineA.categoryCosts,
          },
        ],
      ]),
    });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].driverShare).toBeCloseTo(w.engineA.driverShare, 1);
    expect(snaps[0].companyShare).toBeCloseTo(w.engineA.companyShare, 1);
  });

  it('incomplete-input path zeroes misc while Engine A keeps residual (divergence)', () => {
    const w = goldens.weeks.find((x) => x.id === 'price_unavailable_all_unexplained')!;
    const entriesByDriver = new Map([
      [
        w.driverId,
        [
          {
            id: 'e1',
            amount: w.totalSpend,
            date: w.weekStart,
            driverId: w.driverId,
            vehicleId: 'v1',
          },
        ],
      ],
    ]);
    const withCategories = assembleWeekSnapshotsFromCalcInput({
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      orgId: 'org-char',
      entriesByDriver,
      driverContexts: new Map([
        [
          w.driverId,
          {
            driverId: w.driverId,
            vehicleId: 'v1',
            categoryCosts: w.engineA.categoryCosts,
          },
        ],
      ]),
    });
    const incomplete = assembleWeekSnapshotsFromCalcInput({
      weekStart: w.weekStart,
      weekEnd: w.weekEnd,
      orgId: 'org-char',
      entriesByDriver,
      driverContexts: new Map([
        [
          w.driverId,
          {
            driverId: w.driverId,
            vehicleId: 'v1',
            // no categoryCosts → flat ratio, misc 0
          },
        ],
      ]),
    });
    expect(withCategories[0].miscellaneousCost).toBeCloseTo(28800, 0);
    expect(incomplete[0].miscellaneousCost).toBe(0);
    expect(incomplete[0].driverShare).toBeGreaterThan(0);
    const delta = weekSnapshotMoneyDelta(withCategories[0], incomplete[0]);
    expect(Math.abs(delta.driver) + Math.abs(delta.misc)).toBeGreaterThan(goldens.eps);
  });

  it('R-1 deliberately divergent fixture fails equality (non-tautological)', () => {
    const w = goldens.weeks.find((x) => x.id === 'deliberately_divergent_must_fail_parity')!;
    const delta = weekSnapshotMoneyDelta(
      {
        totalGasCardCost: w.totalSpend,
        driverShare: w.engineA.driverShare,
        companyShare: w.engineA.companyShare,
        miscellaneousCost: w.engineA.miscellaneousCost,
      },
      {
        totalGasCardCost: w.totalSpend,
        driverShare: w.engineB_incomplete.driverShare,
        companyShare: w.engineB_incomplete.companyShare,
        miscellaneousCost: w.engineB_incomplete.miscellaneousCost,
      },
    );
    expect(w.expectDivergence).toBe(true);
    expect(Math.abs(delta.driver)).toBeGreaterThan(goldens.eps);
  });
});
