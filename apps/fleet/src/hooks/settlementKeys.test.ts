/**
 * Guard against S1-7/S1-8 class bugs: React Query keys must include every input
 * that changes the settlement response.
 */
import { describe, expect, it } from 'vitest';
import { settlementKeys } from '../hooks/useSettlementQueue';

describe('settlementKeys', () => {
  it('queue key includes view, weeks, minAmount, scope, search, page, groupBy, ageBucket, sort', () => {
    const key = settlementKeys.queue({
      view: 'pay',
      weekFrom: '2026-01-01',
      weekTo: '2026-01-31',
      minAmount: 0,
      scope: 'rideshare',
      search: 'ann',
      page: 2,
      pageSize: 200,
      groupBy: 'driver',
      ageBucket: '31-60',
      sort: 'amount_desc',
    });
    const payload = key[key.length - 1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      view: 'pay',
      weekFrom: '2026-01-01',
      weekTo: '2026-01-31',
      minAmount: 0,
      scope: 'rideshare',
      search: 'ann',
      page: 2,
      pageSize: 200,
      groupBy: 'driver',
      ageBucket: '31-60',
      sort: 'amount_desc',
    });
  });

  it('different ageBucket or sort yields different queue keys', () => {
    const base = {
      view: 'collect' as const,
      weekFrom: '2026-01-01',
      weekTo: '2026-01-31',
    };
    const a = JSON.stringify(settlementKeys.queue({ ...base, ageBucket: '0-30' }));
    const b = JSON.stringify(settlementKeys.queue({ ...base, ageBucket: '90+' }));
    const c = JSON.stringify(settlementKeys.queue({ ...base, sort: 'age_desc' }));
    const d = JSON.stringify(settlementKeys.queue({ ...base, sort: 'amount_desc' }));
    expect(a).not.toEqual(b);
    expect(c).not.toEqual(d);
  });

  it('movements key includes weeks, kind, approvalState, page', () => {
    const key = settlementKeys.movements({
      weekFrom: '2026-02-01',
      weekTo: '2026-02-28',
      kind: 'collect',
      approvalState: 'pending',
      page: 1,
    });
    const payload = key[key.length - 1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      weekFrom: '2026-02-01',
      weekTo: '2026-02-28',
      kind: 'collect',
      approvalState: 'pending',
      page: 1,
    });
  });
});
