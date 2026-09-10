import { describe, expect, it } from 'vitest';
import {
  accumulateWeekDirectory,
  cashAllSettled,
  selectFullyFrozenWeeks,
  selectOpenWeeks,
} from './weekCloseDirectory.ts';

describe('weekCloseDirectory', () => {
  it('marks cashAllSettled when every driver is settled', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-24', frozen: false, settled: true },
      { weekKey: '2026-08-24', frozen: false, settled: true },
    ]);
    expect(aggs).toHaveLength(1);
    expect(cashAllSettled(aggs[0]!)).toBe(true);
    const open = selectOpenWeeks(aggs);
    expect(open).toHaveLength(1);
    expect(open[0]!.cashAllSettled).toBe(true);
  });

  it('excludes fully frozen weeks from open directory', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-31', frozen: true, settled: true, signedAt: '2026-09-09T12:00:00Z' },
      { weekKey: '2026-08-24', frozen: false, settled: true },
    ]);
    const open = selectOpenWeeks(aggs);
    expect(open.map((w) => w.weekKey)).toEqual(['2026-08-24']);
    const closed = selectFullyFrozenWeeks(aggs);
    expect(closed.map((w) => w.weekKey)).toEqual(['2026-08-31']);
    expect(closed[0]!.closedAt).toBe('2026-09-09T12:00:00Z');
  });

  it('cashAllSettled false when any driver is not settled', () => {
    const aggs = accumulateWeekDirectory([
      { weekKey: '2026-08-17', frozen: false, settled: true },
      { weekKey: '2026-08-17', frozen: false, settled: false },
    ]);
    expect(cashAllSettled(aggs[0]!)).toBe(false);
    expect(selectOpenWeeks(aggs)[0]!.cashAllSettled).toBe(false);
  });
});
