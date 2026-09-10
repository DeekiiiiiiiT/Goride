import { describe, expect, it } from 'vitest';
import {
  closeWeekYearOptions,
  defaultCloseWeekKey,
  isCloseWeekEnded,
  mondayWeekKeysForYear,
  yearFromWeekKey,
} from './closeWeekPicker';

describe('closeWeekPicker', () => {
  const now = new Date(2026, 8, 8); // Sep 8, 2026 (local)

  it('lists years newest-first from current down to 2024', () => {
    expect(closeWeekYearOptions(now)).toEqual([2026, 2025, 2024]);
  });

  it('lists 2026 Mondays newest-first including January', () => {
    const keys = mondayWeekKeysForYear(2026, now);
    expect(keys[0]).toBe('2026-09-07'); // current week Monday
    expect(keys).toContain('2026-01-19');
    // Jan 1 2026 was Thursday → first Monday in 2026 is Jan 5
    expect(keys[keys.length - 1]).toBe('2026-01-05');
    expect(keys.every((k) => k.startsWith('2026-'))).toBe(true);
  });

  it('defaults to last completed week', () => {
    expect(defaultCloseWeekKey(now)).toBe('2026-08-31');
  });

  it('marks in-progress week as not ended; prior week as ended', () => {
    expect(isCloseWeekEnded('2026-09-07', now)).toBe(false); // ends Sep 13
    expect(isCloseWeekEnded('2026-08-31', now)).toBe(true); // ends Sep 6
    expect(isCloseWeekEnded('2026-01-19', now)).toBe(true);
  });

  it('blocks through Sunday and unlocks the next Jamaica calendar day', () => {
    // Sep 7–13 week: still sealed on Sunday the 13th
    expect(isCloseWeekEnded('2026-09-07', '2026-09-13')).toBe(false);
    expect(isCloseWeekEnded('2026-09-07', '2026-09-14')).toBe(true);
  });

  it('yearFromWeekKey reads the year', () => {
    expect(yearFromWeekKey('2026-01-19')).toBe(2026);
  });
});
