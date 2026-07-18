import { describe, it, expect } from 'vitest';
import { weekBucketForDate, tollWeekKey } from './tollWeekPeriod';
import { fleetCalendarDay, ymdToLocalDate } from './timezoneDisplay';

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

  // Regression: Kenny Dec 15 $275 Spanish Town East — tag import time "11:47:00 AM"
  // used to Invalid-Date → UTC midnight → Dec 14 → prior week, so Needs Review
  // looked empty while the period list still counted the toll as outstanding.
  it('keeps Dec 15 Monday with AM/PM tag time in the Dec 15 week', () => {
    expect(
      tollWeekKey({ date: '2025-12-15', time: '11:47:00 AM' }, 'America/Jamaica'),
    ).toBe('2025-12-15');
  });

  it('does not shift bare Dec 15 into the prior week under US Eastern', () => {
    expect(tollWeekKey({ date: '2025-12-15' }, 'America/New_York')).toBe('2025-12-15');
  });
});

describe('fleetCalendarDay UTC midnight edge (unlinked refund period membership)', () => {
  // Dec 29–Jan 4 week blocker: trip stamped 2026-01-05T00:06Z is still Jan 4 in Jamaica.
  it('maps Jan 5 00:06Z to Jan 4 in America/Jamaica', () => {
    expect(fleetCalendarDay('2026-01-05T00:06:25.000Z', 'America/Jamaica')).toBe('2026-01-04');
  });

  it('keeps that trip inside the Dec 29 week key', () => {
    const day = fleetCalendarDay('2026-01-05T00:06:25.000Z', 'America/Jamaica');
    expect(day >= '2025-12-29' && day <= '2026-01-04').toBe(true);
  });
});
