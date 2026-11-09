/**
 * Maintenance logging — shared DB reads and validation (audit L-01…L-15).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  interpolateExpectedOdometer,
  maintenanceServiceRecordedAt,
} from "../../../packages/finance-core/src/maintenanceOdometerExpected.ts";
import { fleetDb, fleetTable } from "./repos/baseRepo.ts";
import { getOrgId } from "./org_scope.ts";

export { maintenanceServiceRecordedAt };

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
  vin?: string | null;
  vehicle_catalog_id?: string | null;
  severe_duty?: boolean | null;
};

export async function loadFleetVehicleForOrg(
  orgId: string,
  vehicleId: string,
): Promise<FleetVehicleRow | null> {
  const { data, error } = await fleetDb()
    .from("fleet_vehicles")
    .select("id, organization_id, license_plate, make, model, year, fleet_unit_id, home_base, vin, vehicle_catalog_id, severe_duty")
    .eq("organization_id", orgId)
    .eq("id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  return (data as FleetVehicleRow | null) ?? null;
}

export async function loadFleetVehiclesForOrg(orgId: string): Promise<FleetVehicleRow[]> {
  const { data, error } = await fleetDb()
    .from("fleet_vehicles")
    .select("id, organization_id, license_plate, make, model, year, fleet_unit_id, home_base, vin, vehicle_catalog_id, severe_duty")
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
  if (error) throw new Error(`recompute_maintenance_schedule: ${error.message}`);
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
  if (error) throw new Error(`maintenance_events insert: ${error.message}`);
}

export type OdometerAnomalyAssessment = {
  isAnomaly: boolean;
  anomalyReason: string | null;
  priorReading: number | null;
  priorRecordedAt: string | null;
  nextReading: number | null;
  nextRecordedAt: string | null;
};

export async function assessOdometerAnomaly(
  supabase: SupabaseClient,
  vehicleId: string,
  reading: number,
  recordedAt: string,
): Promise<OdometerAnomalyAssessment> {
  const { data, error } = await supabase.rpc("fleet_assess_odometer_anomaly", {
    p_vehicle_id: vehicleId,
    p_reading: reading,
    p_recorded_at: recordedAt,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const r = (row || {}) as Record<string, unknown>;
  return {
    isAnomaly: r.is_anomaly === true,
    anomalyReason: r.anomaly_reason != null ? String(r.anomaly_reason) : null,
    priorReading: r.prior_reading != null ? Number(r.prior_reading) : null,
    priorRecordedAt: r.prior_recorded_at != null ? String(r.prior_recorded_at) : null,
    nextReading: r.next_reading != null ? Number(r.next_reading) : null,
    nextRecordedAt: r.next_recorded_at != null ? String(r.next_recorded_at) : null,
  };
}

export async function insertMaintenanceAuditLog(
  supabase: SupabaseClient,
  row: {
    organizationId: string;
    entityType: string;
    entityId: string;
    actorId?: string | null;
    reason?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("fleet_maintenance_audit_log").insert({
    organization_id: row.organizationId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    actor_id: row.actorId ?? null,
    reason: row.reason ?? null,
    before_json: row.before ?? {},
    after_json: row.after ?? {},
  });
  if (error) throw new Error(`maintenance_audit_log insert: ${error.message}`);
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

/** Idempotency replay for completeNow (R-01). */
export function idempotentCompleteNowAction(
  existing: { status?: string | null } | null | undefined,
): "return_completed" | "complete_in_progress" | null {
  if (!existing?.status) return null;
  const st = String(existing.status);
  if (st === "completed") return "return_completed";
  if (st === "in_progress") return "complete_in_progress";
  return null;
}

export type OdometerReadingNeighbor = {
  reading: number;
  recordedAt: string;
  sourceLabel: string;
};

async function loadNeighborReading(
  vehicleId: string,
  orgId: string,
  reading: number | null,
  recordedAt: string | null,
): Promise<OdometerReadingNeighbor | null> {
  if (reading == null || !recordedAt) return null;
  const { data } = await fleetDb()
    .from(fleetTable("odometer_readings"))
    .select("reading, recorded_at, source")
    .eq("vehicle_id", vehicleId)
    .eq("organization_id", orgId)
    .eq("is_voided", false)
    .eq("reading", reading)
    .eq("recorded_at", recordedAt)
    .maybeSingle();
  if (!data) {
    return {
      reading,
      recordedAt,
      sourceLabel: "reading",
    };
  }
  const row = data as Record<string, unknown>;
  return {
    reading: Number(row.reading) || reading,
    recordedAt: String(row.recorded_at ?? recordedAt),
    sourceLabel: formatOdometerSourceLabel(String(row.source ?? "manual")),
  };
}

export async function checkMaintenanceOdometerReading(args: {
  supabase: SupabaseClient;
  orgId: string;
  vehicleId: string;
  serviceDateYmd: string;
  reading: number;
}): Promise<{
  expected: number | null;
  before: OdometerReadingNeighbor | null;
  after: OdometerReadingNeighbor | null;
  isAnomaly: boolean;
  anomalyReason: string | null;
}> {
  const recordedAt = maintenanceServiceRecordedAt(args.serviceDateYmd);
  const assessment = await assessOdometerAnomaly(
    args.supabase,
    args.vehicleId,
    args.reading,
    recordedAt,
  );
  const expected = interpolateExpectedOdometer({
    serviceDateYmd: args.serviceDateYmd,
    priorReading: assessment.priorReading,
    priorRecordedAt: assessment.priorRecordedAt,
    nextReading: assessment.nextReading,
    nextRecordedAt: assessment.nextRecordedAt,
  });
  const [before, after] = await Promise.all([
    loadNeighborReading(
      args.vehicleId,
      args.orgId,
      assessment.priorReading,
      assessment.priorRecordedAt,
    ),
    loadNeighborReading(
      args.vehicleId,
      args.orgId,
      assessment.nextReading,
      assessment.nextRecordedAt,
    ),
  ]);
  return {
    expected,
    before,
    after,
    isAnomaly: assessment.isAnomaly,
    anomalyReason: assessment.anomalyReason,
  };
}
