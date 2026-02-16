// Local types for server context
export type LocationStatus = 'verified' | 'unverified' | 'learnt' | 'anomaly';

export interface StationProfile {
  id: string;
  name: string;
  brand: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  status: LocationStatus;
  gpsAliases?: {
    lat: number;
    lng: number;
    mergedAt?: string;
  }[];
}

/**
 * Safe distance calculation (Haversine Formula)
 * Returns distance in meters.
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Finds the closest gas station within a specific radius.
 * Matches against whatever stations are passed in — caller controls the filtering.
 */
export const findMatchingStation = (
    lat: number, 
    lng: number, 
    stations: StationProfile[], 
    radiusMeters: number = 150,
    gpsAccuracy: number = 0
): StationProfile | null => {
    let closestStation: StationProfile | null = null;
    
    // We add the GPS accuracy to the radius because the transaction point could 
    // actually be up to `gpsAccuracy` meters away from the reported point.
    // This creates a more realistic "Evidence Bridge" matching window.
    const effectiveRadius = radiusMeters + gpsAccuracy;
    let minDistance = effectiveRadius;

    for (const station of stations) {
        // 1. Check Primary Location
        if (station.location?.lat && station.location?.lng) {
            const dist = calculateDistance(lat, lng, station.location.lat, station.location.lng);
            if (dist <= minDistance) {
                minDistance = dist;
                closestStation = station;
            }
        }

        // 2. Check "Evidence Bridge" GPS Aliases (learned from previous merges)
        if (station.gpsAliases && Array.isArray(station.gpsAliases)) {
            for (const alias of station.gpsAliases) {
                const aliasDist = calculateDistance(lat, lng, alias.lat, alias.lng);
                if (aliasDist <= minDistance) {
                    minDistance = aliasDist;
                    closestStation = station;
                }
            }
        }
    }

    return closestStation;
};