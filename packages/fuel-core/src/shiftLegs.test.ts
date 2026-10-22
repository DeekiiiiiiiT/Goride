import { describe, expect, it } from 'vitest';
import {
  commuteLegs,
  coordsFromLabel,
  foldMeasuredGaps,
  groupShifts,
  netLegKm,
  repositionGaps,
  type ShiftTrip,
} from './shiftLegs.ts';

function trip(partial: ShiftTrip): ShiftTrip {
  return {
    startLat: 18.0,
    startLng: -76.8,
    endLat: 18.01,
    endLng: -76.79,
    pickupLocation: 'Home side',
    dropoffLocation: 'Town',
    ...partial,
  };
}

describe('shift legs', () => {
  it('splits a shift after a six hour break and routes only a short gap', () => {
    const trips = [
      trip({ id: 'a', requestTime: '2026-10-06T08:00:00', dropoffTime: '2026-10-06T08:20:00' }),
      trip({
        id: 'b',
        requestTime: '2026-10-06T08:40:00',
        dropoffTime: '2026-10-06T09:00:00',
        enrouteKm: 1.5,
      }),
      trip({ id: 'c', requestTime: '2026-10-06T16:00:00', dropoffTime: '2026-10-06T16:20:00' }),
    ];
    const shifts = groupShifts(trips);
    expect(shifts).toHaveLength(2);
    const gaps = repositionGaps(shifts);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].alreadyCountedKm).toBe(1.5);
    const legs = commuteLegs({ lat: 18.02, lng: -76.81 }, shifts);
    expect(legs).toHaveLength(4);
  });

  it('counts the drive to the first pickup once', () => {
    const shifts = groupShifts([
      trip({
        id: 'a',
        requestTime: '2026-10-06T08:00:00',
        dropoffTime: '2026-10-06T08:20:00',
        enrouteKm: 4,
        openKm: 1,
        unavailableKm: 0.5,
      }),
    ]);
    const legs = commuteLegs({ lat: 18.02, lng: -76.81 }, shifts);
    expect(legs[0].alreadyCountedKm).toBe(5.5);
    expect(legs[1].alreadyCountedKm).toBe(0);
    expect(netLegKm(4, 4)).toBe(0);
  });

  it('reads a coordinate label as a pin', () => {
    expect(coordsFromLabel('Lat: 17.97911, Lon: -76.99786')).toEqual({
      lat: 17.97911,
      lng: -76.99786,
    });
    const shifts = groupShifts([
      trip({
        id: 'a',
        requestTime: '2026-10-06T08:00:00',
        dropoffTime: '2026-10-06T08:20:00',
        endLat: undefined,
        endLng: undefined,
        dropoffLocation: 'Lat: 17.97911, Lon: -76.99786',
      }),
    ]);
    const legs = commuteLegs({ lat: 18.02, lng: -76.81 }, shifts);
    expect(legs[1].from.lat).toBeCloseTo(17.97911, 5);
    expect(legs[1].from.lng).toBeCloseTo(-76.99786, 5);
  });

  it('keeps the gaps that routed when one gap cannot', () => {
    const kept = foldMeasuredGaps([
      { routedKm: 5, straightKm: null, alreadyCountedKm: 1 },
      { routedKm: null, straightKm: 3, alreadyCountedKm: 0 },
      { routedKm: null, straightKm: null, alreadyCountedKm: 0 },
    ]);
    expect(kept.measured).toBe(true);
    expect(kept.repositionKm).toBe(7);
    expect(kept.anyEstimated).toBe(true);
    expect(kept.anySkipped).toBe(true);
    const none = foldMeasuredGaps([
      { routedKm: null, straightKm: null, alreadyCountedKm: 0 },
    ]);
    expect(none.measured).toBe(false);
    expect(none.repositionKm).toBeNull();
  });
});
