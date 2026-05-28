export {
  DRIVER_ACTIVE_RIDE_STATUSES,
  isDriverActiveRideStatus,
} from '@roam/types/rides';

const STORAGE_KEY = 'roam:driver:active-ride-id';

export function persistActiveRideId(rideId: string | null): void {
  try {
    if (rideId) sessionStorage.setItem(STORAGE_KEY, rideId);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / SSR */
  }
}

export function readPersistedActiveRideId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
