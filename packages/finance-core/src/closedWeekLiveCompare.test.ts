import { describe, expect, it } from 'vitest';
import { isProbeTripRef, shouldCompareWeekToLiveTrips } from './closedWeekLiveCompare.ts';

describe('closed week live compare', () => {
  it('checks an open week against live trips', () => {
    expect(shouldCompareWeekToLiveTrips({ status: 'open', metadata: {} })).toBe(true);
  });

  it('does not check a closed week against live trips', () => {
    expect(
      shouldCompareWeekToLiveTrips({
        status: 'closed',
        closed_at: '2026-09-25T17:06:31.375Z',
        metadata: { financeCore: { periodFrozen: false } },
      }),
    ).toBe(false);
  });

  it('recognises deleted test trips', () => {
    expect(isProbeTripRef('probe-trip-12')).toBe(true);
    expect(isProbeTripRef('trip-12')).toBe(false);
  });
});
