import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeTagBurnRate,
  estimateTripsRemaining,
  balanceRingState,
} from './tollTagBurnRate';

function usage(date: string, amount: number) {
  return { date, amount: -Math.abs(amount) };
}

afterEach(() => vi.useRealTimers());

describe('computeTagBurnRate', () => {
  it('divides by the real span rather than a hardcoded week', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00'));
    // 28 days of history, J$2800 spent -> J$700/week, not J$2800/week.
    const rows = [
      usage('2026-01-01', 1400),
      usage('2026-01-29', 1400),
    ];
    const { perWeek, spanDays } = computeTagBurnRate(rows);
    expect(spanDays).toBe(28);
    expect(Math.round(perWeek)).toBe(700);
  });

  it('never reports a rate off a single transaction', () => {
    const { perWeek, reliable } = computeTagBurnRate([usage('2026-01-01', 500)]);
    expect(reliable).toBe(false);
    expect(perWeek).toBe(3500);
  });

  it('clamps a period end to today so future days do not dilute the rate', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00'));
    const rows = [usage('2026-01-01', 700), usage('2026-01-08', 700)];
    const { spanDays } = computeTagBurnRate(rows, {
      start: new Date('2026-01-01T00:00:00'),
      end: new Date('2026-12-31T23:59:59'),
    });
    expect(spanDays).toBeCloseTo(14.5, 1);
  });

  it('honours an explicit period start that is later than the first row', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00'));
    const rows = [usage('2026-01-01', 700), usage('2026-02-01', 700)];
    const { spanDays } = computeTagBurnRate(rows, {
      start: new Date('2026-01-25T00:00:00'),
      end: new Date('2026-02-08T00:00:00'),
    });
    expect(Math.round(spanDays)).toBe(14);
  });

  it('returns zero for an empty period instead of dividing by nothing', () => {
    expect(computeTagBurnRate([])).toEqual({ perWeek: 0, spanDays: 0, reliable: false });
  });

  it('treats a single active day as one day, not zero', () => {
    const rows = [usage('2026-01-01', 300), usage('2026-01-01', 300)];
    const { spanDays, perWeek } = computeTagBurnRate(rows);
    expect(spanDays).toBe(1);
    expect(Math.round(perWeek)).toBe(4200);
  });
});

describe('estimateTripsRemaining / balanceRingState', () => {
  it('estimates whole trips from balance ÷ avg passage', () => {
    expect(estimateTripsRemaining(550, 275)).toBe(2);
    expect(estimateTripsRemaining(0, 275)).toBe(0);
    expect(estimateTripsRemaining(550, null)).toBeNull();
  });

  it('maps ring colours per B8 thresholds', () => {
    expect(balanceRingState(1200, 500)).toBe('healthy');
    expect(balanceRingState(700, 500)).toBe('watch');
    expect(balanceRingState(400, 500)).toBe('low');
    expect(balanceRingState(0, 500)).toBe('empty');
  });
});
