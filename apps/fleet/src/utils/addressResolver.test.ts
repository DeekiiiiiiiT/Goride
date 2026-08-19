import { describe, expect, it, vi } from 'vitest';
import { Trip } from '../types/data';
import { resolveMissingTripAddresses } from './addressResolver';
import { formatCoordsAsPlusCode } from './tripManifestHelpers';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    platform: 'InDrive',
    date: '2026-06-18T18:29:00.000Z',
    driverId: 'd1',
    amount: 3000,
    status: 'Completed',
    pickupLocation: 'WVQR+JQ3, Old Harbour, Jamaica',
    startLat: 17.941,
    startLng: -77.108,
    ...overrides,
  };
}

describe('resolveMissingTripAddresses', () => {
  it('saves a street address when geocode succeeds', async () => {
    const saveTrips = vi.fn().mockResolvedValue(undefined);
    const geocode = vi.fn().mockResolvedValue('Spanish Town Road, Kingston, Jamaica');

    const resolved = await resolveMissingTripAddresses(
      [
        trip({
          dropoffLocation: 'Lat: 17.99000, Lon: -77.22000',
          endLat: 17.99,
          endLng: -77.22,
        }),
      ],
      { geocode, saveTrips }
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].dropoffLocation).toBe('Spanish Town Road, Kingston, Jamaica');
    expect(resolved[0].resolutionMethod).toBe('background');
    expect(saveTrips).toHaveBeenCalledTimes(1);
  });

  it('saves a plus code instead of leaving Resolving... when geocode fails', async () => {
    const saveTrips = vi.fn().mockResolvedValue(undefined);
    const geocode = vi.fn().mockRejectedValue(new Error('timeout'));

    const resolved = await resolveMissingTripAddresses(
      [
        trip({
          dropoffLocation: '',
          endLat: 17.99,
          endLng: -77.22,
        }),
      ],
      { geocode, saveTrips }
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].dropoffLocation).toBe(formatCoordsAsPlusCode(17.99, -77.22));
    expect(resolved[0].geocodeError).toMatch(/plus code saved/i);
    expect(saveTrips).toHaveBeenCalledTimes(1);
  });

  it('recovers missing endLng from the route before geocoding', async () => {
    const saveTrips = vi.fn().mockResolvedValue(undefined);
    const geocode = vi.fn().mockResolvedValue('Portmore, St. Catherine, Jamaica');

    const resolved = await resolveMissingTripAddresses(
      [
        trip({
          dropoffLocation: '',
          endLat: 17.99,
          route: [{ lat: 17.95, lon: -76.88, timestamp: 1 }],
        }),
      ],
      { geocode, saveTrips }
    );

    expect(geocode).toHaveBeenCalledWith(17.95, -76.88);
    expect(resolved[0].endLng).toBe(-76.88);
    expect(resolved[0].dropoffLocation).toBe('Portmore, St. Catherine, Jamaica');
  });
});
