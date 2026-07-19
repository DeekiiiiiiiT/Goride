import { describe, expect, it } from 'vitest';
import {
  dateWeekKey,
  getCrossPeriodCoverage,
  isCrossPeriodCoverage,
} from './tollWeekPeriod';

const TZ = 'America/Jamaica';

describe('cross-period coverage helpers', () => {
  it('dateWeekKey buckets Mon–Sun', () => {
    expect(dateWeekKey('2026-02-16', TZ)).toBe('2026-02-16');
    expect(dateWeekKey('2026-02-22', TZ)).toBe('2026-02-16');
    expect(dateWeekKey('2026-02-15', TZ)).toBe('2026-02-09');
  });

  it('isCrossPeriodCoverage detects different weeks', () => {
    expect(isCrossPeriodCoverage('2026-02-20', '2026-02-18', TZ)).toBe(false);
    expect(isCrossPeriodCoverage('2026-02-20', '2026-02-10', TZ)).toBe(true);
  });

  it('getCrossPeriodCoverage returns labels', () => {
    const info = getCrossPeriodCoverage('2026-02-20', '2026-02-10', TZ);
    expect(info).not.toBeNull();
    expect(info!.sourceWeekKey).toBe('2026-02-16');
    expect(info!.targetWeekKey).toBe('2026-02-09');
    expect(info!.targetWeekLabel).toContain('Feb');
  });
});
