import { describe, expect, it } from 'vitest';
import type { FuelRule } from '../types/fuel';
import {
  getCategoryCoverageSplit,
  getCompanyCoveragePercent,
  normalizePercentageRule,
  splitAllCategoryCosts,
  SAMPLE_WEEK_COSTS,
  sumSplitTotals,
} from './fuelCoverageSplit';

const percentageRule = (overrides: Partial<FuelRule> = {}): FuelRule => ({
  id: 'r1',
  category: 'Fuel',
  coverageType: 'Percentage',
  coverageValue: 70,
  ...overrides,
});

describe('fuelCoverageSplit', () => {
  it('Full: Personal is always driver; other categories company', () => {
    const rule = percentageRule({ coverageType: 'Full', coverageValue: 100 });
    expect(getCategoryCoverageSplit('personal', 200, rule)).toEqual({ company: 0, driver: 200 });
    expect(getCategoryCoverageSplit('rideShare', 100, rule)).toEqual({ company: 100, driver: 0 });
    expect(getCategoryCoverageSplit('misc', 50, rule)).toEqual({ company: 50, driver: 0 });
  });

  it('Percentage uses granular overrides and deadhead fallback chain', () => {
    expect(getCompanyCoveragePercent('deadhead', percentageRule({ coverageValue: 70 }))).toBe(70);
    expect(
      getCompanyCoveragePercent('deadhead', percentageRule({ coverageValue: 70, companyUsageCoverage: 40 })),
    ).toBe(40);
    expect(
      getCompanyCoveragePercent(
        'deadhead',
        percentageRule({ coverageValue: 70, companyUsageCoverage: 40, deadheadCoverage: 10 }),
      ),
    ).toBe(10);
  });

  it('Fixed_Amount pool: allowance on rideShare+misc; ops/deadhead company; personal driver', () => {
    const rule = percentageRule({ coverageType: 'Fixed_Amount', coverageValue: 60 });
    const split = splitAllCategoryCosts(
      { rideShare: 80, companyUsage: 20, deadhead: 10, personal: 40, misc: 40 },
      rule,
    );
    expect(split.company.companyUsage).toBe(20);
    expect(split.company.deadhead).toBe(10);
    expect(split.driver.personal).toBe(40);
    // variable = 120, covered = 60 → ratio 0.5
    expect(split.company.rideShare).toBeCloseTo(40, 10);
    expect(split.company.misc).toBeCloseTo(20, 10);
    expect(split.driver.rideShare).toBeCloseTo(40, 10);
    expect(split.driver.misc).toBeCloseTo(20, 10);
  });

  it('Fixed_Amount when allowance exceeds variable covers all rideShare+misc', () => {
    const rule = percentageRule({ coverageType: 'Fixed_Amount', coverageValue: 500 });
    const split = splitAllCategoryCosts(
      { rideShare: 80, companyUsage: 0, deadhead: 0, personal: 10, misc: 20 },
      rule,
    );
    expect(split.company.rideShare).toBeCloseTo(80, 10);
    expect(split.company.misc).toBeCloseTo(20, 10);
    expect(split.driver.rideShare).toBeCloseTo(0, 10);
  });

  it('normalizePercentageRule persists all five granular fields', () => {
    const n = normalizePercentageRule(percentageRule({ coverageValue: 50, rideShareCoverage: 80 }));
    expect(n.rideShareCoverage).toBe(80);
    expect(n.companyUsageCoverage).toBe(50);
    expect(n.deadheadCoverage).toBe(50);
    expect(n.personalCoverage).toBe(50);
    expect(n.miscCoverage).toBe(50);
  });

  it('sample week preview totals balance', () => {
    const rule = percentageRule({
      coverageValue: 50,
      rideShareCoverage: 80,
      companyUsageCoverage: 100,
      deadheadCoverage: 50,
      personalCoverage: 0,
      miscCoverage: 50,
    });
    const split = splitAllCategoryCosts(SAMPLE_WEEK_COSTS, rule);
    const totals = sumSplitTotals(split);
    const costSum =
      SAMPLE_WEEK_COSTS.rideShare +
      SAMPLE_WEEK_COSTS.companyUsage +
      SAMPLE_WEEK_COSTS.deadhead +
      SAMPLE_WEEK_COSTS.personal +
      SAMPLE_WEEK_COSTS.misc;
    expect(totals.company + totals.driver).toBeCloseTo(costSum, 10);
  });
});
