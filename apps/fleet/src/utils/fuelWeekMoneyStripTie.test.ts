/**
 * N-4: sign-based money-strip identity (positive leakage must not false-red).
 */
import { describe, expect, it } from 'vitest';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

/** Mirror FuelWeekMoneyStrip split-tie rule for unit pin (avoid mounting React). */
function moneyStripSplitTie(input: {
  company: number;
  driver: number;
  leakage: number;
  totalSpend: number;
}): boolean {
  const overExplainedResidual = input.leakage < -FUEL_SPEND_EPS;
  return overExplainedResidual
    ? Math.abs(input.company + input.driver + input.leakage - input.totalSpend) <= FUEL_SPEND_EPS
    : Math.abs(input.company + input.driver - input.totalSpend) <= FUEL_SPEND_EPS;
}

describe('FuelWeekMoneyStrip N-4 sign tie', () => {
  it('positive leakage week (misc folded into shares) stays green', () => {
    expect(
      moneyStripSplitTie({
        company: 600,
        driver: 400,
        leakage: 50,
        totalSpend: 1000,
      }),
    ).toBe(true);
  });

  it('negative over-explained week includes unexplained in the equation', () => {
    expect(
      moneyStripSplitTie({
        company: 700,
        driver: 400,
        leakage: -100,
        totalSpend: 1000,
      }),
    ).toBe(true);
    expect(
      moneyStripSplitTie({
        company: 700,
        driver: 400,
        leakage: -100,
        totalSpend: 1000,
      }),
    ).toBe(
      Math.abs(700 + 400 + -100 - 1000) <= FUEL_SPEND_EPS,
    );
  });
});
