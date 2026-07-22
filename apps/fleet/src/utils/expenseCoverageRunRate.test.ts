import { describe, expect, it } from 'vitest';
import {
  buildExpenseSpendBreakdown,
  defaultSpendGrain,
  inclusiveDayCount,
  resolveCoverageWindow,
  rollSpendSeries,
  runRateAverages,
} from './expenseCoverageRunRate';

describe('inclusiveDayCount', () => {
  it('counts inclusive calendar days', () => {
    expect(inclusiveDayCount('2026-01-01', '2026-01-01')).toBe(1);
    expect(inclusiveDayCount('2026-04-01', '2026-04-30')).toBe(30);
    expect(inclusiveDayCount('2025-01-01', '2025-12-31')).toBe(365);
  });
});

describe('resolveCoverageWindow', () => {
  it('prorates amount across explicit coverage days', () => {
    const w = resolveCoverageWindow(
      {
        id: 'r1',
        category: 'Insurance',
        amount: 3650,
        frequency: 'annually',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      '2025-12-31',
    );
    expect(w).not.toBeNull();
    expect(w!.dailyRate).toBeCloseTo(10, 5);
  });

  it('infers one annual window when endDate is missing', () => {
    const w = resolveCoverageWindow(
      {
        id: 'r1',
        category: 'Insurance',
        amount: 36500,
        frequency: 'annually',
        startDate: '2025-01-01',
      },
      '2026-04-30',
    );
    expect(w).not.toBeNull();
    expect(w!.endYmd).toBe('2025-12-31');
    expect(inclusiveDayCount(w!.startYmd, w!.endYmd)).toBe(365);
  });
});

describe('buildExpenseSpendBreakdown', () => {
  it('spreads annual premium into April even with no cash in April', () => {
    const amount = 120_504.08;
    const start = '2025-01-01';
    const end = '2025-12-31';
    const days = inclusiveDayCount(start, end);
    const daily = amount / days;

    const result = buildExpenseSpendBreakdown(
      '2025-04-01',
      '2025-04-30',
      [
        {
          id: 'ins',
          category: 'Insurance',
          amount,
          frequency: 'annually',
          startDate: start,
          endDate: end,
          isActive: true,
        },
      ],
      [],
    );

    expect(result.meta.hasCashInPeriod).toBe(false);
    expect(result.meta.hasCoverageInPeriod).toBe(true);
    expect(result.asPaid.periodTotal).toBe(0);
    expect(result.spread.periodTotal).toBeCloseTo(daily * 30, 0);
    expect(result.spread.byCategory[0]?.category).toBe('Insurance');
  });

  it('as-paid shows full hit on due date; spread shows only period slice', () => {
    const amount = 3650;
    const result = buildExpenseSpendBreakdown(
      '2025-01-01',
      '2025-01-31',
      [
        {
          id: 'ins',
          category: 'Insurance',
          amount,
          frequency: 'annually',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          isActive: true,
        },
      ],
      [
        {
          dateYmd: '2025-01-01',
          category: 'Insurance',
          amount,
          kind: 'fixed_expense',
        },
      ],
    );

    expect(result.asPaid.periodTotal).toBe(3650);
    // Jan = 31 days of 365
    expect(result.spread.periodTotal).toBeCloseTo((3650 / 365) * 31, 1);
  });

  it('returns 0 spread when coverage does not overlap period', () => {
    const result = buildExpenseSpendBreakdown(
      '2026-04-01',
      '2026-04-30',
      [
        {
          id: 'ins',
          category: 'Insurance',
          amount: 10000,
          frequency: 'annually',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          isActive: true,
        },
      ],
      [],
    );
    expect(result.meta.hasCoverageInPeriod).toBe(false);
    expect(result.spread.periodTotal).toBe(0);
  });

  it('includes fuel point events in both lenses', () => {
    const result = buildExpenseSpendBreakdown(
      '2025-04-01',
      '2025-04-30',
      [],
      [{ dateYmd: '2025-04-10', category: 'Fuel', amount: 500, kind: 'fuel' }],
    );
    expect(result.asPaid.periodTotal).toBe(500);
    expect(result.spread.periodTotal).toBe(500);
    expect(result.meta.hasCashInPeriod).toBe(true);
  });

  it('Oct cash vs spread and April no-payment scenarios', () => {
    const amount = 120_450; // divisible for clean daily math
    const start = '2025-01-01';
    const end = '2025-12-31';
    const days = inclusiveDayCount(start, end);
    const daily = amount / days;
    const rules = [
      {
        id: 'ins',
        category: 'Insurance',
        amount,
        frequency: 'annually',
        startDate: start,
        endDate: end,
        isActive: true,
      },
    ];
    const dueEvent = [
      {
        dateYmd: '2025-10-01',
        category: 'Insurance',
        amount,
        kind: 'fixed_expense' as const,
      },
    ];

    const oct = buildExpenseSpendBreakdown('2025-10-01', '2025-10-31', rules, dueEvent);
    expect(oct.asPaid.periodTotal).toBe(amount);
    expect(oct.spread.periodTotal).toBeCloseTo(daily * 31, 0);

    const apr = buildExpenseSpendBreakdown('2025-04-01', '2025-04-30', rules, []);
    expect(apr.asPaid.periodTotal).toBe(0);
    expect(apr.meta.hasCashInPeriod).toBe(false);
    expect(apr.meta.hasCoverageInPeriod).toBe(true);
    expect(apr.spread.periodTotal).toBeCloseTo(daily * 30, 0);

    const aprBuckets = rollSpendSeries(apr.spread.seriesDaily, 'day');
    expect(aprBuckets.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(apr.spread.periodTotal, 1);
  });

  it('prorates partial month when coverage starts mid-month', () => {
    const result = buildExpenseSpendBreakdown(
      '2025-04-01',
      '2025-04-30',
      [
        {
          id: 'gps',
          category: 'Security',
          amount: 3000,
          frequency: 'monthly',
          startDate: '2025-04-16',
          endDate: '2025-04-30',
          isActive: true,
        },
      ],
      [],
    );
    // 15 days of $3000 / 15 = $200/day → $3000
    expect(result.spread.periodTotal).toBeCloseTo(3000, 1);
  });
});

describe('rollSpendSeries / defaults', () => {
  it('picks grain from range length', () => {
    expect(defaultSpendGrain('2025-10-01', '2025-10-31')).toBe('day');
    expect(defaultSpendGrain('2025-01-01', '2025-03-31')).toBe('week');
    expect(defaultSpendGrain('2025-01-01', '2025-12-31')).toBe('month');
  });

  it('rolls daily into month buckets with stable total', () => {
    const daily = [
      { dateYmd: '2025-04-01', amount: 10 },
      { dateYmd: '2025-04-15', amount: 20 },
      { dateYmd: '2025-05-01', amount: 5 },
    ];
    const months = rollSpendSeries(daily, 'month');
    expect(months).toEqual([
      { key: '2025-04', label: '2025-04', amount: 30 },
      { key: '2025-05', label: '2025-05', amount: 5 },
    ]);
  });

  it('computes run-rate averages', () => {
    const avg = runRateAverages(300, '2025-04-01', '2025-04-30');
    expect(avg.perDay).toBe(10);
    expect(avg.perWeek).toBe(70);
  });
});
