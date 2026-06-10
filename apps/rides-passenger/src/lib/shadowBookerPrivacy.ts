import type { RideRequestRow } from '@roam/types/rides';

type RoamMode = 'open_roam' | 'shadow_roam' | null | undefined;
type ParticipantRole = 'booker' | 'passenger' | 'driver' | 'none' | null | undefined;

export const SHADOW_BOOKER_LOCATION_KEYS = [
  'pickup_lat',
  'pickup_lng',
  'pickup_address',
  'dropoff_lat',
  'dropoff_lng',
  'dropoff_address',
  'route_polyline_encoded',
  'last_driver_lat',
  'last_driver_lng',
  'last_driver_heading',
] as const;

export const SHADOW_BOOKER_OPERATIONAL_KEYS = [
  'eta_pickup_seconds_estimate',
  'eta_dropoff_seconds_estimate',
  'assigned_driver_user_id',
  'last_driver_location_at',
  'verification_pin',
] as const;

const ALL_SHADOW_BOOKER_STRIP_KEYS = [
  ...SHADOW_BOOKER_LOCATION_KEYS,
  ...SHADOW_BOOKER_OPERATIONAL_KEYS,
] as const;

export function shouldHideLocationsForBooker(
  roamMode: RoamMode,
  participantRole: ParticipantRole,
): boolean {
  return participantRole === 'booker' && roamMode === 'shadow_roam';
}

export function redactRideForShadowBooker<T extends Record<string, unknown>>(ride: T): T {
  const out = { ...ride } as T & Record<string, unknown>;
  for (const key of ALL_SHADOW_BOOKER_STRIP_KEYS) {
    delete out[key];
  }
  return out as T;
}

export function redactRideRowForShadowBooker(ride: RideRequestRow): RideRequestRow {
  return redactRideForShadowBooker(ride) as RideRequestRow;
}

export function bookerVisibleAddress(
  roamMode: RoamMode,
  role: ParticipantRole,
  address: string | null | undefined,
): string | null {
  if (shouldHideLocationsForBooker(roamMode, role)) return null;
  const trimmed = address?.trim();
  return trimmed || null;
}

export function sanitizeSomeoneRideItem<T extends {
  roam_mode?: RoamMode;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  counterparty_name?: string | null;
}>(item: T): T {
  if (item.roam_mode !== 'shadow_roam') return item;
  return {
    ...item,
    pickup_address: null,
    dropoff_address: null,
    counterparty_name: null,
  };
}

export function sanitizeSomeoneIntentItem<T extends {
  roam_mode?: RoamMode;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  requester_name?: string | null;
  status?: string | null;
  intent_role?: 'requester' | 'target_booker';
}>(item: T): T {
  if (item.intent_role === 'requester' || item.roam_mode !== 'shadow_roam') return item;
  const hideIdentity = item.status === 'booked';
  return {
    ...item,
    pickup_address: null,
    dropoff_address: null,
    requester_name: hideIdentity ? null : item.requester_name ?? null,
  };
}

export function redactActiveRideResponseForShadowBooker(
  active: {
    ride: RideRequestRow;
    participant_role: ParticipantRole;
    is_delegated?: boolean;
  },
): typeof active {
  if (!shouldHideLocationsForBooker(active.ride.roam_mode, active.participant_role)) {
    return active;
  }
  return {
    ...active,
    ride: redactRideRowForShadowBooker(active.ride),
  };
}
