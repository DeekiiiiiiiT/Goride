import { describe, it, expect } from 'vitest';
import { isRideLocationTrackingStatus, nextClientSeq } from './rideLocationSeq';

describe('nextClientSeq', () => {
  it('starts at 1 from invalid', () => {
    expect(nextClientSeq(NaN)).toBe(1);
    expect(nextClientSeq(-1)).toBe(1);
  });

  it('increments monotonically', () => {
    expect(nextClientSeq(0)).toBe(1);
    expect(nextClientSeq(1)).toBe(2);
    expect(nextClientSeq(42)).toBe(43);
  });
});

describe('isRideLocationTrackingStatus', () => {
  it('includes active trip statuses', () => {
    expect(isRideLocationTrackingStatus('on_trip')).toBe(true);
    expect(isRideLocationTrackingStatus('driver_en_route_pickup')).toBe(true);
  });

  it('excludes terminal statuses', () => {
    expect(isRideLocationTrackingStatus('completed')).toBe(false);
    expect(isRideLocationTrackingStatus('cancelled')).toBe(false);
    expect(isRideLocationTrackingStatus(undefined)).toBe(false);
  });
});
