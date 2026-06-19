import type { RideRequestRow } from '@roam/types/rides';

export const DEFAULT_PICKUP_GEOFENCE_RADIUS_M = 80;
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

export function canCompleteTrip(ride: RideRequestRow): boolean {
  return Boolean(ride.complete_suggested_at);
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

export function formatDistanceMeters(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function pickupNavInstruction(address: string | null | undefined): string {
  const line1 = address?.split(',')[0]?.trim();
  return line1 ? `Navigate to ${line1}` : 'Head to pickup';
}
