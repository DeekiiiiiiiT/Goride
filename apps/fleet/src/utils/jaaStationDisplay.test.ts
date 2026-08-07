import { describe, it, expect } from 'vitest';
import {
  matchVendorToVerifiedStation,
  resolveCardTransactionStation,
} from './jaaStationDisplay';
import type { StationProfile } from '../types/station';
import type { FuelEntry } from '../types/fuel';

function station(partial: Partial<StationProfile> & { id: string; name: string }): StationProfile {
  return {
    brand: partial.brand || 'Independent',
    address: partial.address || '',
    location: partial.location || { lat: 0, lng: 0 },
    isPreferred: false,
    stats: partial.stats || ({} as StationProfile['stats']),
    amenities: [],
    status: 'verified',
    ...partial,
  } as StationProfile;
}

describe('jaaStationDisplay', () => {
  const stations = [
    station({
      id: 'st-super',
      name: 'Super Lube Service Centre',
      brand: 'Super Lube',
    }),
  ];

  it('fuzzy-matches JAA vendor to verified station', () => {
    const hit = matchVendorToVerifiedStation('SUPER LUBE SERVICE CENTRE MONTEGO BAY', stations);
    expect(hit?.id).toBe('st-super');
  });

  it('prefers linked driver verified station over JAA vendor', () => {
    const driver = {
      id: 'drv-1',
      date: '2026-08-05',
      amount: 0,
      location: 'Roam Shell Cross Roads',
      matchedStationId: 'st-super',
      metadata: {},
    } as FuelEntry;
    const stmt = {
      id: 'stmt-1',
      date: '2026-08-05',
      amount: 4500,
      location: 'SUPER LUBE SERVICE CENTRE',
      metadata: {
        jaaStation: 'SUPER LUBE SERVICE CENTRE',
        jaaMatchedDriverEntryId: 'drv-1',
      },
    } as FuelEntry;
    const byId = new Map([['drv-1', driver]]);
    const result = resolveCardTransactionStation(stmt, stations, byId);
    expect(result.label).toBe('Super Lube Service Centre');
    expect(result.fromVerified).toBe(true);
  });

  it('falls back to JAA name when no verified match', () => {
    const stmt = {
      id: 'stmt-1',
      date: '2026-08-05',
      amount: 100,
      metadata: { jaaStation: 'UNKNOWN PUMP XYZ' },
    } as FuelEntry;
    const result = resolveCardTransactionStation(stmt, stations);
    expect(result.label).toBe('UNKNOWN PUMP XYZ');
    expect(result.fromVerified).toBe(false);
  });
});
