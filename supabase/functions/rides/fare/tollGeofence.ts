/**
 * Toll geofence evaluation for real-time toll detection during trips.
 * Matching logic lives in `_shared/tollGeofenceCore` (segment + direction + verified).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateLiveFixAgainstPlazas,
  ROUND_TRIP_COOLDOWN_MS,
  type TollPlazaGeo,
} from "../../_shared/tollGeofenceCore.ts";
import type { LatLng } from "../../_shared/geo.ts";
import { loadTollPlazas, type LoadedTollPlaza } from "./tollPlazaLoader.ts";

export { ROUND_TRIP_COOLDOWN_MS };

export interface TollCrossingRecord {
  toll_plaza_id: string;
  toll_plaza_name: string;
  toll_amount_minor: number;
  currency: string;
  driver_lat: number;
  driver_lng: number;
}

export interface TollEvaluationResult {
  tollsCrossed: TollCrossingRecord[];
  totalTollsMinor: number;
}

export interface TollCrossingState {
  crossedTolls: Set<string>;
}

export interface EvaluateTollOptions {
  /**
   * Last crossing time (epoch ms) per plaza id. When provided, a plaza is
   * re-counted only if the last crossing was longer ago than `cooldownMs`,
   * which allows genuine round trips while preventing dwell double-counting.
   * When omitted, the legacy once-per-ride `alreadyCrossed` set is used.
   */
  recentByPlaza?: Map<string, number>;
  /** Override round-trip cooldown (default ROUND_TRIP_COOLDOWN_MS / Toll Brain policy). */
  cooldownMs?: number;
  /** Current time (epoch ms). Passed in for testability. */
  nowMs?: number;
  /**
   * Previous GPS fix — enables segment-to-circle matching so highway-speed
   * vehicles cannot skip a geofence between pings. When omitted, falls back
   * to point-in-circle on the current fix only.
   */
  prevLatLng?: LatLng | null;
  /** Fleet org for plaza catalogue scoping (legacy filterByOrg semantics). */
  organizationId?: string | null;
}

function toPlazaGeo(p: LoadedTollPlaza): TollPlazaGeo {
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    geofenceRadius: p.geofenceRadius,
    defaultRateMinor: p.defaultRateMinor,
    currency: p.currency,
    direction: p.direction,
    verificationStatus: p.verificationStatus,
  };
}

/**
 * Evaluate driver location against toll plaza geofences.
 * Returns any new toll crossings detected.
 */
export async function evaluateTollCrossings(
  db: SupabaseClient,
  driverLat: number,
  driverLng: number,
  geofenceRadiusM: number,
  alreadyCrossed: Set<string>,
  options?: EvaluateTollOptions,
): Promise<TollEvaluationResult> {
  const plazas = await loadTollPlazas(db, {
    organizationId: options?.organizationId,
  });
  const geoPlazas = plazas.map(toPlazaGeo);
  const cooldownMs = options?.cooldownMs ?? ROUND_TRIP_COOLDOWN_MS;
  const nowMs = options?.nowMs ?? Date.now();
  const curr = { lat: driverLat, lng: driverLng };
  const prev = options?.prevLatLng ?? null;

  const hits = evaluateLiveFixAgainstPlazas(prev, curr, geoPlazas, {
    fallbackRadiusM: geofenceRadiusM,
    requireVerified: true,
    enforceDirection: true,
    recentByPlaza: options?.recentByPlaza,
    cooldownMs,
    nowMs,
    alreadyCrossed,
  });

  const tollsCrossed: TollCrossingRecord[] = hits.map((h) => ({
    toll_plaza_id: h.plazaId,
    toll_plaza_name: h.plazaName,
    toll_amount_minor: h.tollAmountMinor,
    currency: h.currency,
    driver_lat: h.lat,
    driver_lng: h.lng,
  }));
  const totalTollsMinor = tollsCrossed.reduce((s, c) => s + c.toll_amount_minor, 0);

  return { tollsCrossed, totalTollsMinor };
}

/**
 * Record toll crossings for a ride.
 */
export async function recordTollCrossings(
  db: SupabaseClient,
  rideId: string,
  crossings: TollCrossingRecord[],
): Promise<{ recorded: number; total: number }> {
  if (crossings.length === 0) {
    return { recorded: 0, total: 0 };
  }

  let recorded = 0;
  let total = 0;

  for (const crossing of crossings) {
    const { error } = await db.from("ride_toll_crossings").insert({
      ride_request_id: rideId,
      toll_plaza_id: crossing.toll_plaza_id,
      toll_plaza_name: crossing.toll_plaza_name,
      toll_amount_minor: crossing.toll_amount_minor,
      currency: crossing.currency,
      driver_lat: crossing.driver_lat,
      driver_lng: crossing.driver_lng,
    });

    if (!error) {
      recorded++;
      total += crossing.toll_amount_minor;
    } else {
      console.error("[tollGeofence] Failed to record crossing:", error.message);
    }
  }

  return { recorded, total };
}

/**
 * Get total tolls for a ride from recorded crossings.
 */
export async function getTotalTollsForRide(
  db: SupabaseClient,
  rideId: string,
): Promise<{ totalMinor: number; crossings: TollCrossingRecord[] }> {
  const { data, error } = await db
    .from("ride_toll_crossings")
    .select("toll_plaza_id, toll_plaza_name, toll_amount_minor, currency, driver_lat, driver_lng")
    .eq("ride_request_id", rideId);

  if (error || !data) {
    return { totalMinor: 0, crossings: [] };
  }

  const crossings: TollCrossingRecord[] = data.map((row) => ({
    toll_plaza_id: row.toll_plaza_id,
    toll_plaza_name: row.toll_plaza_name,
    toll_amount_minor: Number(row.toll_amount_minor),
    currency: row.currency,
    driver_lat: Number(row.driver_lat),
    driver_lng: Number(row.driver_lng),
  }));

  const totalMinor = crossings.reduce((sum, c) => sum + c.toll_amount_minor, 0);

  return { totalMinor, crossings };
}

/**
 * Load already crossed toll IDs for a ride.
 */
export async function loadCrossedTollIds(
  db: SupabaseClient,
  rideId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("ride_toll_crossings")
    .select("toll_plaza_id")
    .eq("ride_request_id", rideId);

  if (error || !data) {
    return new Set();
  }

  return new Set(data.map((row) => row.toll_plaza_id));
}

/**
 * Load the most recent crossing time (epoch ms) per plaza for a ride.
 * Used for cooldown-based de-dup so genuine round trips are counted while
 * dwell within a geofence is not double-counted.
 */
export async function loadRecentlyCrossedAt(
  db: SupabaseClient,
  rideId: string,
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("ride_toll_crossings")
    .select("toll_plaza_id, crossed_at")
    .eq("ride_request_id", rideId);

  const map = new Map<string, number>();
  if (error || !data) return map;

  for (const row of data) {
    const t = row.crossed_at ? Date.parse(String(row.crossed_at)) : NaN;
    if (!isNaN(t)) {
      const prev = map.get(row.toll_plaza_id);
      if (prev === undefined || t > prev) map.set(row.toll_plaza_id, t);
    }
  }
  return map;
}
