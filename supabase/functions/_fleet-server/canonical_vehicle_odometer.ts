/**
 * Canonical odometer (km) for maintenance — reads ledger MAX(hard, not voided).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  canonicalOdometerFromMaps,
  parseNum,
  type OdometerSupplementMaps,
} from "../../../packages/finance-core/src/canonicalOdometerMath.ts";
import { getCurrentOdometer } from "./odometer_ledger.ts";
import { fleetDb, fleetTable } from "./repos/baseRepo.ts";
import { getOrgId } from "./org_scope.ts";

export type { OdometerSupplementMaps };
export { canonicalOdometerFromMaps };

export async function canonicalOdometerForVehicle(
  _supabase: SupabaseClient,
  vehicleId: string,
  metricsFallback: number,
  _c: Context,
): Promise<number> {
  const current = await getCurrentOdometer(vehicleId);
  if (current.km > 0) return current.km;
  return parseNum(metricsFallback);
}

/** Batch maps for schedule screens — latest trusted reading per vehicle (not max). */
export async function loadOdometerSupplementMaps(
  _supabase: SupabaseClient,
  c: Context,
): Promise<OdometerSupplementMaps> {
  const orgId = getOrgId(c);
  let q = fleetDb()
    .from("fleet_vehicle_current_odometer_v")
    .select("vehicle_id, reading")
    .gt("reading", 0);
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q.limit(20000);
  if (error) {
    // Fallback if migration not applied yet
    let fq = fleetDb()
      .from(fleetTable("odometer_readings"))
      .select("vehicle_id, reading, recorded_at")
      .eq("is_voided", false)
      .eq("is_anomaly", false)
      .gt("reading", 0);
    if (orgId) fq = fq.eq("organization_id", orgId);
    const fb = await fq.order("recorded_at", { ascending: false }).limit(20000);
    if (fb.error) throw fb.error;
    const manualMaxByVehicleId = new Map<string, number>();
    for (const row of fb.data || []) {
      const vid = String((row as any).vehicle_id || "");
      if (!vid || manualMaxByVehicleId.has(vid)) continue;
      manualMaxByVehicleId.set(vid, parseNum((row as any).reading));
    }
    return { manualMaxByVehicleId, fuelMaxByVehicleId: new Map() };
  }

  const manualMaxByVehicleId = new Map<string, number>();
  for (const row of data || []) {
    const vid = String((row as any).vehicle_id || "");
    if (!vid) continue;
    const odo = parseNum((row as any).reading);
    if (odo <= 0) continue;
    manualMaxByVehicleId.set(vid, odo);
  }

  return { manualMaxByVehicleId, fuelMaxByVehicleId: new Map() };
}
