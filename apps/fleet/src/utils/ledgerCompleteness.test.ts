import { describe, expect, it } from 'vitest';
import { assertPaginationCompleteness, assertStatsAgree } from './ledgerCompleteness';

describe('assertPaginationCompleteness', () => {
  it('passes for disjoint pages covering the set', () => {
    const r = assertPaginationCompleteness(
      [['a', 'b'], ['c']],
      ['a', 'b', 'c'],
    );
    expect(r).toEqual({ ok: true });
  });

  it('fails on duplicates', () => {
    const r = assertPaginationCompleteness([['a'], ['a']], ['a']);
    expect(r.ok).toBe(false);
  });

  it('fails on missing', () => {
    const r = assertPaginationCompleteness([['a']], ['a', 'b']);
    expect(r.ok).toBe(false);
  });
});

describe('assertStatsAgree', () => {
  it('matches cents', () => {
    expect(
      assertStatsAgree(
        [{ amount: 10.1, net: 9.05 }, { amount: 0.2, net: 0.1 }],
        { sumAmount: 10.3, sumNet: 9.15 },
      ),
    ).toEqual({ ok: true });
  });
});
