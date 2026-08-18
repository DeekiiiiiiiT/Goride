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
});
