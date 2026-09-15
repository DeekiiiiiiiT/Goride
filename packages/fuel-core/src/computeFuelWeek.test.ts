import { describe, expect, it } from 'vitest';
import { computeFuelWeek, diffWeekCalc, weekCalcMatches } from './computeFuelWeek.ts';
import { assertCategoryCostsTieSpend } from './fuelCoverageSplit.ts';

describe('computeFuelWeek', () => {
  it('matches percentage category money', () => {
    const calc = computeFuelWeek({
      totalSpend: 1000,
      rideShareCost: 1000,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 0,
      rule: { coverageType: 'Percentage', rideShareCoverage: 60 },
    });
    expect(calc.driverShare).toBeCloseTo(400, 5);
    expect(calc.companyShare).toBeCloseTo(600, 5);
    expect(calc.miscellaneousCost).toBeCloseTo(0, 5);
    expect(calc.residualKind).toBe('ok');
  });

  it('detects shadow mismatches (enforce input)', () => {
    const a = { totalSpend: 100, companyShare: 100, driverShare: 0, miscellaneousCost: 0 };
    const b = { totalSpend: 100, companyShare: 50, driverShare: 50, miscellaneousCost: 0 };
    expect(weekCalcMatches(a, b)).toBe(false);
    expect(diffWeekCalc(a, b).some((d) => d.field === 'driverShare')).toBe(true);
  });

  it('C-4 spend tie holds for residual definition', () => {
    expect(
      assertCategoryCostsTieSpend(
        1000,
        {
          rideShareCost: 700,
          companyUsageCost: 100,
          deadheadCost: 50,
          personalUsageCost: 50,
        },
        100,
      ),
    ).toBe(true);
  });
});
