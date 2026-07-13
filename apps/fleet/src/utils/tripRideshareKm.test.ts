import { describe, it, expect } from 'vitest';
import { getTotalTripRideshareKm, sumTripRideshareKm } from './tripRideshareKm';

describe('getTotalTripRideshareKm', () => {
  it('sums On Trip + Enroute + Open + Unavailable', () => {
    expect(
      getTotalTripRideshareKm({
        distance: 10,
        normalizedEnrouteDistance: 2,
        normalizedOpenDistance: 1,
        normalizedUnavailableDistance: 0.5,
      }),
    ).toBeCloseTo(13.5, 5);
  });

  it('treats missing normalized fields as 0 (cancelled / sparse trips)', () => {
    expect(getTotalTripRideshareKm({ distance: 8 })).toBe(8);
  });

  it('coerces non-numeric to 0', () => {
    expect(
      getTotalTripRideshareKm({
        distance: null,
        normalizedEnrouteDistance: undefined,
      }),
    ).toBe(0);
  });
});

describe('sumTripRideshareKm', () => {
  it('aggregates full-stack km across trips', () => {
    const total = sumTripRideshareKm([
      { distance: 10, normalizedEnrouteDistance: 2 },
      { distance: 5, normalizedOpenDistance: 1, normalizedUnavailableDistance: 1 },
    ]);
    expect(total).toBe(19);
  });

  it('matches recon vs deadhead: distance-only undercounts vs full stack', () => {
    const trips = [
      { distance: 12, normalizedEnrouteDistance: 3, normalizedOpenDistance: 2 },
    ];
    const distanceOnly = trips.reduce((s, t) => s + (t.distance || 0), 0);
    const fullStack = sumTripRideshareKm(trips);
    expect(distanceOnly).toBe(12);
    expect(fullStack).toBe(17);
  });
});
