import { describe, expect, it } from 'vitest';
import {
  splitAmountByStatementWeeks,
  statementWeekWeightsFromTrips,
} from './statementWeekSplit.ts';

describe('statementWeekSplit', () => {
  it('keeps a single week as one slice (stable import keys)', () => {
    const w = statementWeekWeightsFromTrips([
      { date: '2026-08-03', platform: 'Uber', amount: 100 },
      { date: '2026-08-09', platform: 'Uber', amount: 50 },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].weekKey).toBe('2026-08-03');
    const slices = splitAmountByStatementWeeks(1000, w, '2026-08-03');
    expect(slices).toEqual([{ weekKey: '2026-08-03', date: '2026-08-03', amount: 1000 }]);
  });

  it('splits a spanning CSV by trip earnings and lands cents on the last week', () => {
    const w = statementWeekWeightsFromTrips([
      { date: '2026-08-09', platform: 'Uber', amount: 100 },
      { date: '2026-08-10', platform: 'Uber', amount: 100 },
    ]);
    expect(w.map((x) => x.weekKey)).toEqual(['2026-08-03', '2026-08-10']);
    const slices = splitAmountByStatementWeeks(10.01, w, '2026-08-09');
    expect(slices).toHaveLength(2);
    expect(slices[0].amount).toBe(5.01);
    expect(slices[1].amount).toBe(5);
    expect(slices.reduce((s, x) => s + x.amount, 0)).toBe(10.01);
  });
});
