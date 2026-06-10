/**
 * Shadow Roam payer privacy — single source of truth for field redaction.
 */

export type RoamMode = "open_roam" | "shadow_roam";

export const SHADOW_BOOKER_LOCATION_KEYS = [
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

export const SHADOW_BOOKER_OPERATIONAL_KEYS = [
  "eta_pickup_seconds_estimate",
  "eta_dropoff_seconds_estimate",
  "assigned_driver_user_id",
  "last_driver_location_at",
  "verification_pin",
] as const;

export const SHADOW_BOOKER_PII_KEYS = [
  "guest_passenger_phone",
  "passenger_user_id",
] as const;

const ALL_SHADOW_BOOKER_STRIP_KEYS = [
  ...SHADOW_BOOKER_LOCATION_KEYS,
  ...SHADOW_BOOKER_OPERATIONAL_KEYS,
  ...SHADOW_BOOKER_PII_KEYS,
] as const;

export function isShadowRoamMode(mode: unknown): boolean {
  return mode === "shadow_roam";
}

export function sanitizeRideForShadowBooker(
  ride: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!ride) return null;
  const out = { ...ride } as Record<string, unknown>;
  for (const key of ALL_SHADOW_BOOKER_STRIP_KEYS) {
    delete out[key];
  }
  return out;
}

/** Hub activity ride row for payer (booker) — null addresses on shadow trips. */
export function sanitizeActivityRideForBooker(
  item: Record<string, unknown>,
): Record<string, unknown> {
  if (!isShadowRoamMode(item.roam_mode)) return item;
  return {
    ...item,
    pickup_address: null,
    dropoff_address: null,
    counterparty_name: null,
  };
}

/** Hub activity intent row for target booker — null addresses on shadow intents. */
export function sanitizeActivityIntentForTargetBooker(
  item: Record<string, unknown>,
  role: "requester" | "target_booker",
): Record<string, unknown> {
  if (role !== "target_booker" || !isShadowRoamMode(item.roam_mode)) return item;
  const status = String(item.status ?? "");
  const hideIdentity = status === "booked";
  return {
    ...item,
    pickup_address: null,
    dropoff_address: null,
    requester_name: hideIdentity ? null : item.requester_name ?? null,
  };
}
