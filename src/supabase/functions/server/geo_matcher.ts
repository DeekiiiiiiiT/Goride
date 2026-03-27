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
  geofenceRadius?: number;
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

// ─── AMBIGUITY-AWARE SMART MATCHING ───────────────────────────────────────────

/**
 * Result from the ambiguity-aware smart matching function.
 * Includes confidence level and diagnostic info for logging/auditing.
 */
export interface SmartMatchResult {
  station: StationProfile | null;
  confidence: 'high' | 'medium' | 'ambiguous' | 'none';
  distance: number;
  candidatesInRange: number;
  secondClosestDistance: number;
  ambiguityReason?: string;
}

/**
 * Calculates the shortest distance from a GPS point to a station,
 * checking the primary location AND all gpsAliases.
 */
const shortestDistanceToStation = (lat: number, lng: number, station: StationProfile): number => {
  let minDist = Infinity;

  // Primary location
  if (station.location?.lat && station.location?.lng) {
    const d = calculateDistance(lat, lng, station.location.lat, station.location.lng);
    if (d < minDist) minDist = d;
  }

  // GPS Aliases (Evidence Bridge points from previous merges)
  if (station.gpsAliases && Array.isArray(station.gpsAliases)) {
    for (const alias of station.gpsAliases) {
      if (alias.lat && alias.lng) {
        const d = calculateDistance(lat, lng, alias.lat, alias.lng);
        if (d < minDist) minDist = d;
      }
    }
  }

  return minDist;
};

/**
 * Default radius when `geofenceRadius` is absent — aligned with duplicate-check / admin UI fallbacks.
 */
const DEFAULT_STATION_GEOFENCE_METERS = 150;

const geofenceLimitMeters = (station: StationProfile): number =>
  station.geofenceRadius ?? DEFAULT_STATION_GEOFENCE_METERS;

/**
 * A match is accepted only if d <= R + A (per-station geofence plus GPS accuracy buffer).
 */
const isWithinStationAcceptance = (
  station: StationProfile,
  distanceMeters: number,
  gpsAccuracyMeters: number
): boolean => {
  const R = geofenceLimitMeters(station);
  return distanceMeters <= R + gpsAccuracyMeters;
};

/**
 * Ambiguity-Aware Smart Matching
 *
 * Two radii:
 * - **Search radius** (`maxRadiusMeters` + `gpsAccuracy`, default ~600m): which stations are considered
 *   as spatial candidates at all.
 * - **Acceptance** (per station: `geofenceRadius` + `gpsAccuracy`): a candidate is kept only if
 *   the shortest distance to that station satisfies d <= R + A.
 *
 * Outcomes (after acceptance filter):
 *   - 0 accepted                      → none (no match; e.g. Learnt funnel)
 *   - 1 accepted                      → high (sole acceptable candidate)
 *   - 2+ accepted, ambiguity rules  → high / medium / ambiguous (unchanged; uses accepted list only)
 *
 * The driver workflow is unaffected — this runs server-side on GPS data only.
 */
