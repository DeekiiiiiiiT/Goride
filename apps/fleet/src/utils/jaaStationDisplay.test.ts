import { describe, it, expect } from 'vitest';
import {
  matchUniqueVendorToVerifiedStation,
  matchVendorToVerifiedStation,
  resolveCardTransactionStation,
  resolveFuelEntryStationDisplay,
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

  it('matches a card-file name to the saved station even when the wording differs', () => {
    const fairview = station({
      id: 'st-fairview',
      name: 'Super Lube Fairview',
      brand: 'Super Lube',
      address: 'Fairview Shopping Centre',
    });
    const hit = matchUniqueVendorToVerifiedStation('SUPER LUBE SERVICE CENTRE', [fairview]);
    expect(hit?.id).toBe('st-fairview');
  });

  it('does not guess when two saved stations share the card-file name', () => {
    const a = station({ id: 'a', name: 'Super Lube Fairview', brand: 'Super Lube' });
    const b = station({ id: 'b', name: 'Super Lube Harbour View', brand: 'Super Lube' });
    expect(matchUniqueVendorToVerifiedStation('SUPER LUBE SERVICE CENTRE', [a, b])).toBeNull();
  });

  it('uses the driver GPS when that pin sits inside a verified station', () => {
    const statement = {
      id: 'stmt',
      date: '2026-09-26',
      time: '09:31:10',
      amount: 4000,
      vehicleId: 'veh-1',
      location: 'SUPER LUBE SERVICE CENTRE',
      metadata: { jaaStation: 'SUPER LUBE SERVICE CENTRE', jaaMileage: 187759, importSource: 'jaa_raw' },
    } as FuelEntry;
    const driverLog = {
      id: 'drv',
      date: '2026-09-26',
      time: '09:30:00',
      amount: 5000,
      vehicleId: 'veh-1',
      location: 'Jampet Service Station',
      metadata: { locationMetadata: { lat: 17.9909783, lng: -76.979375, accuracy: 1.2 } },
    } as FuelEntry;
    const stations = [
      station({
        id: 'st-jampet',
        name: 'Jampet Service Station',
        brand: 'Independent',
        address: '27 Willowdene Pkwy',
        geofenceRadius: 75,
        location: { lat: 17.9910125, lng: -76.9792656 },
      }),
    ];
    const display = resolveFuelEntryStationDisplay(statement, stations, [statement, driverLog]);
    expect(display.title).toBe('Jampet Service Station');
    expect(display.subtitle).toBe('27 Willowdene Pkwy');
  });

  it('does not use a driver pin that is outside the station fence', () => {
    const statement = {
      id: 'stmt',
      date: '2026-09-26',
      time: '09:31:10',
      amount: 4000,
      vehicleId: 'veh-1',
      location: 'SUPER LUBE SERVICE CENTRE',
      metadata: { jaaStation: 'SUPER LUBE SERVICE CENTRE', importSource: 'jaa_raw' },
    } as FuelEntry;
    const driverLog = {
      id: 'drv',
      date: '2026-09-26',
      time: '09:30:00',
      amount: 5000,
      vehicleId: 'veh-1',
      metadata: { locationMetadata: { lat: 18.05, lng: -76.8, accuracy: 5 } },
    } as FuelEntry;
    const stations = [
      station({
        id: 'st-jampet',
        name: 'Jampet Service Station',
        brand: 'Independent',
        address: '27 Willowdene Pkwy',
        geofenceRadius: 75,
        location: { lat: 17.9910125, lng: -76.9792656 },
      }),
    ];
    const display = resolveFuelEntryStationDisplay(statement, stations, [statement, driverLog]);
    expect(display.title).toBe('SUPER LUBE SERVICE CENTRE');
    expect(display.subtitle).toBe('No GPS metadata');
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

describe('resolveFuelEntryStationDisplay', () => {
  const ledger = [
    station({
      id: 'st-fesco',
      name: 'FESCO BEECHWOOD',
      brand: 'FESCO',
      address: '7 - 9 Beechwood Ave',
    }),
    station({
      id: 'st-jampet',
      name: 'Jampet Service Station',
      brand: 'Independent',
      address: '27 Willowdene Pkwy',
    }),
  ];

  it('shows chain brand on top and street address below', () => {
    const entry = {
      id: 'e1',
      date: '2026-09-19',
      amount: 100,
      location: 'FESCO BEECHWOOD',
      vendor: 'FESCO BEECHWOOD',
      matchedStationId: 'st-fesco',
      metadata: {},
    } as FuelEntry;
    const d = resolveFuelEntryStationDisplay(entry, ledger);
    expect(d.title).toBe('FESCO');
    expect(d.subtitle).toBe('7 - 9 Beechwood Ave');
  });

  it('uses station name for Independent brand (never shows Independent)', () => {
    const entry = {
      id: 'e2',
      date: '2026-09-19',
      amount: 100,
      location: 'Jampet Service Station',
      vendor: 'Jampet Service Station',
      matchedStationId: 'st-jampet',
      metadata: {},
    } as FuelEntry;
    const d = resolveFuelEntryStationDisplay(entry, ledger);
    expect(d.title).toBe('Jampet Service Station');
    expect(d.subtitle).toBe('27 Willowdene Pkwy');
    expect(d.title.toLowerCase()).not.toContain('independent');
  });

  it('unmatched entry: name on top, does not duplicate name as subtitle', () => {
    const entry = {
      id: 'e3',
      date: '2026-09-19',
      amount: 100,
      location: 'Mystery Pump',
      vendor: 'Mystery Pump',
      metadata: {},
    } as FuelEntry;
    const d = resolveFuelEntryStationDisplay(entry, ledger);
    expect(d.title).toBe('Mystery Pump');
    expect(d.subtitle).toBe('No GPS metadata');
  });

  it('unmatched entry with GPS says the fix was captured', () => {
    const entry = {
      id: 'e3b',
      date: '2026-09-26',
      amount: 100,
      vendor: 'Unknown Station',
      metadata: { locationMetadata: { lat: 17.99, lng: -76.97, accuracy: 1.2 } },
    } as FuelEntry;
    const d = resolveFuelEntryStationDisplay(entry, ledger);
    expect(d.subtitle).toBe('GPS captured — not matched');
  });

  it('unmatched entry: prefers stationAddress on subtitle', () => {
    const entry = {
      id: 'e4',
      date: '2026-09-19',
      amount: 100,
      vendor: 'Mystery Pump',
      stationAddress: '12 Main St',
      metadata: {},
    } as FuelEntry;
    const d = resolveFuelEntryStationDisplay(entry, ledger);
    expect(d.title).toBe('Mystery Pump');
    expect(d.subtitle).toBe('12 Main St');
  });
});
