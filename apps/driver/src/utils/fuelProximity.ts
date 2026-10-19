/**
 * On-device proximity check after fuel GPS lock (late-log / left-station UX).
 */
import { calculateDistance } from './geoUtils';

export type FuelProximityStation = {
  id: string;
  name: string;
  brand?: string;
  status?: string;
  location?: { lat?: number; lng?: number; radius?: number };
  geofenceRadius?: number;
};

export type FuelProximityResult =
  | { kind: 'inside'; station: FuelProximityStation; distanceM: number }
  | { kind: 'near_miss'; station: FuelProximityStation; distanceM: number }
  | { kind: 'none'; nearest: FuelProximityStation | null; distanceM: number | null }
  | { kind: 'no_gps' };

const NEAR_MISS_M = 1000;
const DEFAULT_RADIUS_M = 75;

function stationRadius(s: FuelProximityStation): number {
  return Number(s.geofenceRadius ?? s.location?.radius) || DEFAULT_RADIUS_M;
}

export function evaluateFuelProximity(
  lat: number | null | undefined,
  lng: number | null | undefined,
  stations: FuelProximityStation[],
): FuelProximityResult {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { kind: 'no_gps' };
  }

  const verified = stations.filter((s) => !s.status || s.status === 'verified');
  let inside: { station: FuelProximityStation; distanceM: number } | null = null;
  const near: { station: FuelProximityStation; distanceM: number }[] = [];

  for (const station of verified) {
    const sLat = Number(station.location?.lat);
    const sLng = Number(station.location?.lng);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;
    const distanceM = Math.round(calculateDistance(lat, lng, sLat, sLng));
    const R = stationRadius(station);
    if (distanceM <= R) {
      if (!inside || distanceM < inside.distanceM) {
        inside = { station, distanceM };
      }
    } else if (distanceM <= NEAR_MISS_M) {
      near.push({ station, distanceM });
    }
  }

  if (inside) return { kind: 'inside', ...inside };

  near.sort((a, b) => a.distanceM - b.distanceM);
  if (near.length === 1) {
    return { kind: 'near_miss', station: near[0].station, distanceM: near[0].distanceM };
  }

  const nearest = near[0] || null;
  return {
    kind: 'none',
    nearest: nearest?.station ?? null,
    distanceM: nearest?.distanceM ?? null,
  };
}

export type DriverClaimMinutesAgo = 'just_now' | '5_15' | '15_60' | 'earlier_today';

export function minutesAgoToApprox(value: DriverClaimMinutesAgo): number {
  switch (value) {
    case 'just_now':
      return 2;
    case '5_15':
      return 10;
    case '15_60':
      return 30;
    case 'earlier_today':
      return 180;
    default:
      return 10;
  }
}
