import { describe, it, expect } from 'vitest';
import { weekBucketForDate, tollWeekKey } from './tollWeekPeriod';
import { ymdToLocalDate } from './timezoneDisplay';

describe('weekBucketForDate fleet timezone (Expenses ↔ Reconciliation)', () => {
  it('assigns a bare Monday yyyy-MM-dd to that Monday week key', () => {
    const d = ymdToLocalDate('2026-06-29');
    expect(weekBucketForDate(d, 'America/Jamaica').key).toBe('2026-06-29');
    expect(tollWeekKey({ date: '2026-06-29', time: '12:00:00' }, 'America/Jamaica')).toBe(
      '2026-06-29',
    );
    const { weekStart, weekEnd } = weekBucketForDate(d, 'America/Jamaica');
    expect(weekStart.getDay()).toBe(1); // Monday
    expect(weekEnd.getDay()).toBe(0); // Sunday
  });

  it('keeps Sunday Jul 5 in the Jun 29 week under America/Jamaica', () => {
    expect(tollWeekKey({ date: '2026-07-05', time: '12:00:00' }, 'America/Jamaica')).toBe(
      '2026-06-29',
    );
  });

  it('puts Monday Jul 6 in the next week', () => {
    expect(tollWeekKey({ date: '2026-07-06', time: '12:00:00' }, 'America/Jamaica')).toBe(
      '2026-07-06',
    );
  });
});
