/**
 * Canonical odometer (km) for maintenance: max of vehicle.metrics.odometer,
 * manual odometer_reading KV rows, and fuel_entry odometers (same intent as client unified history).
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { filterByOrg } from "./org_scope.ts";
import {
  canonicalOdometerFromMaps,
  parseNum,
  type OdometerSupplementMaps,
} from "../../../utils/canonicalOdometerMath.ts";

const KV_TABLE = "kv_store_37f42386";

export type { OdometerSupplementMaps };
export { canonicalOdometerFromMaps };

async function maxManualOdometerForVehicle(
  supabase: SupabaseClient,
  vehicleId: string,
  c: Context,
): Promise<number> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select("value")
    .like("key", `odometer_reading:${vehicleId}:`);
  if (error) throw error;
  const vals = (data || [])
    .map((r: { value: unknown }) => r.value as Record<string, unknown>)
    .filter(Boolean);
  const scoped = filterByOrg(vals, c);
  let max = 0;
  for (const r of scoped) {
    const v = parseNum(r.value);
    if (v > max) max = v;
  }
  return max;
}

async function maxFuelOdometerForVehicle(
  supabase: SupabaseClient,
  vehicleId: string,
  c: Context,
): Promise<number> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId);
  if (error) throw error;
  const vals = (data || [])
    .map((r: { value: unknown }) => r.value as Record<string, unknown>)
    .filter(Boolean);
  const scoped = filterByOrg(vals, c);
  let max = 0;
  for (const r of scoped) {
    const v = parseNum(r.odometer);
    if (v > max) max = v;
  }
  return max;
}

export async function canonicalOdometerForVehicle(
  supabase: SupabaseClient,
  vehicleId: string,
  metricsFallback: number,
  c: Context,
): Promise<number> {
  const base = parseNum(metricsFallback);
  const [manualM, fuelM] = await Promise.all([
    maxManualOdometerForVehicle(supabase, vehicleId, c),
    maxFuelOdometerForVehicle(supabase, vehicleId, c),
  ]);
  return Math.max(base, manualM, fuelM);
}

export async function loadOdometerSupplementMaps(
  supabase: SupabaseClient,
  c: Context,
): Promise<OdometerSupplementMaps> {
  const [readRes, fuelRes] = await Promise.all([
    supabase.from(KV_TABLE).select("key, value").like("key", "odometer_reading:%"),
    supabase.from(KV_TABLE).select("value").like("key", "fuel_entry:%"),
  ]);
  if (readRes.error) throw readRes.error;
  if (fuelRes.error) throw fuelRes.error;

  const manualMaxByVehicleId = new Map<string, number>();
  for (const row of readRes.data || []) {
    const key = String((row as { key?: string }).key ?? "");
    const parts = key.split(":");
    if (parts.length < 3 || parts[0] !== "odometer_reading") continue;
    const vid = parts[1];
    const val = (row as { value: unknown }).value as Record<string, unknown> | null;
    if (!val || typeof val !== "object") continue;
    if (!filterByOrg([val], c).length) continue;
    const odo = parseNum(val.value);
    if (odo <= 0) continue;
    const prev = manualMaxByVehicleId.get(vid) ?? 0;
    if (odo > prev) manualMaxByVehicleId.set(vid, odo);
  }

  const fuelMaxByVehicleId = new Map<string, number>();
  for (const row of fuelRes.data || []) {
    const val = (row as { value: unknown }).value as Record<string, unknown> | null;
    if (!val || typeof val !== "object") continue;
    if (!filterByOrg([val], c).length) continue;
    const vid = String(val.vehicleId ?? "");
    if (!vid) continue;
    const odo = parseNum(val.odometer);
    if (odo <= 0) continue;
    const prev = fuelMaxByVehicleId.get(vid) ?? 0;
    if (odo > prev) fuelMaxByVehicleId.set(vid, odo);
  }

  return { manualMaxByVehicleId, fuelMaxByVehicleId };
}
