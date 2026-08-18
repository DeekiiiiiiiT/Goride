import { describe, expect, it } from 'vitest';
import {
  blendedDriverShareRatio,
  blendedDriverShareRatioFromReport,
} from './blendedDriverShareRatio';

describe('blendedDriverShareRatio', () => {
  it('returns driverShare / totalGasCardCost', () => {
    expect(blendedDriverShareRatio(250, 1000)).toBeCloseTo(0.25, 10);
  });

  it('returns 0 when total is 0 or negative', () => {
    expect(blendedDriverShareRatio(250, 0)).toBe(0);
    expect(blendedDriverShareRatio(250, -5)).toBe(0);
  });

  it('falls back to gasCardSpend on report helper', () => {
    expect(
      blendedDriverShareRatioFromReport({ driverShare: 40, gasCardSpend: 200 }),
    ).toBeCloseTo(0.2, 10);
  });
});
