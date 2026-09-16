import { describe, expect, it } from 'vitest';
import {
  FUEL_MISC_MAX_RATIO,
  FUEL_MISC_MAX_ABS_JMD,
  classifyFuelMiscResidual,
  floorMiscForSplit,
  isFuelMiscWithinGate,
  isOverExplainedFuelWeek,
  isOverExplainedResidual,
  isUnderExplainedResidual,
  residualFlagsFromSpendRows,
  computeWindowTimingCost,
} from './index.ts';
import { computeMiscellaneousCost } from './fuelCoverageSplit.ts';

describe('classifyFuelMiscResidual (C-7 / F-9)', () => {
  it('splits over vs under by sign', () => {
    expect(classifyFuelMiscResidual(10000, -3000)).toBe('over_explained');
    expect(classifyFuelMiscResidual(10000, 3000)).toBe('under_explained');
    expect(classifyFuelMiscResidual(10000, 2000)).toBe('ok');
    expect(isOverExplainedResidual(10000, -3000)).toBe(true);
    expect(isUnderExplainedResidual(10000, 3000)).toBe(true);
    expect(isOverExplainedResidual(10000, 3000)).toBe(false);
  });

  it('F-9: absolute cap blocks high-spend weeks inside ratio', () => {
    // 20% of 100k = 20k > 5000 abs → under_explained
    expect(classifyFuelMiscResidual(100000, 20000)).toBe('under_explained');
    expect(FUEL_MISC_MAX_ABS_JMD).toBe(5000);
  });
});

describe('isOverExplainedFuelWeek', () => {
  it('passes a week whose misc is inside the 25% band and abs cap', () => {
    expect(isOverExplainedFuelWeek(10000, 2000)).toBe(false);
    expect(isFuelMiscWithinGate(10000, 2000)).toBe(true);
  });

  it('flags a week whose misc exceeds 25% of spend', () => {
    expect(isOverExplainedFuelWeek(10000, 3000)).toBe(true);
    expect(isFuelMiscWithinGate(10000, 3000)).toBe(false);
  });

  it('flags large negative misc (fleet owes driver) — the audit debit week', () => {
    expect(isOverExplainedFuelWeek(30000, -27898.73)).toBe(true);
  });

  it('treats any nonzero misc with zero spend as residual (legacy abs)', () => {
    expect(isOverExplainedFuelWeek(0, 0.01)).toBe(true);
    expect(isOverExplainedFuelWeek(0, 0)).toBe(false);
  });

  it('honors a custom ratio', () => {
    expect(isOverExplainedFuelWeek(10000, 3000, 0.5)).toBe(false);
    expect(FUEL_MISC_MAX_RATIO).toBe(0.25);
  });
});

describe('floorMiscForSplit', () => {
  it('passes a positive misc straight through', () => {
    expect(floorMiscForSplit(1500)).toEqual({
      miscForSplit: 1500,
      overExplainedCost: 0,
    });
  });

  it('floors a negative misc to 0 and reports it as over-explained', () => {
    expect(floorMiscForSplit(-27898.73)).toEqual({
      miscForSplit: 0,
      overExplainedCost: 27898.73,
    });
  });

  it('handles zero and dirty input', () => {
    expect(floorMiscForSplit(0)).toEqual({ miscForSplit: 0, overExplainedCost: 0 });
    // @ts-expect-error characterization of dirty upstream input
    expect(floorMiscForSplit(undefined)).toEqual({ miscForSplit: 0, overExplainedCost: 0 });
  });
});

describe('F-4 residualFlagsFromSpendRows', () => {
  it('opposing residuals do not cancel — both flags fire', () => {
    const flags = residualFlagsFromSpendRows([
      { totalSpend: 20000, miscellaneousCost: 10000, driverId: 'A' },
      { totalSpend: 20000, miscellaneousCost: -10000, driverId: 'B' },
    ]);
    expect(flags.anyOverExplained).toBe(true);
    expect(flags.anyUnderExplained).toBe(true);
    // Aggregate would be 0 → ok, which is the bug we prevent
    expect(classifyFuelMiscResidual(40000, 0)).toBe('ok');
  });
});

describe('F-1 perfect week residual floor', () => {
  it('first-fill litres × price land in timing, not unexplained', () => {
    // Audit synthetic: 6 fills × 25L @ $180, efficiencyFuel = 5×25 = 125
    const totalLiters = 150;
    const efficiencyFuel = 125;
    const price = 180;
    const timing = computeWindowTimingCost(totalLiters, efficiencyFuel, price);
    expect(timing).toBe(4500);
    const misc = computeMiscellaneousCost(27000, {
      rideShare: 22500,
      windowTiming: timing,
    });
    expect(misc).toBeCloseTo(0, 5);
  });
});
