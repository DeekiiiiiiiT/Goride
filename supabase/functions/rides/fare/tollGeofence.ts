/**
 * Toll geofence evaluation for real-time toll detection during trips.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { distanceMeters } from "../../_shared/geo.ts";
import { loadTollPlazas, type LoadedTollPlaza } from "./tollPlazaLoader.ts";

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
): Promise<TollEvaluationResult> {
  const plazas = await loadTollPlazas(db);
  const tollsCrossed: TollCrossingRecord[] = [];
  let totalTollsMinor = 0;

  for (const plaza of plazas) {
    if (alreadyCrossed.has(plaza.id)) continue;

    const dist = distanceMeters(
      { lat: driverLat, lng: driverLng },
      plaza.location,
    );

    const effectiveRadius = Math.max(geofenceRadiusM, plaza.geofenceRadius);
    
    if (dist <= effectiveRadius) {
      tollsCrossed.push({
        toll_plaza_id: plaza.id,
        toll_plaza_name: plaza.name,
        toll_amount_minor: plaza.defaultRateMinor,
        currency: plaza.currency,
        driver_lat: driverLat,
        driver_lng: driverLng,
      });
      totalTollsMinor += plaza.defaultRateMinor;
    }
  }

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
