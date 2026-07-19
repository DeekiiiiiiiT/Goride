import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { estimateNearestPickupEta } from "./distanceMatrix.ts";
import {
  DEFAULT_DISPATCH_SETTINGS,
  driverLocationMaxAgeMs,
  type DispatchSettings,
} from "./dispatchSettings.ts";
import { haversineKm } from "./routing.ts";
import { getEligibleDriverUserIds } from "../../_shared/driverModeFilter.ts";
import {
  DEFAULT_H3_RESOLUTION,
  h3Disk,
  kRingForRadiusKm,
} from "../../_shared/h3/geoIndex.ts";

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

async function loadNearbyDriverLocations(
  db: SupabaseClient,
  pickupLat: number,
  pickupLng: number,
  quoteRadiusKm: number,
  freshSince: string,
): Promise<Record<string, unknown>[]> {
  const locSelects = [
    "user_id, lat, lng, updated_at, body_type_slug",
    "user_id, lat, lng, updated_at",
  ];
  const pub = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Prefer H3-bounded RPC (idx_driver_locations_h3_available) over nationwide scan
  const k = kRingForRadiusKm(quoteRadiusKm, DEFAULT_H3_RESOLUTION);
  const cells = h3Disk(pickupLat, pickupLng, k, DEFAULT_H3_RESOLUTION);
  if (cells.length > 0) {
    const { data: rpcData, error: rpcError } = await pub.rpc("rides_drivers_in_h3_cells", {
      p_h3_cells: cells,
      p_fresh_since: freshSince,
    });
    if (!rpcError && Array.isArray(rpcData)) {
      return rpcData as Record<string, unknown>[];
    }
  }

  // Legacy fallback if H3 cells empty or RPC unavailable
  for (const locSelect of locSelects) {
    const { data: nativeLocs, error: nativeErr } = await db
      .from("driver_locations")
      .select(locSelect)
      .gte("updated_at", freshSince)
      .eq("available_for_rides", true);
    if (!nativeErr && nativeLocs?.length) {
      return nativeLocs as Record<string, unknown>[];
    }
    const { data: pubLocs, error: pubErr } = await pub
      .from("rides_driver_locations")
      .select(locSelect)
      .gte("updated_at", freshSince)
      .eq("available_for_rides", true);
    if (!pubErr && pubLocs?.length) {
      return pubLocs as Record<string, unknown>[];
    }
    if (!nativeErr && nativeLocs) return nativeLocs as Record<string, unknown>[];
    if (!pubErr && pubLocs) return pubLocs as Record<string, unknown>[];
  }
  return [];
}

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

  const locs = await loadNearbyDriverLocations(
    db,
    pickupLat,
    pickupLng,
    quoteRadiusKm,
    freshSince,
  );

  type DriverRow = { user_id: string; lat: number; lng: number; haversineKm: number };
  const nearby: DriverRow[] = [];

  const allowed = opts?.allowedBodyTypeSlugs;
  const candidateUserIds: string[] = [];
  for (const row of locs ?? []) {
    candidateUserIds.push(row.user_id as string);
  }
  const eligibleIds = await getEligibleDriverUserIds(candidateUserIds, settings);

  for (const row of locs ?? []) {
    const uid = row.user_id as string;
    if (!eligibleIds.has(uid)) continue;
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
