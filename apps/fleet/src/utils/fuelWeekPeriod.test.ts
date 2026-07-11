import { describe, expect, it } from 'vitest';
import {
  fuelPeriodIdFromWeekStart,
  fuelWeekBucketForDate,
  fuelWeekBoundsFromPeriodId,
  generateFuelWeekOptions,
  isYmdInFuelWeek,
} from './fuelWeekPeriod';

describe('fuelWeekPeriod', () => {
  it('uses Monday yyyy-MM-dd as period id', () => {
    // 2026-07-08 is a Wednesday → week starts Monday 2026-07-06
    const bucket = fuelWeekBucketForDate(new Date(2026, 6, 8));
    expect(bucket.key).toBe('2026-07-06');
    expect(fuelPeriodIdFromWeekStart(bucket.key)).toBe('2026-07-06');
  });

  it('bounds are Monday–Sunday', () => {
    const b = fuelWeekBoundsFromPeriodId('2026-07-06');
    expect(b.startDate).toBe('2026-07-06');
    expect(b.endDate).toBe('2026-07-12');
  });

  it('fleet TZ keeps week key stable for same calendar day', () => {
    const utcEvening = new Date('2026-07-08T23:30:00.000Z');
    const jamaica = fuelWeekBucketForDate(utcEvening, 'America/Jamaica');
    const local = fuelWeekBucketForDate(new Date(2026, 6, 8));
    // Jamaica is UTC-5; Jul 8 23:30Z is still Jul 8 locally → same Monday key as local noon
    expect(jamaica.key).toBe(local.key);
  });

  it('generateFuelWeekOptions ids are Monday keys', () => {
    const opts = generateFuelWeekOptions(4, 'America/Jamaica');
    expect(opts.length).toBe(4);
    for (const o of opts) {
      expect(o.id).toBe(o.startDate);
      expect(o.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('isYmdInFuelWeek inclusive', () => {
    expect(isYmdInFuelWeek('2026-07-06', '2026-07-06', '2026-07-12')).toBe(true);
    expect(isYmdInFuelWeek('2026-07-12', '2026-07-06', '2026-07-12')).toBe(true);
    expect(isYmdInFuelWeek('2026-07-13', '2026-07-06', '2026-07-12')).toBe(false);
  });
});
