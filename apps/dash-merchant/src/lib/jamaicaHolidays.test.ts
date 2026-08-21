import { describe, expect, it } from 'vitest';
import {
  findJamaicaHolidayByDate,
  jamaicaHolidaysForYear,
} from '@roam/business-config';

describe('jamaicaHolidaysForYear', () => {
  it('matches known 2026 Jamaica public holidays', () => {
    const byKey = Object.fromEntries(
      jamaicaHolidaysForYear(2026).map((h) => [h.key, h.date]),
    );

    expect(byKey.new_years_day).toBe('2026-01-01');
    expect(byKey.ash_wednesday).toBe('2026-02-18');
    expect(byKey.good_friday).toBe('2026-04-03');
    expect(byKey.easter_monday).toBe('2026-04-06');
    expect(byKey.labour_day).toBe('2026-05-25');
    expect(byKey.emancipation_day).toBe('2026-08-01');
    expect(byKey.independence_day).toBe('2026-08-06');
    expect(byKey.national_heroes_day).toBe('2026-10-19');
    expect(byKey.christmas_day).toBe('2026-12-25');
    expect(byKey.boxing_day).toBe('2026-12-26');
  });

  it('finds a holiday by observed date', () => {
    const hit = findJamaicaHolidayByDate('2026-05-25');
    expect(hit?.name).toBe('Labour Day');
  });
});
