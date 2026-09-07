import { describe, expect, it } from 'vitest';
import { parseTollDate, zonedWallClockToDate } from './tollDate.ts';

/** Fleet-tz calendar day of an instant, for assertions. */
function jamaicaDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Jamaica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

describe('parseTollDate — fleet-tz explicit (not browser-local)', () => {
  it('resolves a bare yyyy-MM-dd to that same Jamaica day', () => {
    const d = parseTollDate('2026-08-31');
    expect(jamaicaDay(d)).toBe('2026-08-31');
  });

  it('resolves ymd + wall-clock time in the fleet timezone', () => {
    const d = parseTollDate('2026-08-31', '11:47:00 PM');
    // 11:47pm Jamaica is still Aug 31 locally.
    expect(jamaicaDay(d)).toBe('2026-08-31');
  });

  it('treats an offset-bearing timestamp as an unambiguous instant', () => {
    const d = parseTollDate('2026-08-31T23:30:00.000Z');
    // 11:30pm UTC = 6:30pm Jamaica, still Aug 31.
    expect(jamaicaDay(d)).toBe('2026-08-31');
  });

  it('returns Invalid Date for empty input', () => {
    expect(isNaN(parseTollDate('').getTime())).toBe(true);
  });

  it('is host-timezone independent for a bare date across a month boundary', () => {
    // A naive `new Date("2026-08-31")` is UTC midnight → Aug 30 in Jamaica.
    // parseTollDate must anchor in-fleet so the day never regresses.
    expect(jamaicaDay(parseTollDate('2026-08-31'))).toBe('2026-08-31');
    expect(jamaicaDay(zonedWallClockToDate('2026-08-31'))).toBe('2026-08-31');
  });
});
