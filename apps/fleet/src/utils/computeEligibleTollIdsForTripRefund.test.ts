import { describe, it, expect } from 'vitest';
import { computeEligibleTollIdsForTripRefund } from './tollReconciliation';

describe('computeEligibleTollIdsForTripRefund', () => {
  it('when two tolls share one trip, only the chronologically-first is eligible', () => {
    const eligible = computeEligibleTollIdsForTripRefund([
      { id: 'toll-late', tripId: 'trip-1', date: '2026-06-30', time: '12:58:00' },
      { id: 'toll-early', tripId: 'trip-1', date: '2026-06-30', time: '12:41:00' },
    ]);
    expect(eligible.has('toll-early')).toBe(true);
    expect(eligible.has('toll-late')).toBe(false);
  });

  it('a toll with no sibling on the same trip is always eligible', () => {
    const eligible = computeEligibleTollIdsForTripRefund([
      { id: 'toll-a', tripId: 'trip-1', date: '2026-06-30', time: '12:41:00' },
      { id: 'toll-b', tripId: 'trip-2', date: '2026-06-30', time: '13:00:00' },
    ]);
    expect(eligible.has('toll-a')).toBe(true);
    expect(eligible.has('toll-b')).toBe(true);
  });

  it('tolls with no tripId are ignored entirely (never marked eligible)', () => {
    const eligible = computeEligibleTollIdsForTripRefund([
      { id: 'toll-unlinked', tripId: undefined as any, date: '2026-06-30', time: '12:41:00' },
    ]);
    expect(eligible.has('toll-unlinked')).toBe(false);
  });

  it('three tolls sharing one trip: only the earliest is eligible', () => {
    const eligible = computeEligibleTollIdsForTripRefund([
      { id: 'toll-2', tripId: 'trip-1', date: '2026-06-30', time: '10:00:00' },
      { id: 'toll-1', tripId: 'trip-1', date: '2026-06-30', time: '09:00:00' },
      { id: 'toll-3', tripId: 'trip-1', date: '2026-06-30', time: '11:00:00' },
    ]);
    expect(eligible.has('toll-1')).toBe(true);
    expect(eligible.has('toll-2')).toBe(false);
    expect(eligible.has('toll-3')).toBe(false);
  });
});
