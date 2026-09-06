/**
 * Guard against S1-7/S1-8 class bugs: React Query keys must include every input
 * that changes the settlement response.
 */
import { describe, expect, it } from 'vitest';
import { settlementKeys } from '../hooks/useSettlementQueue';

describe('settlementKeys', () => {
  it('queue key includes view, weeks, minAmount, scope, search, page, groupBy', () => {
    const key = settlementKeys.queue({
      view: 'pay',
      weekFrom: '2026-01-01',
      weekTo: '2026-01-31',
      minAmount: 0,
      scope: 'rideshare',
      search: 'ann',
      page: 2,
      groupBy: 'driver',
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
      groupBy: 'driver',
    });
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
