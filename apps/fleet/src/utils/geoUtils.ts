import { FuelEntry } from '../types/fuel';
import { StationProfile, StationAlias } from '../types/station';

/**
 * Normalizes a FuelEntry to ensure geolocation fields exist even for legacy data.
 */
export const normalizeFuelEntryGeo = (entry: FuelEntry): FuelEntry => {
  if (entry.locationMetadata) return entry;
  
  return {
    ...entry,
    locationMetadata: {
      lat: 0,
      lng: 0,
      accuracy: 0,
    },
    locationStatus: entry.locationStatus || 'anomaly' // Default legacy entries to anomaly if no geo
  };
};

/**
 * Safe distance calculation (Haversine Formula)
 * Returns distance in meters.
 * Refined for high precision sub-meter accuracy (Step 2.1).
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  // Handle edge cases like null coordinates (Step 2.4)
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined ||
      lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return Infinity;
  }
  
  // Return 0 if coordinates are identical
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371008.8; // Refined Earth radius in meters (WGS84 average)
  const toRad = Math.PI / 180;
  
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
};

/**
 * Checks if a coordinate is inside a geofence with adaptive radius (Step 2.2).
 * Prioritizes station-specific radius, falls back to a global default.
 */
export const isInsideGeofence = (
  userLat: number,
  userLng: number,
  station: StationProfile,
  defaultRadius: number = 75
): { isInside: boolean; distance: number; radiusUsed: number } => {
  const radiusUsed = station.location.radius || defaultRadius;
  const distance = calculateDistance(userLat, userLng, station.location.lat, station.location.lng);
  
  return {
    isInside: distance <= radiusUsed,
    distance,
    radiusUsed
  };
};

/**
 * Finds the nearest station while accounting for adaptive radii (Step 2.3).
 * Instead of just raw distance, it checks if the user is within ANY station's specific boundary.
 */
export const findStationByGeofence = (
  userLat: number,
  userLng: number,
  stations: StationProfile[],
  aliases: StationAlias[] = [],
  defaultRadius: number = 75
): { station: StationProfile | null; matchType: 'master' | 'alias' | 'none'; metadata: any } => {
  
  // 1. Check Master Ledger with adaptive radii
  for (const station of stations) {
    const check = isInsideGeofence(userLat, userLng, station, defaultRadius);
    if (check.isInside) {
      return { 
        station, 
        matchType: 'master', 
        metadata: check 
      };
    }
  }

  // 2. Check Aliases with potential radius overrides
  for (const alias of aliases) {
    const parentStation = stations.find(s => s.id === alias.id); // Assuming alias ID maps to station ID
    if (!parentStation) continue;

    const distance = calculateDistance(userLat, userLng, alias.lat, alias.lng);
    const radiusUsed = alias.radius || parentStation.location.radius || defaultRadius;

    if (distance <= radiusUsed) {
      return { 
        station: parentStation, 
        matchType: 'alias', 
        metadata: { isInside: true, distance, radiusUsed } 
      };
    }
  }

  // 3. Fallback: Find strictly nearest station if no fence is breached
  let nearest: StationProfile | null = null;
  let minDistance = Infinity;

  stations.forEach(s => {
    const d = calculateDistance(userLat, userLng, s.location.lat, s.location.lng);
    if (d < minDistance) {
      minDistance = d;
      nearest = s;
    }
  });

  return { 
    station: nearest, 
    matchType: 'none', 
    metadata: { isInside: false, distance: minDistance, radiusUsed: defaultRadius } 
  };
};
