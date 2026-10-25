import { describe, expect, it } from 'vitest';
import { AUGUST_FUEL_CORRECTIONS } from './fuelShareCorrection.ts';
import { round2 } from './money.ts';
import {
  fuelCorrectionBuckets,
  legacyChoiceTotals,
  openWeekMove,
  resolvePastWeeksStep,
  legacyKeptHalf,
  splitLegacyWriteOff,
  legacyBalanceSentence,
} from './pastWeeksCleanup.ts';

describe('past weeks cleanup math', () => {
  it('names the driver on a half-week balance', () => {
    expect(legacyBalanceSentence('2025-12-29', -11714.75, 'Kenny')).toBe(
      'Week of 2025-12-29: older balance Kenny still owes $11714.75.',
    );
    expect(legacyBalanceSentence('2026-01-12', 2601.61, 'Kenny')).toBe(
      'Week of 2026-01-12: older balance the company still owes Kenny $2601.61.',
    );
    expect(legacyBalanceSentence('2025-12-29', -10, '  ')).toBe(
      'Week of 2025-12-29: older balance the driver still owes $10.00.',
    );
    expect(legacyBalanceSentence('2025-12-29', -10, 'Kenny')).not.toMatch(/\bhe\b/i);
  });

  const early = [
    ...Array.from({ length: 24 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 0, 19) + index * 7 * 86400000);
      return { sourceWeek: day.toISOString().slice(0, 10), amount: 5000 };
    }),
    { sourceWeek: '2026-07-27', amount: 24113.96 },
  ];

  const listedAugust = round2(
    Object.entries(AUGUST_FUEL_CORRECTIONS).reduce((sum, [, amount]) => sum + amount, 0),
  );
  const august = [
    ...Object.entries(AUGUST_FUEL_CORRECTIONS).map(([sourceWeek, amount]) => ({ sourceWeek, amount })),
    { sourceWeek: '2026-08-31', amount: round2(-77098.81 - listedAugust) },
  ];

  it('groups the audited fuel correction totals', () => {
    const buckets = fuelCorrectionBuckets([...early, ...august], -13191.88);
    expect(buckets.earlyCount).toBe(25);
    expect(buckets.augustCount).toBe(5);
    expect(buckets.early).toBe(144113.96);
    expect(buckets.august).toBe(-77098.81);
    expect(buckets.oct12).toBe(-13191.88);
    expect(buckets.historyTotal).toBe(67015.15);
    expect(buckets.net).toBe(53823.27);
  });

  it('moves the open week by the kept older weeks plus the correction history', () => {
    expect(openWeekMove(67015.15, -66646.59)).toBe(368.56);
    const mixed = legacyChoiceTotals(
      [{ amount: -100 }, { amount: -50 }],
      ['carry', 'write_off'],
    );
    expect(mixed).toEqual({ keep: -100, writeOff: 50, allKept: false });
    expect(openWeekMove(67015.15, mixed.keep)).toBe(66915.15);
    expect(splitLegacyWriteOff(-13623.48, 5000)).toEqual({ writeOff: 5000, keep: -8623.48 });
    expect(splitLegacyWriteOff(5586.73, 5586.73)).toEqual({ writeOff: 5586.73, keep: 0 });
    expect(legacyKeptHalf(-23429.49)).toBe(-11714.75);
    expect(legacyKeptHalf(5203.22)).toBe(2601.61);
    expect(round2(legacyKeptHalf(-23429.49) + legacyKeptHalf(5203.22))).toBe(-9113.14);
    const partial = legacyChoiceTotals(
      [{ amount: -13623.48 }],
      ['write_off'],
      [5000],
    );
    expect(partial).toEqual({ keep: -8623.48, writeOff: 5000, allKept: false });
  });

  it('keeps the four steps in order', () => {
    expect(resolvePastWeeksStep({
      legacyRemaining: 6,
      closeWeeksOpen: 5,
      correctionsPending: true,
      payoutsPosted: false,
    })).toBe(1);
    expect(resolvePastWeeksStep({
      legacyRemaining: 0,
      closeWeeksOpen: 2,
      correctionsPending: true,
      payoutsPosted: false,
    })).toBe(2);
    expect(resolvePastWeeksStep({
      legacyRemaining: 0,
      closeWeeksOpen: 0,
      correctionsPending: true,
      payoutsPosted: false,
    })).toBe(3);
    expect(resolvePastWeeksStep({
      legacyRemaining: 0,
      closeWeeksOpen: 0,
      correctionsPending: false,
      payoutsPosted: false,
    })).toBe(4);
    expect(resolvePastWeeksStep({
      legacyRemaining: 0,
      closeWeeksOpen: 0,
      correctionsPending: false,
      payoutsPosted: true,
    })).toBe('done');
  });
});
