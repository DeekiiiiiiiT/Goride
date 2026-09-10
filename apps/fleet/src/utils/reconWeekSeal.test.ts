import { describe, expect, it } from 'vitest';
import {
  isReconWeekSealed,
  isReconWeekUnlocked,
  reconWeekSealMessage,
  reconWeekUnlockDay,
} from './reconWeekSeal';

describe('reconWeekSeal — Sep 7–13 fixture', () => {
  const week = { weekStart: '2026-09-07', periodEnd: '2026-09-13' };

  it('seals through Sunday Sep 13', () => {
    expect(isReconWeekSealed({ ...week, now: '2026-09-09' })).toBe(true);
    expect(isReconWeekSealed({ ...week, now: '2026-09-13' })).toBe(true);
    expect(isReconWeekUnlocked({ ...week, now: '2026-09-13' })).toBe(false);
  });

  it('unlocks on Monday Sep 14', () => {
    expect(isReconWeekSealed({ ...week, now: '2026-09-14' })).toBe(false);
    expect(isReconWeekUnlocked({ ...week, now: '2026-09-14' })).toBe(true);
  });

  it('message names Sunday end and unlock day', () => {
    expect(reconWeekUnlockDay(week)).toBe('2026-09-14');
    const msg = reconWeekSealMessage(week);
    expect(msg).toContain('2026-09-13');
    expect(msg).toContain('2026-09-14');
  });
});
