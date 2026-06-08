/**
 * Trip Intent access control — Open Roam vs Shadow Roam booker visibility.
 */

import { getRideParticipantRole } from "./rideAccess.ts";

export type RoamMode = "open_roam" | "shadow_roam";

const LOCATION_KEYS = [
  "pickup_lat",
  "pickup_lng",
  "pickup_address",
  "dropoff_lat",
  "dropoff_lng",
  "dropoff_address",
  "route_polyline_encoded",
  "last_driver_lat",
  "last_driver_lng",
  "last_driver_heading",
] as const;

export function isShadowRoamMode(mode: unknown): boolean {
  return mode === "shadow_roam";
}

export function isShadowRoamRide(ride: Record<string, unknown>): boolean {
  return isShadowRoamMode(ride.roam_mode);
}

export function isShadowBooker(ride: Record<string, unknown>, userId: string): boolean {
  return getRideParticipantRole(ride, userId) === "booker" && isShadowRoamRide(ride);
}

/** Shadow booker cannot cancel after payment / claim — support only. */
export function canBookerCancelShadowRide(
  ride: Record<string, unknown>,
  userId: string,
): boolean {
  if (!isShadowBooker(ride, userId)) return true;
  return false;
}

export function canShadowBookerChat(ride: Record<string, unknown>, userId: string): boolean {
  if (!isShadowBooker(ride, userId)) return true;
  return false;
}

export function canShadowBookerAccessLive(ride: Record<string, unknown>, userId: string): boolean {
  return !isShadowBooker(ride, userId);
}

export function sanitizeRideForShadowBooker(
  ride: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!ride) return null;
  const out = { ...ride } as Record<string, unknown>;
  for (const key of LOCATION_KEYS) {
    delete out[key];
  }
  delete out.verification_pin;
  return out;
}

export type TripIntentRowLike = Record<string, unknown>;

export function sanitizeTripIntentForBooker(
  row: TripIntentRowLike,
  roamMode: RoamMode,
): Record<string, unknown> {
  const hasRoute = row.pickup_lat != null && row.pickup_lng != null &&
    row.dropoff_lat != null && row.dropoff_lng != null;

  const base: Record<string, unknown> = {
    intent_id: row.id,
    roam_mode: roamMode,
    status: row.status,
    vehicle_option: row.vehicle_option ?? null,
    fare_estimate_minor: row.fare_estimate_minor ?? null,
    currency: row.currency ?? "JMD",
    has_route: hasRoute,
    expires_at: row.expires_at,
  };

  if (roamMode === "shadow_roam") {
    return base;
  }

  return base;
}

export function bookerVisibilityForRide(
  ride: Record<string, unknown>,
  userId: string,
): "open" | "shadow" | "passenger" | "driver" | "none" {
  const role = getRideParticipantRole(ride, userId);
  if (role === "booker") {
    return isShadowRoamRide(ride) ? "shadow" : "open";
  }
  if (role === "passenger" || role === "driver") return role;
  return "none";
}
