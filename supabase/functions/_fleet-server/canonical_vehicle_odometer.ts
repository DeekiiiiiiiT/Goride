/**
 * Canonical odometer (km) for maintenance — reads ledger MAX(hard, not voided).
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  canonicalOdometerFromMaps,
  parseNum,
  type OdometerSupplementMaps,
} from "../../../apps/fleet/src/utils/canonicalOdometerMath.ts";
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

/** Batch maps for schedule screens — ledger max per vehicle (hard + not voided). */
export async function loadOdometerSupplementMaps(
  _supabase: SupabaseClient,
  c: Context,
): Promise<OdometerSupplementMaps> {
  const orgId = getOrgId(c);
  let q = fleetDb()
    .from(fleetTable("odometer_readings"))
    .select("vehicle_id, reading")
    .eq("is_voided", false)
    .eq("is_hard", true)
    .gt("reading", 0);
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q.limit(20000);
  if (error) throw error;

  const manualMaxByVehicleId = new Map<string, number>();
  for (const row of data || []) {
    const vid = String((row as any).vehicle_id || "");
    if (!vid) continue;
    const odo = parseNum((row as any).reading);
    if (odo <= 0) continue;
    const prev = manualMaxByVehicleId.get(vid) ?? 0;
    if (odo > prev) manualMaxByVehicleId.set(vid, odo);
  }

  // Fuel map kept for API shape compatibility; ledger already includes fuel projections.
  return { manualMaxByVehicleId, fuelMaxByVehicleId: new Map() };
}
