/**
 * Delegated-booker trip minimize tracker — session + mode helpers.
 *
 * Heavy RidePage subscriptions (see RidePage.tsx):
 * - ridesGetRequest poll (5s / 2s)
 * - ridesGetLive poll (5s)
 * - Supabase realtime on ride_requests
 * - LiveRideMap + RideChat (via BookerTrackingView)
 * All disabled when mode !== 'full' (RidePage unmounted on minimize).
 *
 * Edge cases:
 * - Multiple active rides: chip shows the most recent delegated booker ride only.
 * - Trip terminal: minimized session cleared on next focus fetch; optional toast.
 * - Stale map on re-open: RidePage remounts with immediate refetch.
 *
 * Deploy: client Phases 0–4,6–8 need passenger rebuild; Phase 5 needs `rides` edge deploy.
 *
 * QA: minimize → Home usable; no ride/live polls while minimized; focus → one summary fetch;
 * eye chip → full tracker; cancel still explicit; passenger auto-redirect unchanged; self-booked
 * leave dialog unchanged; trip complete → chip gone.
 *
 * Trip Intent v2 QA (shadow vs open):
 * - Shadow booker: no chip, no RidePage tracking, `/shadow-trip/:id` status only, no cancel after pay.
 * - Open booker: overlay fulfill → full tracker + minimize chip unchanged.
 * - Tag lookup / contact intent → TripIntentBookSheet → fulfill routes by roam_mode.
 */

import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { liveRideStatusHeadline } from '@/components/LiveRideView';

export const BOOKER_TRACKING_SESSION_KEY = 'roam:booker-tracking-minimized';
export const MINIMIZE_EXIT_PENDING_KEY = 'roam:minimize-exit-pending';

export type MinimizedRideRole = 'booker' | 'passenger';

export type MinimizedRideSession = {
  rideId: string;
  role: MinimizedRideRole;
};

export type BookerTrackingMode = 'full' | 'minimized' | 'off';

export const TERMINAL_RIDE_STATUSES: RideRequestStatus[] = ['completed', 'cancelled'];

export const BOOKER_CHIP_HEIGHT_PX = 56;

export function isDelegatedBookerRole(
  participantRole: string | null | undefined,
  isDelegated: boolean | undefined,
): boolean {
  return participantRole === 'booker' && isDelegated === true;
}

export function isTerminalRideStatus(status: string | undefined): boolean {
  return Boolean(status && TERMINAL_RIDE_STATUSES.includes(status as RideRequestStatus));
}

export function bookerChipStatusLabel(
  status: RideRequestStatus,
  ride?: Pick<RideRequestRow, 'eta_pickup_seconds_estimate'>,
): string {
  if (status === 'matching') return 'Finding a driver…';
  return liveRideStatusHeadline(status, (ride ?? {}) as RideRequestRow);
}

export function persistMinimizedRide(rideId: string, role: MinimizedRideRole): void {
  try {
    const payload: MinimizedRideSession = { rideId, role };
    sessionStorage.setItem(BOOKER_TRACKING_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function setMinimizeExitPending(rideId: string): void {
  try {
    sessionStorage.setItem(MINIMIZE_EXIT_PENDING_KEY, rideId);
  } catch {
    /* ignore */
  }
}

export function readMinimizeExitPending(): string | null {
  try {
    return sessionStorage.getItem(MINIMIZE_EXIT_PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearMinimizeExitPending(): void {
  try {
    sessionStorage.removeItem(MINIMIZE_EXIT_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Use persistMinimizedRide — kept for call-site clarity. */
export function persistBookerMinimized(rideId: string): void {
  persistMinimizedRide(rideId, 'booker');
}

export function readMinimizedRideSession(): MinimizedRideSession | null {
  try {
    const raw = sessionStorage.getItem(BOOKER_TRACKING_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as MinimizedRideSession;
      if (parsed?.rideId && (parsed.role === 'booker' || parsed.role === 'passenger')) {
        return parsed;
      }
    } catch {
      /* legacy: plain ride id string */
    }
    if (raw.length > 0) return { rideId: raw, role: 'booker' };
    return null;
  } catch {
    return null;
  }
}

export function readBookerMinimizedRideId(): string | null {
  return readMinimizedRideSession()?.rideId ?? null;
}

export function isMinimizedRideActive(): boolean {
  return readMinimizedRideSession() != null;
}

export function clearBookerMinimized(): void {
  try {
    sessionStorage.removeItem(BOOKER_TRACKING_SESSION_KEY);
    sessionStorage.removeItem(MINIMIZE_EXIT_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function passengerChipStatusLabel(
  status: RideRequestStatus,
  ride?: Pick<RideRequestRow, 'eta_pickup_seconds_estimate' | 'duration_estimate_minutes'>,
): string {
  if (status === 'on_trip') {
    const mins = ride?.duration_estimate_minutes;
    if (mins != null && mins > 0) {
      const rounded = Math.max(1, Math.round(mins));
      return `Arriving in ${rounded} min${rounded === 1 ? '' : 's'}`;
    }
    return 'Trip in progress';
  }
  return bookerChipStatusLabel(status, ride);
}

export function parseRideIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/ride\/([^/]+)/);
  return match?.[1] ?? null;
}
