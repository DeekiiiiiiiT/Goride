import { describe, expect, it } from 'vitest';
import { Trip } from '../types/data';
import { looksLikePlusCodeAddress } from './plusCode';
import {
  formatCoordsAsPlusCode,
  getTripEndCoords,
  getTripEndpointLabel,
  getTripStartCoords,
  isPlaceholderAddress,
  tripNeedsAddressResolution,
} from './tripManifestHelpers';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    platform: 'InDrive',
    date: '2026-06-18T18:29:00.000Z',
    driverId: 'd1',
    amount: 3000,
    status: 'Completed',
    ...overrides,
  };
}

describe('tripManifestHelpers address labels', () => {
  it('treats empty, manual, and Lat: strings as placeholders', () => {
    expect(isPlaceholderAddress(undefined)).toBe(true);
    expect(isPlaceholderAddress('')).toBe(true);
    expect(isPlaceholderAddress('Manual Entry')).toBe(true);
    expect(isPlaceholderAddress('Lat: 17.94100, Lon: -77.10800')).toBe(true);
    expect(isPlaceholderAddress('WVQR+JQ3, Old Harbour, Jamaica')).toBe(false);
  });

  it('recovers dropoff coords from route.lon when endLng is missing', () => {
    const coords = getTripEndCoords(
      trip({
        endLat: 17.94,
        route: [{ lat: 17.99, lon: -77.22, timestamp: 1 }],
      })
    );
    expect(coords).toEqual({ lat: 17.99, lng: -77.22 });
  });

  it('recovers dropoff coords from legacy route.lng', () => {
    const coords = getTripEndCoords(
      trip({
        route: [{ lat: 17.99, lng: -77.22, timestamp: 1 } as { lat: number; lon: number; lng: number; timestamp: number }],
      })
    );
    expect(coords).toEqual({ lat: 17.99, lng: -77.22 });
  });

  it('uses stored endLat/endLng when present', () => {
    expect(
      getTripEndCoords(
        trip({
          endLat: 17.94,
          endLng: -77.11,
          route: [{ lat: 1, lon: 2, timestamp: 1 }],
        })
      )
    ).toEqual({ lat: 17.94, lng: -77.11 });
  });

  it('shows a plus code immediately instead of Resolving... when coords exist', () => {
    const label = getTripEndpointLabel(
      'Lat: 17.94100, Lon: -77.10800',
      undefined,
      { lat: 17.941, lng: -77.108 },
      'Unknown Dropoff'
    );
    expect(label).not.toMatch(/Resolving/i);
    expect(looksLikePlusCodeAddress(label)).toBe(true);
    expect(label).toBe(formatCoordsAsPlusCode(17.941, -77.108));
  });

  it('needs resolution for a completed trip with Lat: dropoff and GPS', () => {
    expect(
      tripNeedsAddressResolution(
        trip({
          pickupLocation: 'WVQR+JQ3, Old Harbour, Jamaica',
          startLat: 17.94,
          startLng: -77.11,
          dropoffLocation: 'Lat: 17.99, Lon: -77.22',
          endLat: 17.99,
          endLng: -77.22,
        })
      )
    ).toBe(true);
  });

  it('does not need resolution after a plus code is saved', () => {
    expect(
      tripNeedsAddressResolution(
        trip({
          pickupLocation: 'WVQR+JQ3, Old Harbour, Jamaica',
          dropoffLocation: formatCoordsAsPlusCode(17.99, -77.22),
          endLat: 17.99,
          endLng: -77.22,
        })
      )
    ).toBe(false);
  });

  it('needs resolution when dropoff is empty but route has lon', () => {
    expect(
      tripNeedsAddressResolution(
        trip({
          pickupLocation: 'Old Harbour',
          dropoffLocation: '',
          endLat: 17.99,
          route: [{ lat: 17.99, lon: -77.22, timestamp: 1 }],
        })
      )
    ).toBe(true);
  });

  it('prefers stored street address over generated plus code', () => {
    expect(
      getTripEndpointLabel(
        'Spanish Town Road, Kingston',
        'Kingston',
        { lat: 17.99, lng: -76.79 },
        'Unknown Dropoff'
      )
    ).toBe('Kingston');
  });

  it('detects Google plus-code formatted addresses', () => {
    expect(looksLikePlusCodeAddress('WVQR+JQ3, Old Harbour, Jamaica')).toBe(true);
    expect(looksLikePlusCodeAddress('Lot 1 Cookson Pen, Portmore')).toBe(false);
  });
});
