import { describe, expect, it, vi } from 'vitest';
import {
  buildGoogleMapsDirectionsUrl,
  buildNavigationUrl,
  buildWazeUrl,
  isValidNavCoord,
} from './rideNavigation';
import * as navigationPreference from './navigationPreference';

describe('isValidNavCoord', () => {
  it('accepts valid coordinates', () => {
    expect(isValidNavCoord(40.7128, -74.006)).toBe(true);
  });

  it('rejects invalid coordinates', () => {
    expect(isValidNavCoord(NaN, -74.006)).toBe(false);
    expect(isValidNavCoord(40.7128, NaN)).toBe(false);
    expect(isValidNavCoord(0, 0)).toBe(false);
    expect(isValidNavCoord(91, 0)).toBe(false);
    expect(isValidNavCoord(0, 181)).toBe(false);
  });
});

describe('buildGoogleMapsDirectionsUrl', () => {
  it('uses address when provided', () => {
    const url = buildGoogleMapsDirectionsUrl({
      lat: 0,
      lng: 0,
      address: '123 Main St, Kingston',
    });
    expect(url).toContain('destination=123%20Main%20St%2C%20Kingston');
    expect(url).toContain('travelmode=driving');
  });

  it('uses coordinates when address is missing', () => {
    const url = buildGoogleMapsDirectionsUrl({ lat: 18.01, lng: -76.79 });
    expect(url).toContain('destination=18.01%2C-76.79');
  });

  it('encodes special characters in address', () => {
    const url = buildGoogleMapsDirectionsUrl({
      lat: 0,
      lng: 0,
      address: 'A & B Street',
    });
    expect(url).toContain(encodeURIComponent('A & B Street'));
  });
});

describe('buildWazeUrl', () => {
  it('uses coordinates when valid', () => {
    expect(buildWazeUrl({ lat: 18.01, lng: -76.79 })).toBe(
      'https://waze.com/ul?ll=18.01,-76.79&navigate=yes',
    );
  });

  it('falls back to address search when coordinates are invalid', () => {
    expect(
      buildWazeUrl({ lat: NaN, lng: NaN, address: '123 Main St, Kingston' }),
    ).toBe('https://waze.com/ul?q=123%20Main%20St%2C%20Kingston&navigate=yes');
  });

  it('returns null when no valid destination exists', () => {
    expect(buildWazeUrl({ lat: NaN, lng: NaN })).toBeNull();
    expect(buildWazeUrl({ lat: NaN, lng: NaN, address: '   ' })).toBeNull();
  });
});

describe('buildNavigationUrl', () => {
  it('delegates to Google Maps builder', () => {
    const target = { lat: 18.01, lng: -76.79, address: 'Dropoff' };
    expect(buildNavigationUrl('google_maps', target)).toBe(buildGoogleMapsDirectionsUrl(target));
  });

  it('delegates to Waze builder', () => {
    const target = { lat: 18.01, lng: -76.79 };
    expect(buildNavigationUrl('waze', target)).toBe(buildWazeUrl(target));
  });

  it('uses provider preference when mocked', () => {
    vi.spyOn(navigationPreference, 'readNavigationProvider').mockReturnValue('waze');
    const target = { lat: 18.01, lng: -76.79 };
    expect(buildNavigationUrl(navigationPreference.readNavigationProvider(), target)).toBe(
      buildWazeUrl(target),
    );
    vi.restoreAllMocks();
  });
});
