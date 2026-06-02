import type { RideRequestRow } from '@roam/types/rides';

export {
  DRIVER_ACTIVE_RIDE_STATUSES,
  isDriverActiveRideStatus,
} from '@roam/types/rides';

const STORAGE_KEY = 'roam:driver:active-ride-id';
const SNAPSHOT_KEY = 'roam:driver:active-ride-snapshot';

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

/** Last known active ride row — keeps trip UI usable while offline. */
export function persistActiveRideSnapshot(ride: RideRequestRow | null): void {
  try {
    if (ride) sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(ride));
    else sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedActiveRideSnapshot(): RideRequestRow | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RideRequestRow;
  } catch {
    return null;
  }
}
