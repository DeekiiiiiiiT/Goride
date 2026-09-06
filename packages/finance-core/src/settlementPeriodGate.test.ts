import { describe, expect, it } from 'vitest';
import {
  isSettlementPeriodEnded,
  isSettlementPeriodOpen,
  settlementPeriodOpenMessage,
} from './settlementPeriodGate.ts';

describe('settlementPeriodGate — week must end before settle', () => {
  const week = { periodAnchor: '2026-08-31', periodEnd: '2026-09-06' };

  it('blocks on the last day of the week (Sep 6)', () => {
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-06' })).toBe(false);
    expect(isSettlementPeriodOpen({ ...week, now: '2026-09-06' })).toBe(true);
  });

  it('allows from the day after periodEnd (Sep 7)', () => {
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-07' })).toBe(true);
    expect(isSettlementPeriodOpen({ ...week, now: '2026-09-07' })).toBe(false);
  });

  it('blocks mid-week (Sep 5)', () => {
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-05' })).toBe(false);
  });

  it('derives periodEnd from Monday anchor alone', () => {
    expect(
      isSettlementPeriodEnded({ periodAnchor: '2026-08-31', now: '2026-09-07' }),
    ).toBe(true);
    expect(
      isSettlementPeriodEnded({ weekAnchor: '2026-08-31', now: '2026-09-06' }),
    ).toBe(false);
  });

  it('message names the Sunday end', () => {
    expect(settlementPeriodOpenMessage(week)).toContain('2026-09-06');
  });
});
