import { describe, expect, it } from 'vitest';
import {
  isSettlementPeriodEnded,
  isSettlementPeriodOpen,
  reconciliationPeriodOpenMessage,
  reconciliationUnlockDay,
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

describe('settlementPeriodGate — Sep 7–13 recon seal', () => {
  const week = { periodAnchor: '2026-09-07', periodEnd: '2026-09-13' };

  it('blocks through Sunday Sep 13', () => {
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-09' })).toBe(false);
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-13' })).toBe(false);
  });

  it('allows from Monday Sep 14', () => {
    expect(isSettlementPeriodEnded({ ...week, now: '2026-09-14' })).toBe(true);
  });

  it('recon message names Sunday end and unlock day', () => {
    expect(reconciliationUnlockDay(week)).toBe('2026-09-14');
    const msg = reconciliationPeriodOpenMessage(week);
    expect(msg).toContain('2026-09-13');
    expect(msg).toContain('2026-09-14');
    expect(msg).toContain('Reconciliation');
  });
});
