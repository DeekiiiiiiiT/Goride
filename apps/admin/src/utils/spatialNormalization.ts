import { StationProfile } from '../types/station';
import { FuelEntry } from '../types/fuel';
import { encodePlusCode, getDefaultGeofenceRadius } from './plusCode';

export interface MapFeature {
  id: string;
  type: 'station' | 'fueling' | 'drift_line' | 'geofence';
  geometry: {
    type: 'Point' | 'LineString' | 'Circle';
    coordinates: [number, number] | [number, number][];
  };
  properties: any;
}

export const MAP_TILES = {
  LIGHT: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  DARK: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
};

/**
 * Normalizes a StationProfile into a map feature
 */
export function normalizeStationFeature(station: StationProfile): MapFeature {
  const lat = station?.location?.lat ?? 18.0179;
  const lng = station?.location?.lng ?? -76.8099;
  const resolvedRadius = station.geofenceRadius ?? getDefaultGeofenceRadius(station.plusCode);
  const defaultRadius = getDefaultGeofenceRadius(station.plusCode);
  const isCustomRadius = station.geofenceRadius !== undefined && station.geofenceRadius !== defaultRadius;
  
  return {
    id: `station-${station.id}`,
    type: 'station',
    geometry: {
      type: 'Point',
      coordinates: [lat, lng]
    },
    properties: {
      name: station.name || 'Unknown Station',
      brand: station.brand || 'Unknown Brand',
      status: station.status || 'unverified',
      radius: resolvedRadius,
      isCustomRadius,
      lastPrice: station.stats?.lastPrice || 0,
      plusCode: station.plusCode || encodePlusCode(lat, lng, 11),
      originalData: station
    }
  };
}

/**
 * Normalizes a FuelEntry into a fueling point feature
 */
export function normalizeFuelingFeature(entry: FuelEntry): MapFeature | null {
  if (!entry.locationMetadata?.lat || !entry.locationMetadata?.lng) return null;

  return {
    id: `fueling-${entry.id}`,
    type: 'fueling',
    geometry: {
      type: 'Point',
      coordinates: [entry.locationMetadata.lat, entry.locationMetadata.lng]
    },
    properties: {
      date: entry.date,
      amount: entry.amount,
      status: entry.auditStatus || 'Clear',
      isInside: entry.geofenceMetadata?.isInside ?? true,
      distanceMeters: entry.geofenceMetadata?.distanceMeters ?? 0,
      originalData: entry
    }
  };
}

/**
 * Creates a drift line feature between a fueling event and its matched station
 */
export function createDriftLine(entry: FuelEntry, station: StationProfile): MapFeature | null {
  if (!entry.locationMetadata?.lat || !entry.locationMetadata?.lng) return null;
  if (!station.location.lat || !station.location.lng) return null;

  return {
    id: `drift-${entry.id}-${station.id}`,
    type: 'drift_line',
    geometry: {
      type: 'LineString',
      coordinates: [
        [entry.locationMetadata.lat, entry.locationMetadata.lng],
        [station.location.lat, station.location.lng]
      ]
    },
    properties: {
      distance: entry.geofenceMetadata?.distanceMeters || 0,
      isFlagged: entry.auditStatus === 'Flagged' || !entry.geofenceMetadata?.isInside
    }
  };
}

/**
 * Normalizes station geofences into circle features (metaphorically for normalization)
 * Although Leaflet handles L.circle directly, this keeps the data structured.
 */
export function normalizeGeofenceFeature(station: StationProfile): MapFeature {
  const lat = station?.location?.lat ?? 18.0179;
  const lng = station?.location?.lng ?? -76.8099;

  return {
    id: `geofence-${station.id}`,
    type: 'geofence',
    geometry: {
      type: 'Circle',
      coordinates: [lat, lng]
    },
    properties: {
      radius: station.geofenceRadius ?? getDefaultGeofenceRadius(station.plusCode),
      status: station.status || 'unverified'
    }
  };
}