import { describe, it, expect } from 'vitest';
import { allocateTripRefundAcrossTolls } from './tollReconciliation';

describe('allocateTripRefundAcrossTolls', () => {
  it('a single toll on a trip gets the full refund, capped at its own cost', () => {
    const allocation = allocateTripRefundAcrossTolls(
      [{ id: 'toll-a', tripId: 'trip-1', date: '2026-06-30', time: '12:41:00', amount: -285 }],
      new Map([['trip-1', 645]]),
    );
    expect(allocation.get('toll-a')).toBe(285);
  });

  it('two tolls sharing one trip split the pool in time order, each capped at its own cost', () => {
    // $645 pool, $285 toll first (earlier), $380 toll second (later).
    const allocation = allocateTripRefundAcrossTolls(
      [
        { id: 'toll-late', tripId: 'trip-1', date: '2026-06-30', time: '12:58:00', amount: -380 },
        { id: 'toll-early', tripId: 'trip-1', date: '2026-06-30', time: '12:41:00', amount: -285 },
      ],
      new Map([['trip-1', 645]]),
    );
    // Early toll: fully covered (285 of the 645 pool) — never more than its own cost.
    expect(allocation.get('toll-early')).toBe(285);
    // Late toll: gets the remaining 360, capped at its own 380 cost — 20 unreimbursed.
    expect(allocation.get('toll-late')).toBe(360);
  });

  it('when the pool runs out entirely, later tolls get $0', () => {
    const allocation = allocateTripRefundAcrossTolls(
      [
        { id: 'toll-1', tripId: 'trip-1', date: '2026-06-30', time: '09:00:00', amount: -300 },
        { id: 'toll-2', tripId: 'trip-1', date: '2026-06-30', time: '10:00:00', amount: -100 },
      ],
      new Map([['trip-1', 250]]),
    );
    expect(allocation.get('toll-1')).toBe(250); // pool exhausted here
    expect(allocation.get('toll-2')).toBe(0);   // nothing left
  });

  it('a toll with no sibling on the same trip is unaffected — gets its full cost if the pool covers it', () => {
    const allocation = allocateTripRefundAcrossTolls(
      [
        { id: 'toll-a', tripId: 'trip-1', date: '2026-06-30', time: '09:00:00', amount: -100 },
        { id: 'toll-b', tripId: 'trip-2', date: '2026-06-30', time: '09:00:00', amount: -50 },
      ],
      new Map([['trip-1', 100], ['trip-2', 200]]),
    );
    expect(allocation.get('toll-a')).toBe(100);
    expect(allocation.get('toll-b')).toBe(50); // capped at its own cost even though pool has more
  });

  it('tolls with no tripId are never included in the allocation', () => {
    const allocation = allocateTripRefundAcrossTolls(
      [{ id: 'toll-unlinked', tripId: undefined as any, date: '2026-06-30', time: '09:00:00', amount: -100 }],
      new Map(),
    );
    expect(allocation.has('toll-unlinked')).toBe(false);
  });

  it('a trip with no known refund (missing from the map) allocates $0 to all its tolls', () => {
    const allocation = allocateTripRefundAcrossTolls(
      [{ id: 'toll-a', tripId: 'trip-unknown', date: '2026-06-30', time: '09:00:00', amount: -100 }],
      new Map(),
    );
    expect(allocation.get('toll-a')).toBe(0);
  });
});
