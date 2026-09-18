import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import {
  hasFuelEntryGpsCoords,
  shouldCreateUnverifiedVendor,
} from './fuelUnverifiedVendorGate';

function baseEntry(overrides: Partial<FuelEntry> = {}): FuelEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    amount: 40,
    liters: 20,
    date: '2026-09-08T12:00:00.000Z',
    location: 'Test Station',
    paymentSource: 'Cash',
    transactionId: 'tx-1',
    ...overrides,
  } as FuelEntry;
}

describe('fuelUnverifiedVendorGate (R6-1)', () => {
  it('hasFuelEntryGpsCoords is true when locationMetadata has lat/lng', () => {
    expect(
      hasFuelEntryGpsCoords(
        baseEntry({
          locationMetadata: { lat: 18.0, lng: -76.8, accuracy: 10 },
        }),
      ),
    ).toBe(true);
  });

  it('coords present → shouldCreateUnverifiedVendor false', () => {
    expect(
      shouldCreateUnverifiedVendor(
        baseEntry({
          locationMetadata: { lat: 18.0, lng: -76.8, accuracy: 10 },
        }),
      ),
    ).toBe(false);
  });

  it('coords absent, transaction + vendor, no station → true', () => {
    expect(shouldCreateUnverifiedVendor(baseEntry({ matchedStationId: undefined }))).toBe(
      true,
    );
  });

  it('has matchedStationId → false', () => {
    expect(
      shouldCreateUnverifiedVendor(baseEntry({ matchedStationId: 'station-1' })),
    ).toBe(false);
  });

  it('missing vendor name → false', () => {
    expect(shouldCreateUnverifiedVendor(baseEntry({ location: '   ' }))).toBe(false);
    expect(shouldCreateUnverifiedVendor(baseEntry({ location: undefined }))).toBe(false);
  });

  it('missing transactionId → false', () => {
    expect(shouldCreateUnverifiedVendor(baseEntry({ transactionId: undefined }))).toBe(false);
  });

  it('skip: true (edit path) → false', () => {
    expect(shouldCreateUnverifiedVendor(baseEntry(), { skip: true })).toBe(false);
  });

  it('geofenceMetadata only (no location coords) still counts as no GPS', () => {
    // Regression: old code wrongly read geofenceMetadata.lat/lng which do not exist.
    expect(
      shouldCreateUnverifiedVendor(
        baseEntry({
          locationMetadata: undefined,
          geofenceMetadata: {
            isInside: true,
            distanceMeters: 5,
            timestamp: '2026-09-08T12:00:00.000Z',
            radiusAtTrigger: 100,
          },
        }),
      ),
    ).toBe(true);
  });
});
