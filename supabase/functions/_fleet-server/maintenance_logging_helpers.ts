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

/** WO line total from qty/unit/labor (same rule as maintenance_routes). */
export function computeWoLineTotal(line: Record<string, unknown>): number {
  if (line.declined === true) return 0;
  // CR-01: legacy callers may send amounts only inside `values` (API) / `values_json` (DB row).
  const vRaw = line.values ?? line.values_json;
  const v = (vRaw && typeof vRaw === "object" && !Array.isArray(vRaw))
    ? (vRaw as Record<string, unknown>)
    : {};
  const qty = Number(line.qty ?? v.qty ?? 0) || 0;
  const unit = Number(line.unit_price ?? line.unitPrice ?? v.unit_price ?? 0) || 0;
  const material = Number(line.material ?? v.material ?? 0) || 0;
  let labor = Number(line.labor_amount ?? line.laborAmount ?? line.labor ?? v.labor ?? 0) || 0;
  const hours = Number(line.labor_hours ?? line.laborHours ?? v.labor_hours ?? 0) || 0;
  const rate = Number(line.labor_rate ?? line.laborRate ?? v.labor_rate ?? 0) || 0;
  if (hours > 0 && rate > 0) labor = hours * rate;
  if (line.complimentary === true) labor = 0;
  let total = 0;
  if (qty > 0 && unit > 0) total += qty * unit;
  else total += material;
  total += labor;
  return Math.round(total * 100) / 100;
}

export function parseDiscount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function lineSubtotal(lineRows: Record<string, unknown>[]): number {
  let sum = 0;
  for (const r of lineRows) {
    const lt = r.line_total != null ? Number(r.line_total) : computeWoLineTotal(r);
    sum += Number.isFinite(lt) ? lt : 0;
  }
  return Math.round(sum * 100) / 100;
}

export function serviceNetTotal(lineRows: Record<string, unknown>[], discount: number): number {
  const net = lineSubtotal(lineRows) - discount;
  return Math.round(Math.max(0, net) * 100) / 100;
}

export function discountTooLarge(lineRows: Record<string, unknown>[], discount: number): boolean {
  return discount > lineSubtotal(lineRows);
}

export async function loadDiscountEnabled(orgId: string): Promise<boolean> {
  const { data, error } = await fleetDb()
    // fleet schema is not exposed to PostgREST — read through the public view (R-03).
    .from("fleet_organization_settings")
    .select("maintenance_discount_enabled")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    // CR-07: never fail silently; still return off so Log service keeps working.
    console.error("[maintenance] loadDiscountEnabled failed", { orgId, error: error.message });
    return false;
  }
  const row = data as { maintenance_discount_enabled?: boolean } | null;
  return row?.maintenance_discount_enabled === true;
}

export function respondDiscountRejection(
  c: Context,
  parsed: number | null,
  enabled: boolean,
  lineRows: Record<string, unknown>[],
  discount: number,
): Response | null {
  if (parsed === null) {
    return c.json({ code: "discount_invalid" }, 400);
  }
  if (discount > 0 && !enabled) {
    return c.json({ code: "discount_disabled", error: "Discounts are switched off." }, 400);
  }
  if (discountTooLarge(lineRows, discount)) return discountTooLargeResponse(c);
  return null;
}

export function discountTooLargeResponse(c: Context): Response {
  return c.json({ code: "discount_too_large", error: "Discount can't be more than the bill." }, 400);
}

export type ServiceHistoryQueryFilters = {
  orgId: string;
  vehicle?: string;
  part?: string;
  from?: string;
  qText?: string;
};

export type ServiceHistorySlimRow = { work_order_id: string; performed_at_date: string };

