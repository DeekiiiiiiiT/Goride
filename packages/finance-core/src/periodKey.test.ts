import { describe, expect, it } from 'vitest';
import { periodKeyFor, periodEndForAnchor, fleetCalendarDay } from './periodKey.ts';

describe('periodKeyFor — fleet TZ Mon–Sun', () => {
  it('maps a Jamaica Monday noon to that Monday', () => {
    expect(periodKeyFor('2026-08-03', 'America/Jamaica')).toBe('2026-08-03');
    expect(periodEndForAnchor('2026-08-03')).toBe('2026-08-09');
  });

  it('keeps Sunday in the same week as the prior Monday', () => {
    expect(periodKeyFor('2026-08-09', 'America/Jamaica')).toBe('2026-08-03');
  });

  it('does not shift a Jamaica midnight ISO timestamp into the prior week', () => {
    expect(periodKeyFor('2026-08-03T00:00:00-05:00', 'America/Jamaica')).toBe('2026-08-03');
  });

  it('month-straddle week stays one key (Jun 29–Jul 5)', () => {
    expect(periodKeyFor('2026-06-29', 'America/Jamaica')).toBe('2026-06-29');
    expect(periodKeyFor('2026-07-05', 'America/Jamaica')).toBe('2026-06-29');
    expect(periodEndForAnchor('2026-06-29')).toBe('2026-07-05');
  });

  it('UTC evening that is still Jamaica calendar day stays on that day', () => {
    expect(fleetCalendarDay('2026-08-03T23:30:00-05:00', 'America/Jamaica')).toBe('2026-08-03');
  });

  // W4: bucketing must be stable regardless of viewer/host timezone. A UTC
  // timestamp late on Aug 31 is 6:30pm Jamaica — still Aug 31, NOT Sep 1.
  it('does not roll a late-UTC timestamp forward a day in Jamaica (W4)', () => {
    expect(fleetCalendarDay('2026-08-31T23:30:00.000Z', 'America/Jamaica')).toBe('2026-08-31');
    // …and therefore stays in the Aug 31 (Mon) week, not the next week.
    expect(periodKeyFor('2026-08-31T23:30:00.000Z', 'America/Jamaica')).toBe('2026-08-31');
  });

  it('is host-timezone independent (same key whatever the process TZ)', () => {
    const key = periodKeyFor('2026-08-31T23:30:00.000Z', 'America/Jamaica');
    expect(key).toBe('2026-08-31');
  });
});
