import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estimateNearestPickupEta } from "./distanceMatrix.ts";
import {
  DEFAULT_DISPATCH_SETTINGS,
  driverLocationMaxAgeMs,
  type DispatchSettings,
} from "./dispatchSettings.ts";
import { haversineKm } from "./routing.ts";

/** Fallback when settings are not loaded. */
export const DRIVER_LOCATION_MAX_AGE_MS =
  DEFAULT_DISPATCH_SETTINGS.driver_location_max_age_minutes * 60 * 1000;

/** Fallback when settings are not loaded. */
export const QUOTE_DRIVER_RADIUS_KM = DEFAULT_DISPATCH_SETTINGS.quote_driver_radius_km;

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
  opts?: {
    allowedBodyTypeSlugs?: Set<string>;
    dispatchSettings?: DispatchSettings;
  },
): Promise<ResolvedPickupEta> {
  const settings = opts?.dispatchSettings ?? DEFAULT_DISPATCH_SETTINGS;
  const maxAgeMs = driverLocationMaxAgeMs(settings);
  const quoteRadiusKm = settings.quote_driver_radius_km;
  const freshSince = new Date(Date.now() - maxAgeMs).toISOString();
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
    if (km <= quoteRadiusKm) {
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
