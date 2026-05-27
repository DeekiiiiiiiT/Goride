import { describe, it, expect } from 'vitest';
import { bearingDeg, distanceMeters, isInsideGeofence } from './geo';

describe('distanceMeters', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMeters({ lat: 18.0, lng: -77.0 }, { lat: 18.0, lng: -77.0 })).toBe(0);
  });

  it('returns Infinity for invalid coordinates', () => {
    expect(distanceMeters({ lat: NaN, lng: -77 }, { lat: 18, lng: -77 })).toBe(Infinity);
  });

  it('computes known short distance', () => {
    const a = { lat: 18.0179, lng: -76.8099 };
    const b = { lat: 18.0185, lng: -76.8099 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(120);
  });
});

describe('isInsideGeofence', () => {
  it('includes accuracy buffer in effective radius', () => {
    const center = { lat: 18.0, lng: -77.0 };
    const point = { lat: 18.0005, lng: -77.0 };
    const without = isInsideGeofence(point, center, 50, 0);
    const withBuffer = isInsideGeofence(point, center, 50, 30);
    expect(without.isInside).toBe(false);
    expect(withBuffer.isInside).toBe(true);
    expect(withBuffer.effectiveRadiusM).toBe(80);
  });
});

describe('bearingDeg', () => {
  it('returns value in [0, 360)', () => {
    const b = bearingDeg({ lat: 18, lng: -77 }, { lat: 19, lng: -77 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});
