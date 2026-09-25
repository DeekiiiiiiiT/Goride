import { describe, expect, it } from 'vitest';
import {
  isReconWeekNotYetOpen,
  isReconWeekUnlocked,
  reconWeekSealMessage,
  reconWeekUnlockDay,
} from './reconWeekSeal';

describe('reconWeekSeal — Sep 7–13 fixture', () => {
  const week = { weekStart: '2026-09-07', periodEnd: '2026-09-13' };

  it('not yet open through Sunday Sep 13', () => {
    expect(isReconWeekNotYetOpen({ ...week, now: '2026-09-09' })).toBe(true);
    expect(isReconWeekNotYetOpen({ ...week, now: '2026-09-13' })).toBe(true);
    expect(isReconWeekUnlocked({ ...week, now: '2026-09-13' })).toBe(false);
  });

  it('unlocks on Monday Sep 14', () => {
    expect(isReconWeekNotYetOpen({ ...week, now: '2026-09-14' })).toBe(false);
    expect(isReconWeekUnlocked({ ...week, now: '2026-09-14' })).toBe(true);
  });

  it('message names Sunday end and unlock day', () => {
    expect(reconWeekUnlockDay(week)).toBe('2026-09-14');
    const msg = reconWeekSealMessage(week);
    expect(msg).toContain('2026-09-13');
    expect(msg).toContain('2026-09-14');
  });
});
