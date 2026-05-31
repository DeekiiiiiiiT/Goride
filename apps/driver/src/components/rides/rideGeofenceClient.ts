import type { RideRequestRow } from '@roam/types/rides';

/** Matches default `dropoff_geofence_radius_m` in dispatch settings. */
export const DEFAULT_DROPOFF_GEOFENCE_RADIUS_M = 100;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Server sets this after dwell inside the drop-off geofence. */
export function canCompleteTrip(ride: RideRequestRow): boolean {
  return Boolean(ride.complete_suggested_at);
}

export function distanceToDropoffM(
  ride: RideRequestRow,
  lat?: number | null,
  lng?: number | null,
): number | null {
  const driverLat = lat ?? ride.last_driver_lat;
  const driverLng = lng ?? ride.last_driver_lng;
  if (driverLat == null || driverLng == null) return null;
  return haversineMeters(driverLat, driverLng, ride.dropoff_lat, ride.dropoff_lng);
}

export function isInsideDropoffGeofence(
  ride: RideRequestRow,
  lat?: number | null,
  lng?: number | null,
  accuracyM?: number | null,
  radiusM = DEFAULT_DROPOFF_GEOFENCE_RADIUS_M,
): boolean {
  const dist = distanceToDropoffM(ride, lat, lng);
  if (dist == null) return false;
  const buffer = accuracyM != null && Number.isFinite(accuracyM) ? accuracyM * 0.5 : 0;
  return dist <= radiusM + buffer;
}
