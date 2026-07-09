import { describe, it, expect } from 'vitest';
import {
  claimPeriodWeekKey,
  formatClaimPeriodLabel,
  isClaimInPeriod,
  isClaimVisibleInPeriod,
} from './tollWeekPeriod';

describe('period reset scope alignment', () => {
  const period = { startDate: '2026-06-29', endDate: '2026-07-05' };
  const tz = 'America/Jamaica';

  it('includes claim in Jun 29 week when toll date wins over stale claim.date', () => {
    const tollMap = new Map([['toll-a', '2026-06-30']]);
    const claim = { date: '2026-06-22', transactionId: 'toll-a' };
    expect(claimPeriodWeekKey(claim, tollMap, tz)).toBe('2026-06-29');
    expect(isClaimInPeriod(claim, period, tollMap, tz)).toBe(true);
    expect(
      isClaimVisibleInPeriod(claim, period, tollMap, tz, new Set(['toll-a'])),
    ).toBe(true);
  });

  it('excludes claim when toll week is Jun 22 even if claim.date is in Jun 29 range', () => {
    const tollMap = new Map([['toll-b', '2026-06-22']]);
    const claim = { date: '2026-06-30', transactionId: 'toll-b' };
    expect(isClaimInPeriod(claim, period, tollMap, tz)).toBe(false);
    expect(
      isClaimVisibleInPeriod(claim, period, tollMap, tz, new Set(['toll-b'])),
    ).toBe(false);
  });

  it('period label follows toll date not stale claim.date', () => {
    const tollMap = new Map([['toll-a', '2026-06-30']]);
    const label = formatClaimPeriodLabel(
      { date: '2026-06-15', transactionId: 'toll-a' },
      tollMap,
    );
    expect(label).toMatch(/Jun 29/);
    expect(label).toMatch(/Jul 5, 2026/);
  });
});
