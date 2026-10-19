import { describe, expect, it } from 'vitest';
import { evaluateFuelProximity } from './fuelProximity';

const fesco = {
  id: '9d72d4e7',
  name: 'FESCO Spanish Town Road',
  status: 'verified',
  geofenceRadius: 75,
  location: { lat: 18.0103125, lng: -76.8375625 },
};

describe('evaluateFuelProximity', () => {
  it('shows near_miss for one verified station within 1 km outside geofence', () => {
    const result = evaluateFuelProximity(18.0075033, -76.8352467, [fesco]);
    expect(result.kind).toBe('near_miss');
    if (result.kind === 'near_miss') {
      expect(result.station.id).toBe(fesco.id);
      expect(result.distanceM).toBeGreaterThan(75);
      expect(result.distanceM).toBeLessThanOrEqual(1000);
    }
  });

  it('returns inside when within geofence', () => {
    const result = evaluateFuelProximity(18.0103125, -76.8375625, [fesco]);
    expect(result.kind).toBe('inside');
  });

  it('returns no_gps when coords missing', () => {
    expect(evaluateFuelProximity(null, null, [fesco]).kind).toBe('no_gps');
  });
});
