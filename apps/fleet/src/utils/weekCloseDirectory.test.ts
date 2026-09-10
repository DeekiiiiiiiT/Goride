import { describe, expect, it } from 'vitest';
import {
  accumulateWeekDirectory,
  cashAllSettled,
  selectFullyFrozenWeeks,
  selectOpenWeeks,
} from '@roam/finance-core';

describe('weekCloseDirectory (via @roam/finance-core)', () => {
  it('marks cashAllSettled when every driver is settled', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-24', frozen: false, settled: true },
      { weekKey: '2026-08-24', frozen: false, settled: true },
    ]);
    expect(cashAllSettled(aggs[0]!)).toBe(true);
    expect(selectOpenWeeks(aggs)[0]!.cashAllSettled).toBe(true);
  });

  it('excludes fully frozen weeks from open directory', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-31', frozen: true, settled: true, signedAt: '2026-09-09T12:00:00Z' },
      { weekKey: '2026-08-24', frozen: false, settled: true },
    ]);
    expect(selectOpenWeeks(aggs).map((w) => w.weekKey)).toEqual(['2026-08-24']);
    expect(selectFullyFrozenWeeks(aggs).map((w) => w.weekKey)).toEqual(['2026-08-31']);
  });

  it('cashAllSettled false when any driver is not settled', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-17', frozen: false, settled: true },
      { weekKey: '2026-08-17', frozen: false, settled: false },
    ]);
    expect(cashAllSettled(aggs[0]!)).toBe(false);
  });
});
