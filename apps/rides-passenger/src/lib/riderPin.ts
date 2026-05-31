import type { RideRequestRow } from '@roam/types/rides';

/** Matches server `shouldExposeRiderPin` (pickup geofence or arrived). */
export function shouldShowRiderPin(
  ride: Pick<RideRequestRow, 'status' | 'wait_time_started_at' | 'pin_verified_at'>,
): boolean {
  if (ride.pin_verified_at) return false;
  if (ride.status === 'driver_arrived_pickup') return true;
  if (ride.status === 'driver_en_route_pickup') {
    return Boolean(ride.wait_time_started_at?.trim());
  }
  return false;
}

export function isRiderPinTripPhase(status: RideRequestRow['status']): boolean {
  return (
    status === 'driver_assigned' ||
    status === 'driver_en_route_pickup' ||
    status === 'driver_arrived_pickup'
  );
}

export function normalizeRiderPin(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return /^\d{4}$/.test(s) ? s : null;
}

/** PIN digits for UI — only from API `rider_pin` when geofence allows. */
export function resolveRiderPinDisplay(
  ride: Pick<RideRequestRow, 'status' | 'wait_time_started_at' | 'pin_verified_at'>,
  riderPinFromApi: string | null | undefined,
): string | null {
  if (!shouldShowRiderPin(ride)) return null;
  return normalizeRiderPin(riderPinFromApi);
}
