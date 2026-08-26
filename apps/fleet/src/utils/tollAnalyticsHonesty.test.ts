import { describe, it, expect } from 'vitest';
import { buildTollTrendBuckets, trendGranularity } from './tollAnalyticsTrend';
import { computeETagMetrics } from './tollETagMetrics';

describe('trendGranularity', () => {
  it('uses daily buckets for a range of 45 days or less', () => {
    expect(trendGranularity('2026-01-01', '2026-02-14')).toBe('daily');
    expect(trendGranularity('2026-01-01', '2026-02-16')).toBe('monthly');
  });
});

describe('buildTollTrendBuckets', () => {
  it('splits refunds out of top-ups', () => {
    const { buckets } = buildTollTrendBuckets(
      [
        { date: '2026-01-05', isUsage: true, absAmount: 300, creditKind: 'usage' },
        { date: '2026-01-05', isUsage: false, absAmount: 1000, creditKind: 'top-up' },
        { date: '2026-01-05', isUsage: false, absAmount: 200, creditKind: 'refund' },
      ],
      '2026-01-05',
      '2026-01-05',
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].spend).toBe(300);
    expect(buckets[0].topups).toBe(1000);
    expect(buckets[0].refunds).toBe(200);
    expect(buckets[0].passages).toBe(1);
  });

  it('emits one bucket per day for a short range', () => {
    const { granularity, buckets } = buildTollTrendBuckets(
      [{ date: '2026-01-02', isUsage: true, absAmount: 100 }],
      '2026-01-01',
      '2026-01-03',
    );
    expect(granularity).toBe('daily');
    expect(buckets.map((b) => b.key)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(buckets[1].spend).toBe(100);
  });
});

describe('computeETagMetrics', () => {
  const card = [
    {
      plazaId: 'p1',
      plazaName: 'Vineyard',
      rates: { class1: { withTag: 370, withoutTag: 380 } },
    },
  ];

  it('prices cash savings from the real rate-card delta, not a flat 10%', () => {
    const result = computeETagMetrics(
      [
        { plazaId: 'p1', paymentMethodDisplay: 'Cash', hasTag: false, absAmount: 380 },
        { plazaId: 'p1', paymentMethodDisplay: 'Cash', hasTag: false, absAmount: 380 },
        { plazaId: 'p1', paymentMethodDisplay: 'E-Tag', hasTag: true, absAmount: 370 },
      ],
      card,
    );
    // 2 cash × (380 − 370) = 20, not 2 × 380 × 0.10 = 76
    expect(result.potentialSavings).toBe(20);
    expect(result.pricedCashPassages).toBe(2);
    expect(result.adoptionRate).toBeCloseTo(33.333, 2);
    expect(result.taggedPassages).toBe(1);
  });

  it('counts adoption from actual tag presence, not "not cash"', () => {
    const result = computeETagMetrics(
      [
        { paymentMethodDisplay: 'Card', hasTag: false, absAmount: 400 },
        { paymentMethodDisplay: 'E-Tag', hasTag: true, absAmount: 370 },
      ],
      card,
    );
    expect(result.adoptionRate).toBe(50);
    expect(result.taggedPassages).toBe(1);
  });

  it('reports unpriced cash when the plaza has no rate', () => {
    const result = computeETagMetrics(
      [{ plazaName: 'Unknown', paymentMethodDisplay: 'Cash', hasTag: false, absAmount: 500 }],
      card,
    );
    expect(result.potentialSavings).toBe(0);
    expect(result.unpricedCashPassages).toBe(1);
  });
});
