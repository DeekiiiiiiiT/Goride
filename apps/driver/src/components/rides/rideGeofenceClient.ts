import type { RideRequestRow } from '@roam/types/rides';

/** Matches default `pickup_geofence_radius_m` in dispatch settings. */
export const DEFAULT_PICKUP_GEOFENCE_RADIUS_M = 80;

/** Matches default `dropoff_geofence_radius_m` in dispatch settings. */
export const DEFAULT_DROPOFF_GEOFENCE_RADIUS_M = 100;

/** Matches default `arrival_dwell_seconds` in dispatch settings. */
export const DEFAULT_ARRIVAL_DWELL_SECONDS = 15;

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

export function distanceToPickupM(
  ride: RideRequestRow,
  lat?: number | null,
  lng?: number | null,
): number | null {
  const driverLat = lat ?? ride.last_driver_lat;
  const driverLng = lng ?? ride.last_driver_lng;
  if (driverLat == null || driverLng == null) return null;
  return haversineMeters(driverLat, driverLng, ride.pickup_lat, ride.pickup_lng);
}

export function isInsidePickupGeofence(
  ride: RideRequestRow,
  lat?: number | null,
  lng?: number | null,
  accuracyM?: number | null,
  radiusM = DEFAULT_PICKUP_GEOFENCE_RADIUS_M,
): boolean {
  const dist = distanceToPickupM(ride, lat, lng);
  if (dist == null) return false;
  const buffer = accuracyM != null && Number.isFinite(accuracyM) ? accuracyM * 0.5 : 0;
  return dist <= radiusM + buffer;
}

/** Rider PIN is visible once pickup geofence grace has started (matches server). */
export function isAtPickupGeofence(ride: RideRequestRow): boolean {
  return Boolean(ride.wait_time_started_at?.trim());
}

export function pickupArrivalLabel(
  ride: RideRequestRow,
  distanceToPickupMeters: number | null | undefined,
): { primary: string; secondary?: string } {
  if (ride.status === 'driver_arrived_pickup') {
    return { primary: 'Arrived', secondary: 'Enter rider PIN to start' };
  }
  if (isAtPickupGeofence(ride)) {
    return {
      primary: 'At pickup',
      secondary: 'Confirming arrival automatically…',
    };
  }
  if (distanceToPickupMeters != null && distanceToPickupMeters <= DEFAULT_PICKUP_GEOFENCE_RADIUS_M) {
    return { primary: 'At pickup', secondary: 'Entering pickup zone' };
  }
  const seconds = ride.eta_pickup_seconds_estimate;
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    const mins = Math.max(1, Math.ceil(seconds / 60));
    return { primary: `${mins} min away` };
  }
  const dist = distanceToPickupM(ride);
  if (dist != null && dist < 500) {
    const mins = Math.max(1, Math.round((dist / 1000 / 35) * 60));
    return { primary: `${mins} min away` };
  }
  return { primary: 'En route' };
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
