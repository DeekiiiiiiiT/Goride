import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estimateNearestPickupEta } from "./distanceMatrix.ts";
import { haversineKm } from "./routing.ts";

/** Max age for driver location rows (same as matching). */
export const DRIVER_LOCATION_MAX_AGE_MS = 10 * 60 * 1000;

/** Haversine radius for quote-time driver search (tighter than matching wave 3). */
export const QUOTE_DRIVER_RADIUS_KM = 15;

export type PickupEtaSource =
  | "google_distance_matrix"
  | "haversine_fallback"
  | "no_drivers";

export type ResolvedPickupEta = {
  pickupSeconds: number | null;
  driversAvailable: boolean;
  pickupEtaSource: PickupEtaSource;
};

export async function resolvePickupEta(
  db: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  opts?: { allowedBodyTypeSlugs?: Set<string> },
): Promise<ResolvedPickupEta> {
  const freshSince = new Date(Date.now() - DRIVER_LOCATION_MAX_AGE_MS).toISOString();
  const { data: locs } = await db
    .from("driver_locations")
    .select("user_id, lat, lng, updated_at, body_type_slug")
    .gte("updated_at", freshSince)
    .eq("available_for_rides", true);

  type DriverRow = { user_id: string; lat: number; lng: number; haversineKm: number };
  const nearby: DriverRow[] = [];

  const allowed = opts?.allowedBodyTypeSlugs;
  for (const row of locs ?? []) {
    const bodySlug = (row as { body_type_slug?: string | null }).body_type_slug ?? null;
    if (allowed && allowed.size > 0 && (!bodySlug || !allowed.has(bodySlug))) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const km = haversineKm(pickupLat, pickupLng, lat, lng);
    if (km <= QUOTE_DRIVER_RADIUS_KM) {
      nearby.push({
        user_id: row.user_id as string,
        lat,
        lng,
        haversineKm: km,
      });
    }
  }

  if (nearby.length === 0) {
    return {
      pickupSeconds: null,
      driversAvailable: false,
      pickupEtaSource: "no_drivers",
    };
  }

  nearby.sort((a, b) => a.haversineKm - b.haversineKm || a.user_id.localeCompare(b.user_id));

  const { pickupSeconds, source } = await estimateNearestPickupEta(
    { lat: pickupLat, lng: pickupLng },
    nearby,
  );

  return {
    pickupSeconds,
    driversAvailable: true,
    pickupEtaSource: source,
  };
}
