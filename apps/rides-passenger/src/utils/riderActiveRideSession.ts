import type { RideRequestRow } from '@roam/types/rides';
import {
  redactRideRowForShadowBooker,
  shouldHideLocationsForBooker,
} from '@/lib/shadowBookerPrivacy';

const snapshotKey = (rideId: string) => `roam:rider:ride-snapshot:${rideId}`;

export type RiderRideCache = {
  ride: RideRequestRow;
  rider_pin?: string | null;
  wait_time?: Record<string, unknown> | null;
  participant_role?: 'booker' | 'passenger' | 'driver' | 'none' | null;
};

function sanitizeCachePayload(data: RiderRideCache): RiderRideCache {
  const role = data.participant_role ?? null;
  if (!shouldHideLocationsForBooker(data.ride.roam_mode, role)) return data;
  return {
    ...data,
    ride: redactRideRowForShadowBooker(data.ride),
    rider_pin: null,
    wait_time: null,
  };
}

export function persistRiderRideCache(
  rideId: string,
  data: RiderRideCache,
  options?: { participantRole?: RiderRideCache['participant_role'] },
): void {
  try {
    const payload: RiderRideCache = {
      ...data,
      participant_role: options?.participantRole ?? data.participant_role ?? null,
    };
    sessionStorage.setItem(snapshotKey(rideId), JSON.stringify(sanitizeCachePayload(payload)));
  } catch {
    /* ignore */
  }
}

export function readRiderRideCache(rideId: string): RiderRideCache | undefined {
  try {
    const raw = sessionStorage.getItem(snapshotKey(rideId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as RiderRideCache;
    return sanitizeCachePayload(parsed);
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