export const findMatchingStationSmart = (
  lat: number,
  lng: number,
  stations: StationProfile[],
  maxRadiusMeters: number = 600,
  gpsAccuracy: number = 0
): SmartMatchResult => {
  const effectiveRadius = maxRadiusMeters + gpsAccuracy;

  // 1. Stations within search radius (discovery pool — not yet geofence-validated)
  const inSearchRadius: { station: StationProfile; distance: number }[] = [];

  for (const station of stations) {
    const dist = shortestDistanceToStation(lat, lng, station);
    if (dist <= effectiveRadius) {
      inSearchRadius.push({ station, distance: Math.round(dist) });
    }
  }

  inSearchRadius.sort((a, b) => a.distance - b.distance);

  if (inSearchRadius.length === 0) {
    console.log(`[SmartMatch] 0 stations within search radius ${effectiveRadius}m. Decision: none`);
    return {
      station: null,
      confidence: 'none',
      distance: Infinity,
      candidatesInRange: 0,
      secondClosestDistance: Infinity,
    };
  }

  // 2. Acceptance: drop candidates outside that station's geofence (+ GPS accuracy)
  const accepted: { station: StationProfile; distance: number }[] = [];
  for (const c of inSearchRadius) {
    const R = geofenceLimitMeters(c.station);
    if (isWithinStationAcceptance(c.station, c.distance, gpsAccuracy)) {
      accepted.push(c);
    } else {
      console.log(
        `[SmartMatch] Geofence reject: id=${c.station.id} name="${c.station.name}" ` +
          `d=${c.distance}m R=${R}m A=${gpsAccuracy}m (require d<=${R + gpsAccuracy}m)`
      );
    }
  }

  if (accepted.length === 0) {
    const closestRejected = inSearchRadius[0];
    console.log(
      `[SmartMatch] ${inSearchRadius.length} station(s) within search radius but 0 within per-station geofence (R+A). Decision: none`
    );
    return {
      station: null,
      confidence: 'none',
      distance: closestRejected.distance,
      candidatesInRange: 0,
      secondClosestDistance: Infinity,
    };
  }

  const candidatesInRange = accepted.length;
  const closest = accepted[0];
  const secondClosestDistance = candidatesInRange >= 2 ? accepted[1].distance : Infinity;

  if (candidatesInRange === 1) {
    const R = geofenceLimitMeters(closest.station);
    console.log(
      `[SmartMatch] 1 station within geofence (R+A): "${closest.station.name}" at ${closest.distance}m ` +
        `(R=${R}m A=${gpsAccuracy}m). Decision: high (sole candidate)`
    );
    return {
      station: closest.station,
      confidence: 'high',
      distance: closest.distance,
      candidatesInRange: 1,
      secondClosestDistance: Infinity,
    };
  }

  // Multiple accepted candidates — ambiguity rules (same as before, on accepted list only)
  const stationGeofence = geofenceLimitMeters(closest.station);
  const ratio = secondClosestDistance > 0 ? closest.distance / secondClosestDistance : 0;
  const secondName = accepted[1].station.name;

  // 3a. Closest is inside its own nominal geofence (tight zone, no buffer) — safe even with neighbours
  if (closest.distance <= stationGeofence) {
    console.log(
      `[SmartMatch] ${candidatesInRange} stations accepted. ` +
        `Closest: "${closest.station.name}" at ${closest.distance}m (inside geofence ${stationGeofence}m). ` +
        `Second: "${secondName}" at ${secondClosestDistance}m. Ratio: ${ratio.toFixed(2)}. Decision: high (within geofence)`
    );
    return {
      station: closest.station,
      confidence: 'high',
      distance: closest.distance,
      candidatesInRange,
      secondClosestDistance,
    };
  }

  // 3b. Closest is clearly nearer than second (less than half the distance)
  if (closest.distance < secondClosestDistance * 0.5) {
    console.log(
      `[SmartMatch] ${candidatesInRange} stations accepted. ` +
        `Closest: "${closest.station.name}" at ${closest.distance}m. ` +
        `Second: "${secondName}" at ${secondClosestDistance}m. Ratio: ${ratio.toFixed(2)}. Decision: medium (clearly closer)`
    );
    return {
      station: closest.station,
      confidence: 'medium',
      distance: closest.distance,
      candidatesInRange,
      secondClosestDistance,
    };
  }

  // 3c. Distances are too similar — refuse to guess
  const ambiguityReason =
    `${candidatesInRange} stations within geofence acceptance. ` +
    `Closest: "${closest.station.name}" at ${closest.distance}m. ` +
    `Second: "${secondName}" at ${secondClosestDistance}m. ` +
    `Ratio: ${ratio.toFixed(2)} — too close to distinguish.`;

  console.log(`[SmartMatch] ${ambiguityReason} Decision: ambiguous`);

  return {
    station: null,
    confidence: 'ambiguous',
    distance: closest.distance,
    candidatesInRange,
    secondClosestDistance,
    ambiguityReason,
  };
};