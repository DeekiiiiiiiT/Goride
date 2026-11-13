import { describe, expect, it } from 'vitest';
import { tollTimingNote } from './TollV2PickTripDialog';

// Real week of 24 Aug 2026: the 28 Aug 12:22 PM Portmore West toll and its two candidate trips.
const toll = '2026-08-28T12:22:00-05:00';

describe('tollTimingNote (P3-R4 check: compare with the trip start before dropoff)', () => {
  it('a toll 1 min before the trip starts is "while driving to the pickup", not "before dropoff"', () => {
    const cardTrip = { requestAt: '2026-08-28T12:23:00-05:00', dropoffAt: '2026-08-28T13:30:00-05:00' };
    expect(tollTimingNote(toll, cardTrip as never)).toBe(
      'Toll happened 1 min before the trip started, while driving to the pickup.',
    );
  });
  it('a toll during the trip counts minutes to dropoff', () => {
    const cashTrip = { requestAt: '2026-08-28T11:50:00-05:00', dropoffAt: '2026-08-28T12:28:00-05:00' };
    expect(tollTimingNote(toll, cashTrip as never)).toMatch(/12:22 PM, 6 mins before dropoff\.$/);
  });
  it('a toll after dropoff says so', () => {
    const early = { requestAt: '2026-08-28T11:00:00-05:00', dropoffAt: '2026-08-28T12:10:00-05:00' };
    expect(tollTimingNote(toll, early as never)).toBe('Toll happened 12 mins after dropoff.');
  });
});