/** Distinct work orders for service-history pagination (R-01). */
export function paginateServiceHistoryWorkOrders(
  slimRows: ServiceHistorySlimRow[],
  page: number,
  pageSize: number,
): { pageIds: string[]; total: number } {
  const byWo = new Map<string, string>();
  for (const row of slimRows) {
    const wo = String(row.work_order_id ?? "");
    if (!wo) continue;
    const d = String(row.performed_at_date ?? "");
    const prev = byWo.get(wo);
    if (!prev || d > prev) byWo.set(wo, d);
  }

  const sortedIds = [...byWo.entries()]
    .sort((a, b) => {
      const dc = b[1].localeCompare(a[1]);
      if (dc !== 0) return dc;
      return b[0].localeCompare(a[0]);
    })
    .map(([id]) => id);

  const total = sortedIds.length;
  const fromIdx = (page - 1) * pageSize;
  return { pageIds: sortedIds.slice(fromIdx, fromIdx + pageSize), total };
}

export function sortServiceHistoryLineRows(
  items: Record<string, unknown>[],
  pageIds: string[],
): Record<string, unknown>[] {
  const idOrder = new Map(pageIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const woA = String(a.work_order_id ?? "");
    const woB = String(b.work_order_id ?? "");
    const oa = idOrder.get(woA) ?? 999;
    const ob = idOrder.get(woB) ?? 999;
    if (oa !== ob) return oa - ob;
    const da = String(a.performed_at_date ?? "");
    const db = String(b.performed_at_date ?? "");
    if (da !== db) return db.localeCompare(da);
    return String(a.line_id ?? "").localeCompare(String(b.line_id ?? ""));
  });
}

// deno-lint-ignore no-explicit-any
function applyServiceHistoryFilters(q: any, filters: ServiceHistoryQueryFilters) {
  let query = q.eq("organization_id", filters.orgId);
  if (filters.vehicle) query = query.eq("vehicle_id", filters.vehicle);
  if (filters.part) {
    query = query.or(`category_code.ilike.%${filters.part}%,category_name.ilike.%${filters.part}%`);
  }
  if (filters.from) query = query.gte("performed_at_date", filters.from);
  if (filters.qText) {
    query = query.or(
      `log_number.ilike.%${filters.qText}%,provider.ilike.%${filters.qText}%,category_name.ilike.%${filters.qText}%`,
    );
  }
  return query;
}

/**
 * R-02 — the filters only choose which services are on the page. This query
 * returns EVERY active line of those services (org + work_order_id only), so
 * Σ lines − discount is the real total even when a part/search filter is set.
 */
// deno-lint-ignore no-explicit-any
export function applyServiceHistoryPageLinesQuery(q: any, orgId: string, pageIds: string[]) {
  return q
    .eq("organization_id", orgId)
    .in("work_order_id", pageIds)
    .order("performed_at_date", { ascending: false });
}

/** Page service history by work order — every line for each service on the page. */
export async function fetchMaintenanceServiceHistoryPage(
  filters: ServiceHistoryQueryFilters,
  page: number,
  pageSize: number,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const chunkSize = 1000;
  const slimRows: ServiceHistorySlimRow[] = [];
  let offset = 0;
  for (;;) {
    let q = applyServiceHistoryFilters(
      fleetDb().from("fleet_maintenance_service_history_v").select("work_order_id, performed_at_date"),
      filters,
    );
    // CR-05: unique tie-break so same-date rows are never skipped or repeated across chunks.
    q = q
      .order("performed_at_date", { ascending: false })
      .order("work_order_id", { ascending: true })
      .order("line_id", { ascending: true })
      .range(offset, offset + chunkSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []) as ServiceHistorySlimRow[];
    slimRows.push(...batch);
    if (batch.length < chunkSize) break;
    offset += chunkSize;
  }

  const { pageIds, total } = paginateServiceHistoryWorkOrders(slimRows, page, pageSize);

  if (pageIds.length === 0) {
    return { items: [], total };
  }

  const lineQ = applyServiceHistoryPageLinesQuery(
    fleetDb().from("fleet_maintenance_service_history_v").select("*"),
    filters.orgId,
    pageIds,
  );
  const { data: lines, error: lineErr } = await lineQ;
  if (lineErr) throw lineErr;

  const items = sortServiceHistoryLineRows((lines || []) as Record<string, unknown>[], pageIds);

  return { items, total };
}
