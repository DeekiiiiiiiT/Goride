/**
 * Maintenance logging — shared DB reads and validation (audit L-01…L-15).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fleetDb } from "./repos/baseRepo.ts";
import { getOrgId } from "./org_scope.ts";

export type OdometerRequiredError = { code: "odometer_required" };

export function parseRequiredOdometer(
  body: Record<string, unknown>,
): number | OdometerRequiredError {
  const raw = body.odometer ?? body.odo ?? body.performed_at_miles;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { code: "odometer_required" };
  return n;
}

export function odometerRequiredResponse(c: Context) {
  return c.json({ error: "Odometer is required and must be greater than zero", code: "odometer_required" }, 400);
}

export type TrustedOdometerRow = {
  vehicleId: string;
  reading: number;
  recordedAt: string;
  source: string;
  readingDate: string | null;
};

export async function loadTrustedOdometerMap(
  orgId: string | null,
): Promise<Map<string, TrustedOdometerRow>> {
  let q = fleetDb()
    .from("fleet_vehicle_current_odometer_v")
    .select("vehicle_id, reading, recorded_at, source, reading_date, organization_id");
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  const map = new Map<string, TrustedOdometerRow>();
  for (const row of data || []) {
    const vid = String((row as Record<string, unknown>).vehicle_id ?? "");
    if (!vid) continue;
    map.set(vid, {
      vehicleId: vid,
      reading: Number((row as Record<string, unknown>).reading) || 0,
      recordedAt: String((row as Record<string, unknown>).recorded_at ?? ""),
      source: String((row as Record<string, unknown>).source ?? "manual"),
      readingDate: (row as Record<string, unknown>).reading_date != null
        ? String((row as Record<string, unknown>).reading_date).slice(0, 10)
        : null,
    });
  }
  return map;
}

export function formatOdometerSourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("fuel")) return "fuel fill log";
  if (s.includes("check")) return "check-in";
  if (s.includes("service") || s.includes("maintenance")) return "service log";
  return "manual entry";
}

export type FleetVehicleRow = {
  id: string;
  organization_id: string;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  fleet_unit_id?: string | null;
  home_base?: string | null;
};

export async function loadFleetVehiclesForOrg(orgId: string): Promise<FleetVehicleRow[]> {
  const { data, error } = await fleetDb()
    .from("fleet_vehicles")
    .select("id, organization_id, license_plate, make, model, year, fleet_unit_id, home_base")
    .eq("organization_id", orgId)
    .limit(500);
  if (error) throw error;
  return (data || []) as FleetVehicleRow[];
}

export async function loadOrgDueSoonSettings(orgId: string): Promise<{ dueSoonKm: number; dueSoonDays: number }> {
  const { data } = await fleetDb()
    .from("fleet_organization_settings")
    .select("due_soon_km, due_soon_days, payload_json")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  return {
    dueSoonKm: Number(row?.due_soon_km) > 0 ? Number(row?.due_soon_km) : 1000,
    dueSoonDays: Number(row?.due_soon_days) > 0 ? Number(row?.due_soon_days) : 14,
  };
}

export async function loadLatestMaintenanceJobRun(orgId: string) {
  const { data } = await fleetDb()
    .from("fleet_maintenance_job_runs")
    .select("*")
    .or(`organization_id.eq.${orgId},organization_id.is.null`)
    .eq("success", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function reserveMaintenanceLogNumber(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("next_maintenance_log_number");
  if (error) throw error;
  return String(data ?? "");
}

export async function recomputeScheduleForVehicle(
  supabase: SupabaseClient,
  vehicleId: string,
): Promise<void> {
  const { error } = await supabase.rpc("recompute_maintenance_schedule", {
    p_vehicle_id: vehicleId,
  });
  if (error) console.warn("[maintenance] recompute_maintenance_schedule:", error.message);
}

export async function insertMaintenanceEvent(
  supabase: SupabaseClient,
  row: {
    organizationId: string;
    vehicleId: string;
    type: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("fleet_maintenance_events").insert({
    organization_id: row.organizationId,
    vehicle_id: row.vehicleId,
    type: row.type,
    payload: row.payload ?? {},
  });
  if (error) console.warn("[maintenance] maintenance_events insert:", error.message);
}

export async function findWorkOrderByIdempotency(
  supabase: SupabaseClient,
  orgId: string,
  idempotencyKey: string,
) {
  const { data } = await supabase
    .from("maintenance_work_orders")
    .select("*")
    .eq("organization_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return data;
}
