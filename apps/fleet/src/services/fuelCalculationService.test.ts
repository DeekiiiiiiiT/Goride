import { describe, it, expect } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService';
import type { WeeklyFuelReport, FuelEntry, FuelRule } from '../types/fuel';

/**
 * Pins the fix for the settlement-math divergence bug: settlementService used to
 * split each fuel entry by a flat 'rideShare' coverage rule regardless of category,
 * which could diverge sharply from the category-weighted `driverShare` shown on the
 * Reconciliation table and frozen into the finalized snapshot. getBlendedDriverShareRatio
 * is the single ratio settlementService now uses to split entries, guaranteeing that
 * the sum of entry-level driver splits equals report.driverShare (to rounding).
 */
describe('getBlendedDriverShareRatio', () => {
  const baseReport: Partial<WeeklyFuelReport> = {
    totalGasCardCost: 1000,
    driverShare: 250,
    companyShare: 750,
  };

  it('returns driverShare / totalGasCardCost', () => {
    const ratio = FuelCalculationService.getBlendedDriverShareRatio(baseReport as WeeklyFuelReport);
    expect(ratio).toBeCloseTo(0.25, 10);
  });

  it('returns 0 when totalGasCardCost is 0 (avoids divide-by-zero)', () => {
    const ratio = FuelCalculationService.getBlendedDriverShareRatio({
      ...baseReport,
      totalGasCardCost: 0,
    } as WeeklyFuelReport);
    expect(ratio).toBe(0);
  });

  it('returns 0 when totalGasCardCost is negative or missing', () => {
    expect(
      FuelCalculationService.getBlendedDriverShareRatio({ driverShare: 250 } as WeeklyFuelReport)
    ).toBe(0);
    expect(
      FuelCalculationService.getBlendedDriverShareRatio({
        totalGasCardCost: -5,
        driverShare: 250,
      } as WeeklyFuelReport)
    ).toBe(0);
  });

  it('sum of entry-level driver splits (using the blended ratio) equals report.driverShare', () => {
    const report = { ...baseReport } as WeeklyFuelReport;
    const entries: Pick<FuelEntry, 'amount'>[] = [
      { amount: 400 },
      { amount: 350 },
      { amount: 250 },
    ];

    const ratio = FuelCalculationService.getBlendedDriverShareRatio(report);
    const totalDriverSplit = entries.reduce((sum, e) => sum + e.amount * ratio, 0);

    expect(totalDriverSplit).toBeCloseTo(report.driverShare, 10);
  });
});

/**
 * Pins the fallback-display fix: ScenarioEditor.tsx and ScenarioSplitDashboard.tsx
 * used to pre-fill/compute with hardcoded fallbacks (?? 100, ?? 0) that diverged
 * from this function's actual fallback chain, so the config screen showed numbers
 * that didn't match what reconciliation actually computed. These tests pin the
 * one true fallback chain that every consumer must match.
 */
describe('getCategoryCoverageSplit', () => {
  const percentageRule = (overrides: Partial<FuelRule> = {}): FuelRule => ({
    id: 'r1',
    category: 'Fuel',
    coverageType: 'Percentage',
    coverageValue: 70,
    ...overrides,
  });

  it('returns company:amount, driver:0 when no rule is provided', () => {
    const r = FuelCalculationService.getCategoryCoverageSplit('rideShare', 100, undefined);
    expect(r).toEqual({ company: 100, driver: 0 });
  });

  it('Full coverage: company pays everything regardless of category', () => {
    const rule = percentageRule({ coverageType: 'Full', coverageValue: 100 });
    const r = FuelCalculationService.getCategoryCoverageSplit('personal', 200, rule);
    expect(r).toEqual({ company: 200, driver: 0 });
  });

  it('Fixed_Amount: company covers up to the allowance, driver covers the rest', () => {
    const rule = percentageRule({ coverageType: 'Fixed_Amount', coverageValue: 30 });
    expect(FuelCalculationService.getCategoryCoverageSplit('misc', 100, rule)).toEqual({ company: 30, driver: 70 });
    expect(FuelCalculationService.getCategoryCoverageSplit('misc', 20, rule)).toEqual({ company: 20, driver: 0 });
  });

  it.each([
    ['rideShare', 'rideShareCoverage'],
    ['companyUsage', 'companyUsageCoverage'],
    ['personal', 'personalCoverage'],
    ['misc', 'miscCoverage'],
  ] as const)('%s falls back to coverageValue when %s is unset', (category) => {
    const rule = percentageRule({ coverageValue: 70 }); // no granular fields set
    const r = FuelCalculationService.getCategoryCoverageSplit(category, 100, rule);
    expect(r.company).toBeCloseTo(70, 10);
    expect(r.driver).toBeCloseTo(30, 10);
  });

  it.each([
    ['rideShare', 'rideShareCoverage'],
    ['companyUsage', 'companyUsageCoverage'],
    ['personal', 'personalCoverage'],
    ['misc', 'miscCoverage'],
  ] as const)('%s uses its own explicit %s override when set', (category, field) => {
    const rule = percentageRule({ coverageValue: 70, [field]: 20 } as Partial<FuelRule>);
    const r = FuelCalculationService.getCategoryCoverageSplit(category, 100, rule);
    expect(r.company).toBeCloseTo(20, 10);
    expect(r.driver).toBeCloseTo(80, 10);
  });

  it('deadhead falls back to companyUsageCoverage, then coverageValue', () => {
    const noOverrides = percentageRule({ coverageValue: 70 });
    expect(FuelCalculationService.getCategoryCoverageSplit('deadhead', 100, noOverrides).company).toBeCloseTo(70, 10);

    const withCompanyUsage = percentageRule({ coverageValue: 70, companyUsageCoverage: 40 });
    expect(FuelCalculationService.getCategoryCoverageSplit('deadhead', 100, withCompanyUsage).company).toBeCloseTo(40, 10);

    const withOwnOverride = percentageRule({ coverageValue: 70, companyUsageCoverage: 40, deadheadCoverage: 10 });
    expect(FuelCalculationService.getCategoryCoverageSplit('deadhead', 100, withOwnOverride).company).toBeCloseTo(10, 10);
  });
});
