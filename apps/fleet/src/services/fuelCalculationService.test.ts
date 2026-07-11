import { describe, it, expect } from 'vitest';
import { FuelCalculationService } from './fuelCalculationService';
import type { WeeklyFuelReport, FuelEntry } from '../types/fuel';

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
