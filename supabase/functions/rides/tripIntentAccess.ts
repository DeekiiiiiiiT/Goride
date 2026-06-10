/**
 * Trip Intent access control — Open Roam vs Shadow Roam booker visibility.
 */

import { getRideParticipantRole } from "./rideAccess.ts";
import {
  isShadowRoamMode,
  sanitizeRideForShadowBooker,
  type RoamMode,
} from "./shadowBookerPrivacy.ts";

export type { RoamMode } from "./shadowBookerPrivacy.ts";
export {
  sanitizeActivityIntentForTargetBooker,
  sanitizeActivityRideForBooker,
  sanitizeRideForShadowBooker,
} from "./shadowBookerPrivacy.ts";

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
