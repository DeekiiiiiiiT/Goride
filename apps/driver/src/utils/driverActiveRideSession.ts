import type { RideRequestRow } from '@roam/types/rides';

export {
  DRIVER_ACTIVE_RIDE_STATUSES,
  isDriverActiveRideStatus,
} from '@roam/types/rides';

const STORAGE_KEY = 'roam:driver:active-ride-id';
const SNAPSHOT_KEY = 'roam:driver:active-ride-snapshot';
const SUPPRESS_UI_KEY = 'roam:driver:suppress-active-trip-ui';

export function suppressActiveTripUi(): void {
  try {
    sessionStorage.setItem(SUPPRESS_UI_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearSuppressActiveTripUi(): void {
  try {
    sessionStorage.removeItem(SUPPRESS_UI_KEY);
  } catch {
    /* ignore */
  }
}

export function isActiveTripUiSuppressed(): boolean {
  try {
    return sessionStorage.getItem(SUPPRESS_UI_KEY) === '1';
  } catch {
    return false;
  }
}

/** Drop cached trip id/snapshot and optional UI suppress flag. */
export function clearDriverActiveRideSession(options?: { clearSuppress?: boolean }): void {
  persistActiveRideId(null);
  persistActiveRideSnapshot(null);
  if (options?.clearSuppress !== false) clearSuppressActiveTripUi();
}

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

function sanitizeRideRow(ride: RideRequestRow): RideRequestRow {
  const fix = (v: number | null | undefined) =>
    v != null && !Number.isFinite(Number(v)) ? null : v;
  return {
    ...ride,
    pickup_lat: fix(ride.pickup_lat) ?? ride.pickup_lat,
    pickup_lng: fix(ride.pickup_lng) ?? ride.pickup_lng,
    dropoff_lat: fix(ride.dropoff_lat) ?? ride.dropoff_lat,
    dropoff_lng: fix(ride.dropoff_lng) ?? ride.dropoff_lng,
    last_driver_lat: fix(ride.last_driver_lat),
    last_driver_lng: fix(ride.last_driver_lng),
  };
}

export function readPersistedActiveRideSnapshot(): RideRequestRow | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return sanitizeRideRow(JSON.parse(raw) as RideRequestRow);
  } catch {
    return null;
  }
}
