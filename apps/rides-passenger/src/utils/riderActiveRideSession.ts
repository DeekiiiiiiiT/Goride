import type { RideRequestRow } from '@roam/types/rides';

const snapshotKey = (rideId: string) => `roam:rider:ride-snapshot:${rideId}`;

export type RiderRideCache = {
  ride: RideRequestRow;
  rider_pin?: string | null;
  wait_time?: Record<string, unknown> | null;
};

export function persistRiderRideCache(rideId: string, data: RiderRideCache): void {
  try {
    sessionStorage.setItem(snapshotKey(rideId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function readRiderRideCache(rideId: string): RiderRideCache | undefined {
  try {
    const raw = sessionStorage.getItem(snapshotKey(rideId));
    if (!raw) return undefined;
    return JSON.parse(raw) as RiderRideCache;
  } catch {
    return undefined;
  }
}

export function clearRiderRideCache(rideId: string): void {
  try {
    sessionStorage.removeItem(snapshotKey(rideId));
  } catch {
    /* ignore */
  }
}

/** Returns the first cached active ride id, if any. */
export function readAnyActiveRideId(): string | undefined {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('roam:rider:ride-snapshot:')) {
        return key.slice('roam:rider:ride-snapshot:'.length);
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
