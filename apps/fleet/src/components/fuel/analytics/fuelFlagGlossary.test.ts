import { describe, expect, it } from 'vitest';
import { flagCheckGuideForReason, plainEnglishForFlagReason } from './fuelFlagGlossary';

describe('flagCheckGuideForReason', () => {
  it('gives concrete checks for Approaching Capacity', () => {
    const g = flagCheckGuideForReason('Approaching Capacity');
    expect(g.summary.toLowerCase()).toMatch(/tank/);
    expect(g.checks.length).toBeGreaterThanOrEqual(3);
    expect(g.checks.some((c) => /tank capacity/i.test(c))).toBe(true);
  });

  it('matches Tank Overflow with trailing detail', () => {
    const g = flagCheckGuideForReason(
      'Tank Overflow: Single transaction exceeds tank capacity',
    );
    expect(g.checks.some((c) => /tank capacity/i.test(c))).toBe(true);
  });

  it('covers odometer regression', () => {
    const g = flagCheckGuideForReason('Odometer Regression');
    expect(g.checks.some((c) => /previous fill/i.test(c) || /reading/i.test(c))).toBe(true);
  });

  it('plainEnglish stays a one-liner summary', () => {
    expect(plainEnglishForFlagReason('Fragmented Purchase').length).toBeGreaterThan(10);
    expect(plainEnglishForFlagReason('Fragmented Purchase')).not.toMatch(/\n/);
  });
});
