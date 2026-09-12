import { describe, expect, it } from 'vitest';
import {
  aggregateStatementSummaries,
  computePeriodBalances,
} from './aggregateStatementSummaries';
import { createEmptyStatementSummary } from '../types/statementSummary';

describe('aggregateStatementSummaries', () => {
  it('sums All platforms', () => {
    const a = createEmptyStatementSummary('Roam', '2026-09-01', '2026-09-07');
    a.totalEarnings = 100;
    a.totalRefundsExpenses = 10;
    a.totalPayout = 40;
    a.periodAdjustments = 5;
    a.tripCount = 2;

    const b = createEmptyStatementSummary('Uber', '2026-09-01', '2026-09-07');
    b.totalEarnings = 50;
    b.totalRefundsExpenses = 5;
    b.totalPayout = 20;
    b.periodAdjustments = -2;
    b.tripCount = 3;

    const agg = aggregateStatementSummaries([a, b]);
    expect(agg?.totalEarnings).toBe(150);
    expect(agg?.totalRefundsExpenses).toBe(15);
    expect(agg?.totalPayout).toBe(60);
    expect(agg?.periodAdjustments).toBe(3);
    expect(agg?.tripCount).toBe(5);

    const { startBalance, endBalance } = computePeriodBalances(agg);
    expect(startBalance).toBe(0);
    // 0 + 150 - 15 + 3 - 60 = 78
    expect(endBalance).toBe(78);
  });
});
