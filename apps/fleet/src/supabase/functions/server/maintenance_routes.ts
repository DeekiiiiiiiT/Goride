/**
 * Maintenance schedule API (Postgres) — templates, per-vehicle schedule, records.
 * Registered from index.tsx with service-role Supabase client.
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import {
  analyzeComponentRowStatus,
  backfillServiceLedgerForOrg,
  bootstrapVehicleComponentSchedules,
  getPackageChecklist,
  maybeAdvancePackageSchedule,
  recordCompletedServiceLines,
  type LedgerLineInput,
} from "./maintenance_service_ledger_core.ts";
import {
  canonicalOdometerForVehicle,
  canonicalOdometerFromMaps,
  loadOdometerSupplementMaps,
} from "./canonical_vehicle_odometer.ts";
import {
  analyzeMaintenanceScheduleRow,
  FLEET_SERVICES_ATTENTION_CAP,
  sortFleetServiceAttention,
  type FleetServiceAttentionItem,
} from "../../../utils/maintenanceOverdueDetails.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";
import { executeMaintenanceBootstrap } from "./maintenance_bootstrap_core.ts";
import { requireCatalogMatched } from "./vehicle_catalog_gate.ts";
import {
  appendCanonicalMaintenanceIfEligible,
} from "./canonical_from_ops.ts";
import { deleteCanonicalLedgerBySource } from "./ledger_canonical.ts";
import { isMaintenanceLedgerEligible } from "../../../utils/canonicalMaintenanceLedger.ts";

// Wave 5: DRY — use shared assertPlatformStaffResponse from rbac_middleware
const assertVehicleCatalogPlatformAccess = assertPlatformStaffResponse;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function aggregateFleetStatus(
  rows: Array<{ status: "ok" | "pending" | "overdue" | "fulfilled" }>,
): "Healthy" | "Due Soon" | "Overdue" {
  const relevant = rows.filter((r) => r.status !== "fulfilled");
  if (relevant.some((r) => r.status === "overdue")) return "Overdue";
  if (relevant.some((r) => r.status === "pending")) return "Due Soon";
  return "Healthy";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parseTaskCode(body: Record<string, unknown>): string | null {
  if (body.task_code === undefined || body.task_code === null) return null;
  const s = String(body.task_code).trim();
  return s.length ? s.slice(0, 120) : null;
}

function parseOptionalNumberField(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Returns error message or null if OK. */
function assertIntervalMilesRange(miles: number | null, milesMax: number | null): string | null {
  if (milesMax == null) return null;
  if (miles == null) return "interval_miles is required when interval_miles_max is set";
  if (milesMax < miles) return "interval_miles_max must be greater than or equal to interval_miles";
  return null;
}

function parseFieldSchema(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.fields)) return o;
  }
  return {
    fields: [
      { key: "material", type: "number", label: "Parts / materials", required: false },
      { key: "labor", type: "number", label: "Labor", required: false },
    ],
  };
}

function sumLogLines(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  let total = 0;
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const values = (line.values && typeof line.values === "object")
      ? (line.values as Record<string, unknown>)
      : {};
    const qty = Number(line.qty ?? values.qty ?? 0) || 0;
    const unit = Number(line.unitPrice ?? values.unit_price ?? 0) || 0;
    const material = Number(line.material ?? values.material ?? 0) || 0;
    let labor = Number(line.labor ?? line.laborAmount ?? values.labor ?? 0) || 0;
    const hours = Number(line.laborHours ?? values.labor_hours ?? 0) || 0;
    const rate = Number(line.laborRate ?? values.labor_rate ?? 0) || 0;
    if (hours > 0 && rate > 0) labor = hours * rate;
    if (line.complimentary === true) labor = 0;
    if (line.declined === true) continue;
    if (qty > 0 && unit > 0) total += qty * unit;
    else total += material;
    total += labor;
  }
  return Math.round(total * 100) / 100;
}

function parseCategoryKind(v: unknown): "system" | "component" | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s === "system" || s === "component") return s;
  return null;
}

function parseOptionalUuidField(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const s = String(v).trim();
  if (!isUuid(s)) return { ok: false };
  return { ok: true, value: s };
}

/** Returns error message or null if OK. */
function assertCategoryKindParent(
  kind: "system" | "component",
  parentId: string | null,
): string | null {
  if (kind === "component" && !parentId) return "parent_id is required when kind is component";
  if (kind === "system" && parentId != null) return "parent_id must be null when kind is system";
  return null;
}

function parseDueKind(v: unknown): "service_package" | "statutory_inspection" | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s === "service_package" || s === "statutory_inspection") return s;
  return null;
}

const WO_LINE_ACTIONS = new Set([
  "inspect", "replace", "rotate", "balance", "flush", "top_up", "repair", "other",
]);

function computeWoLineTotal(line: Record<string, unknown>): number {
  if (line.declined === true) return 0;
  const qty = Number(line.qty ?? 0) || 0;
  const unit = Number(line.unit_price ?? line.unitPrice ?? 0) || 0;
  const material = Number(line.material ?? 0) || 0;
  let labor = Number(line.labor_amount ?? line.laborAmount ?? line.labor ?? 0) || 0;
  const hours = Number(line.labor_hours ?? line.laborHours ?? 0) || 0;
  const rate = Number(line.labor_rate ?? line.laborRate ?? 0) || 0;
  if (hours > 0 && rate > 0) labor = hours * rate;
  if (line.complimentary === true) labor = 0;
  let total = 0;
  if (qty > 0 && unit > 0) total += qty * unit;
  else total += material;
  total += labor;
  return Math.round(total * 100) / 100;
}

/** camelCase API line → snake_case DB row for maintenance_work_order_lines. */
function mapApiLineToDb(
  raw: Record<string, unknown>,
  sortOrder: number,
  workOrderId?: string,
): Record<string, unknown> {
  const valuesRaw = raw.values ?? raw.values_json;
  const values = (valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw))
    ? valuesRaw
    : null;
  const componentParsed = parseOptionalUuidField(
    raw.componentId ?? raw.component_id ?? raw.categoryId ?? raw.category_id,
  );
  const systemParsed = parseOptionalUuidField(raw.systemId ?? raw.system_id);
  const partParsed = parseOptionalUuidField(raw.partId ?? raw.part_id);
  let action = String(raw.action ?? "replace").trim();
  if (!WO_LINE_ACTIONS.has(action)) action = "other";

  const row: Record<string, unknown> = {
    sort_order: raw.sortOrder != null ? Number(raw.sortOrder) : (raw.sort_order != null ? Number(raw.sort_order) : sortOrder),
    system_id: systemParsed.ok ? systemParsed.value : null,
    component_id: componentParsed.ok ? componentParsed.value : null,
    system_code: raw.systemCode != null
      ? String(raw.systemCode)
      : (raw.system_code != null ? String(raw.system_code) : null),
    system_name: raw.systemName != null
      ? String(raw.systemName)
      : (raw.system_name != null ? String(raw.system_name) : null),
    component_code: raw.componentCode != null
      ? String(raw.componentCode)
      : (raw.categoryCode != null
        ? String(raw.categoryCode)
        : (raw.component_code != null ? String(raw.component_code) : null)),
    component_name: raw.componentName != null
      ? String(raw.componentName)
      : (raw.categoryName != null
        ? String(raw.categoryName)
        : (raw.component_name != null ? String(raw.component_name) : null)),
    action,
    qty: parseOptionalNumberField(raw.qty),
    unit_price: parseOptionalNumberField(raw.unitPrice ?? raw.unit_price),
    material: parseOptionalNumberField(raw.material),
    labor_amount: parseOptionalNumberField(raw.laborAmount ?? raw.labor_amount ?? raw.labor),
    labor_hours: parseOptionalNumberField(raw.laborHours ?? raw.labor_hours),
    labor_rate: parseOptionalNumberField(raw.laborRate ?? raw.labor_rate),
    condition: raw.condition != null ? String(raw.condition) : null,
    positions: Array.isArray(raw.positions) ? raw.positions.map(String) : null,
    brand: raw.brand != null ? String(raw.brand) : null,
    part_number: raw.partNumber != null
      ? String(raw.partNumber)
      : (raw.part_number != null ? String(raw.part_number) : null),
    warranty: raw.warranty === true,
    complimentary: raw.complimentary === true,
    part_id: partParsed.ok ? partParsed.value : null,
    notes: raw.notes != null ? String(raw.notes) : null,
    recommended: raw.recommended === true,
    declined: raw.declined === true,
    values_json: values,
  };
  row.line_total = computeWoLineTotal(row);
  if (workOrderId) row.work_order_id = workOrderId;
  if (raw.id != null && isUuid(String(raw.id))) row.id = String(raw.id);
  return row;
}

/** snake_case DB line → camelCase API. */
function mapDbLineToApi(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    systemId: row.system_id,
    componentId: row.component_id,
    systemCode: row.system_code,
    systemName: row.system_name,
    categoryId: row.component_id,
    categoryCode: row.component_code,
    categoryName: row.component_name,
    componentCode: row.component_code,
    componentName: row.component_name,
    action: row.action,
    qty: row.qty != null ? Number(row.qty) : undefined,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : undefined,
    material: row.material != null ? Number(row.material) : undefined,
    labor: row.labor_amount != null ? Number(row.labor_amount) : undefined,
    laborAmount: row.labor_amount != null ? Number(row.labor_amount) : undefined,
    laborHours: row.labor_hours != null ? Number(row.labor_hours) : undefined,
    laborRate: row.labor_rate != null ? Number(row.labor_rate) : undefined,
    condition: row.condition,
    positions: row.positions,
    brand: row.brand,
    partNumber: row.part_number,
    warranty: row.warranty === true,
    complimentary: row.complimentary === true,
    partId: row.part_id,
    notes: row.notes,
    recommended: row.recommended === true,
    declined: row.declined === true,
    values: row.values_json,
    lineTotal: row.line_total != null ? Number(row.line_total) : undefined,
  };
}

function apiLinesToLedgerInputs(lines: unknown[]): LedgerLineInput[] {
  const out: LedgerLineInput[] = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const catId = r.categoryId ?? r.category_id ?? r.componentId ?? r.component_id;
    out.push({
      categoryId: catId != null ? String(catId) : null,
      categoryCode: r.categoryCode != null
        ? String(r.categoryCode)
        : (r.componentCode != null ? String(r.componentCode) : (r.component_code != null ? String(r.component_code) : null)),
      categoryName: r.categoryName != null
        ? String(r.categoryName)
        : (r.componentName != null ? String(r.componentName) : (r.component_name != null ? String(r.component_name) : null)),
      action: r.action != null ? String(r.action) : null,
      positions: r.positions,
      notes: r.notes != null ? String(r.notes) : null,
      workOrderLineId: r.id != null && isUuid(String(r.id)) ? String(r.id) : null,
      declined: r.declined === true,
    });
  }
  return out;
}

function dbLinesToLedgerInputs(lines: Record<string, unknown>[]): LedgerLineInput[] {
  return lines.map((r) => ({
    categoryId: r.component_id != null ? String(r.component_id) : null,
    categoryCode: r.component_code != null ? String(r.component_code) : null,
    categoryName: r.component_name != null ? String(r.component_name) : null,
    action: r.action != null ? String(r.action) : null,
    positions: r.positions,
    notes: r.notes != null ? String(r.notes) : null,
    workOrderLineId: r.id != null ? String(r.id) : null,
    declined: r.declined === true,
  }));
}

function mapDbWorkOrderToApi(
  wo: Record<string, unknown>,
  lines?: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    id: wo.id,
    organizationId: wo.organization_id,
    vehicleId: wo.vehicle_id,
    status: wo.status,
    openedAt: wo.opened_at,
    closedAt: wo.closed_at,
    performedAtDate: wo.performed_at_date,
    odometer: wo.odometer,
    provider: wo.provider,
    currency: wo.currency,
    templateId: wo.template_id,
    packageComplete: wo.package_complete === true,
    logMode: wo.log_mode,
    notes: wo.notes,
    invoiceUrl: wo.invoice_url,
    totalCost: wo.total_cost != null ? Number(wo.total_cost) : null,
    maintenanceRecordId: wo.maintenance_record_id,
    lines: lines ? lines.map(mapDbLineToApi) : undefined,
    createdAt: wo.created_at,
    updatedAt: wo.updated_at,
  };
}

async function loadCategoriesForTemplateIds(
  sb: SupabaseClient,
  templateIds: string[],
): Promise<Map<string, Array<Record<string, unknown>>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  if (!templateIds.length) return map;
  // Components only for package membership; include parent system when joinable
  const { data, error } = await sb
    .from("maintenance_package_categories")
    .select(
      "template_id, sort_order, required, category:maintenance_service_categories(*, parent:maintenance_service_categories!parent_id(*))",
    )
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });
  if (error) {
    // Fallback without parent join (older PostgREST / missing FK name)
    const { data: fallback, error: fbErr } = await sb
      .from("maintenance_package_categories")
      .select("template_id, sort_order, required, category:maintenance_service_categories(*)")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true });
    if (fbErr) throw fbErr;
    for (const row of fallback || []) {
      const tid = String((row as { template_id: string }).template_id);
      const cat = (row as { category?: Record<string, unknown> | null }).category;
      if (!cat) continue;
      const kind = cat.kind != null ? String(cat.kind) : "component";
      if (kind !== "component") continue;
      const list = map.get(tid) || [];
      list.push(cat);
      map.set(tid, list);
    }
    return map;
  }
  for (const row of data || []) {
    const tid = String((row as { template_id: string }).template_id);
    const cat = (row as { category?: Record<string, unknown> | null }).category;
    if (!cat) continue;
    const kind = cat.kind != null ? String(cat.kind) : "component";
    if (kind !== "component") continue;
    const list = map.get(tid) || [];
    list.push(cat);
    map.set(tid, list);
  }
  return map;
}

async function syncTemplateDescriptionFromCategories(
  sb: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { data } = await sb
    .from("maintenance_package_categories")
    .select("sort_order, category:maintenance_service_categories(name)")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  const names = (data || [])
    .map((r) => {
      const c = (r as { category?: { name?: string } | null }).category;
      return c?.name?.trim() || "";
    })
    .filter(Boolean);
  await sb
    .from("maintenance_task_templates")
    .update({ description: names.length ? names.join("\n") : null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
}

export function registerMaintenanceRoutes(app: { get: unknown; post: unknown; put: unknown; patch: unknown; delete: unknown }, supabase: SupabaseClient) {
  const route = app as {
    get: (path: string, ...handlers: unknown[]) => void;
    post: (path: string, ...handlers: unknown[]) => void;
    put: (path: string, ...handlers: unknown[]) => void;
    patch: (path: string, ...handlers: unknown[]) => void;
    delete: (path: string, ...handlers: unknown[]) => void;
  };
  // -------------------------------------------------------------------------
  // Super Admin — templates CRUD
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/admin/vehicle-catalog/:catalogId/maintenance-templates",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const catalogId = c.req.param("catalogId")?.trim() ?? "";
      if (!isUuid(catalogId)) {
        return c.json({ error: "Invalid catalog id" }, 400);
      }
      try {
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("vehicle_catalog_id", catalogId)
          .eq("template_scope", "catalog")
          .order("sort_order", { ascending: true })
          .order("task_name", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance-templates] GET:", msg);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-catalog/:catalogId/maintenance-templates",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const catalogId = c.req.param("catalogId")?.trim() ?? "";
      if (!isUuid(catalogId)) {
        return c.json({ error: "Invalid catalog id" }, 400);
      }
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const task_name = String(body.task_name ?? "").trim();
        if (!task_name) return c.json({ error: "task_name is required" }, 400);
        const fkRaw = String(body.frequency_kind ?? "recurring").trim();
        const frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fkRaw)
          ? fkRaw
          : "recurring";
        const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
        const frequency_label = fl.length ? fl.slice(0, 120) : null;
        const interval_miles = body.interval_miles != null && body.interval_miles !== ""
          ? Number(body.interval_miles)
          : null;
        let interval_miles_max = parseOptionalNumberField(body.interval_miles_max);
        if (interval_miles != null && interval_miles_max != null && interval_miles_max === interval_miles) {
          interval_miles_max = null;
        }
        const rangeErr = assertIntervalMilesRange(interval_miles, interval_miles_max);
        if (rangeErr) return c.json({ error: rangeErr }, 400);
        const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        const dueKindParsed = parseDueKind(body.due_kind);
        if (body.due_kind !== undefined && body.due_kind !== null && body.due_kind !== "" && !dueKindParsed) {
          return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
        }
        const row = {
          template_scope: "catalog",
          vehicle_catalog_id: catalogId,
          task_name,
          task_code: parseTaskCode(body),
          description: body.description != null ? String(body.description) : null,
          interval_miles,
          interval_miles_max,
          interval_months: body.interval_months != null && body.interval_months !== ""
            ? Number(body.interval_months)
            : null,
          frequency_kind,
          frequency_label,
          due_kind: dueKindParsed ?? "service_package",
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          icon_key,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select().single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/make-server-37f42386/admin/maintenance-templates/:id",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.task_name !== undefined) patch.task_name = String(body.task_name).trim();
        if (body.task_code !== undefined) patch.task_code = parseTaskCode(body);
        if (body.description !== undefined) patch.description = body.description;
        if (body.interval_miles !== undefined) {
          patch.interval_miles = body.interval_miles === "" || body.interval_miles == null
            ? null
            : Number(body.interval_miles);
        }
        if (body.interval_miles_max !== undefined) {
          patch.interval_miles_max = body.interval_miles_max === "" || body.interval_miles_max == null
            ? null
            : Number(body.interval_miles_max);
        }
        if (body.interval_months !== undefined) {
          patch.interval_months = body.interval_months === "" || body.interval_months == null
            ? null
            : Number(body.interval_months);
        }
        if (body.priority !== undefined) patch.priority = String(body.priority);
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
        if (body.frequency_kind !== undefined) {
          const fk = String(body.frequency_kind).trim();
          patch.frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fk) ? fk : "recurring";
        }
        if (body.frequency_label !== undefined) {
          const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
          patch.frequency_label = fl.length ? fl.slice(0, 120) : null;
        }
        if (body.icon_key !== undefined) {
          const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
          patch.icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        }
        if (body.due_kind !== undefined) {
          const dk = parseDueKind(body.due_kind);
          if (!dk) return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
          patch.due_kind = dk;
        }

        const { data: existingRow } = await supabase
          .from("maintenance_task_templates")
          .select("interval_miles, interval_miles_max")
          .eq("id", id)
          .maybeSingle();
        if (!existingRow) return c.json({ error: "Not found" }, 404);

        const mergedMiles = patch.interval_miles !== undefined
          ? (patch.interval_miles as number | null)
          : (existingRow.interval_miles != null ? Number(existingRow.interval_miles) : null);
        let mergedMax = patch.interval_miles_max !== undefined
          ? (patch.interval_miles_max as number | null)
          : (existingRow.interval_miles_max != null ? Number(existingRow.interval_miles_max) : null);
        if (mergedMiles != null && mergedMax != null && mergedMax === mergedMiles) {
          mergedMax = null;
          patch.interval_miles_max = null;
        }
        const patchRangeErr = assertIntervalMilesRange(mergedMiles, mergedMax);
        if (patchRangeErr) return c.json({ error: patchRangeErr }, 400);

        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/make-server-37f42386/admin/maintenance-templates/:id",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { error } = await supabase.from("maintenance_task_templates").delete().eq("id", id);
        if (error) throw error;
        return c.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/admin/maintenance-templates/global",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("template_scope", "global")
          .order("sort_order", { ascending: true })
          .order("task_name", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance-templates-global] GET:", msg);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/maintenance-templates/global",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const task_name = String(body.task_name ?? "").trim();
        if (!task_name) return c.json({ error: "task_name is required" }, 400);
        const fkRaw = String(body.frequency_kind ?? "recurring").trim();
        const frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fkRaw)
          ? fkRaw
          : "recurring";
        const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
        const frequency_label = fl.length ? fl.slice(0, 120) : null;
        const interval_miles = body.interval_miles != null && body.interval_miles !== ""
          ? Number(body.interval_miles)
          : null;
        let interval_miles_max = parseOptionalNumberField(body.interval_miles_max);
        if (interval_miles != null && interval_miles_max != null && interval_miles_max === interval_miles) {
          interval_miles_max = null;
        }
        const rangeErrG = assertIntervalMilesRange(interval_miles, interval_miles_max);
        if (rangeErrG) return c.json({ error: rangeErrG }, 400);
        const iconKeyRawG = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const icon_key = (iconKeyRawG || "wrench").slice(0, 40);
        const dueKindParsedG = parseDueKind(body.due_kind);
        if (body.due_kind !== undefined && body.due_kind !== null && body.due_kind !== "" && !dueKindParsedG) {
          return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
        }
        const row = {
          template_scope: "global",
          vehicle_catalog_id: null as string | null,
          task_name,
          task_code: parseTaskCode(body),
          description: body.description != null ? String(body.description) : null,
          interval_miles,
          interval_miles_max,
          interval_months: body.interval_months != null && body.interval_months !== ""
            ? Number(body.interval_months)
            : null,
          frequency_kind,
          frequency_label,
          due_kind: dueKindParsedG ?? "service_package",
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          icon_key,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select().single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Super Admin — service categories + package membership
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/admin/maintenance-categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const kindFilter = parseCategoryKind(c.req.query("kind"));
        let q = supabase
          .from("maintenance_service_categories")
          .select("*")
          .order("sort_order", { ascending: true });
        if (kindFilter) q = q.eq("kind", kindFilter);
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/maintenance-categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const code = String(body.code ?? "").trim();
        const name = String(body.name ?? "").trim();
        if (!code) return c.json({ error: "code is required" }, 400);
        if (!name) return c.json({ error: "name is required" }, 400);
        const kind = parseCategoryKind(body.kind) ?? "component";
        const parentParsed = parseOptionalUuidField(body.parent_id);
        if (!parentParsed.ok) return c.json({ error: "Invalid parent_id" }, 400);
        let parent_id = parentParsed.value;
        if (kind === "system") parent_id = null;
        const kindErr = assertCategoryKindParent(kind, parent_id);
        if (kindErr) return c.json({ error: kindErr }, 400);
        const op_code = body.op_code === undefined || body.op_code === null || body.op_code === ""
          ? null
          : String(body.op_code).trim().slice(0, 80);
        const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const row = {
          code: code.slice(0, 80),
          name: name.slice(0, 200),
          icon_key: (iconKeyRaw || "wrench").slice(0, 40),
          field_schema: parseFieldSchema(body.field_schema),
          quick_job_eligible: body.quick_job_eligible === true,
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          kind,
          parent_id,
          op_code,
          position_aware: kind === "component" && body.position_aware === true,
          default_interval_miles: body.default_interval_miles != null && body.default_interval_miles !== ""
            ? Number(body.default_interval_miles)
            : null,
          default_interval_months: body.default_interval_months != null && body.default_interval_months !== ""
            ? Number(body.default_interval_months)
            : null,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/make-server-37f42386/admin/maintenance-categories/:id",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.code !== undefined) patch.code = String(body.code).trim().slice(0, 80);
        if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 200);
        if (body.icon_key !== undefined) {
          const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
          patch.icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        }
        if (body.field_schema !== undefined) patch.field_schema = parseFieldSchema(body.field_schema);
        if (body.quick_job_eligible !== undefined) patch.quick_job_eligible = body.quick_job_eligible === true;
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
        if (body.op_code !== undefined) {
          patch.op_code = body.op_code === null || body.op_code === ""
            ? null
            : String(body.op_code).trim().slice(0, 80);
        }
        if (body.position_aware !== undefined) {
          patch.position_aware = body.position_aware === true;
        }
        if (body.default_interval_miles !== undefined) {
          patch.default_interval_miles =
            body.default_interval_miles === null || body.default_interval_miles === ""
              ? null
              : Number(body.default_interval_miles);
        }
        if (body.default_interval_months !== undefined) {
          patch.default_interval_months =
            body.default_interval_months === null || body.default_interval_months === ""
              ? null
              : Number(body.default_interval_months);
        }

        const { data: existingCat } = await supabase
          .from("maintenance_service_categories")
          .select("kind, parent_id")
          .eq("id", id)
          .maybeSingle();
        if (!existingCat) return c.json({ error: "Not found" }, 404);

        const nextKindRaw = body.kind !== undefined ? parseCategoryKind(body.kind) : null;
        if (body.kind !== undefined && !nextKindRaw) {
          return c.json({ error: "kind must be system or component" }, 400);
        }
        const nextKind = (nextKindRaw ?? String(existingCat.kind ?? "component")) as "system" | "component";
        if (body.kind !== undefined) patch.kind = nextKind;
        if (nextKind === "system") patch.position_aware = false;

        let nextParent: string | null =
          existingCat.parent_id != null ? String(existingCat.parent_id) : null;
        if (body.parent_id !== undefined) {
          const parentParsed = parseOptionalUuidField(body.parent_id);
          if (!parentParsed.ok) return c.json({ error: "Invalid parent_id" }, 400);
          nextParent = parentParsed.value;
        }
        if (nextKind === "system") nextParent = null;
        if (body.kind !== undefined || body.parent_id !== undefined) {
          const kindErr = assertCategoryKindParent(nextKind, nextParent);
          if (kindErr) return c.json({ error: kindErr }, 400);
          patch.parent_id = nextParent;
        }

        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/make-server-37f42386/admin/maintenance-categories/:id",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { error } = await supabase.from("maintenance_service_categories").delete().eq("id", id);
        if (error) throw error;
        return c.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/admin/maintenance-templates/:id/categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { data, error } = await supabase
          .from("maintenance_package_categories")
          .select("*, category:maintenance_service_categories(*)")
          .eq("template_id", id)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.put(
    "/make-server-37f42386/admin/maintenance-templates/:id/categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const rawIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
        const categoryIds = rawIds.map((x) => String(x).trim()).filter((x) => isUuid(x));
        const { error: delErr } = await supabase
          .from("maintenance_package_categories")
          .delete()
          .eq("template_id", id);
        if (delErr) throw delErr;
        if (categoryIds.length) {
          const rows = categoryIds.map((category_id, sort_order) => ({
            template_id: id,
            category_id,
            sort_order,
            required: true,
          }));
          const { error: insErr } = await supabase.from("maintenance_package_categories").insert(rows);
          if (insErr) throw insErr;
        }
        await syncTemplateDescriptionFromCategories(supabase, id);
        const { data, error } = await supabase
          .from("maintenance_package_categories")
          .select("*, category:maintenance_service_categories(*)")
          .eq("template_id", id)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-categories",
    requireAuth(),
    async (c) => {
      try {
        const kindFilter = parseCategoryKind(c.req.query("kind"));
        let q = supabase
          .from("maintenance_service_categories")
          .select("*")
          .order("sort_order", { ascending: true });
        if (kindFilter) q = q.eq("kind", kindFilter);
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-categories/quick-jobs",
    requireAuth(),
    async (c) => {
      try {
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .select("*")
          .eq("kind", "system")
          .eq("quick_job_eligible", true)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-categories/systems/:systemId/components",
    requireAuth(),
    async (c) => {
      try {
        const systemId = c.req.param("systemId")?.trim() ?? "";
        if (!isUuid(systemId)) return c.json({ error: "Invalid system id" }, 400);
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .select("*")
          .eq("kind", "component")
          .eq("parent_id", systemId)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // One-shot KV → Postgres migration (platform)
  route.post(
    "/make-server-37f42386/admin/migrate-maintenance-from-kv",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const { data: rows, error } = await supabase
          .from("kv_store_37f42386")
          .select("key, value")
          .like("key", "maintenance_log:%");
        if (error) throw error;
        let inserted = 0;
        let skipped = 0;
        for (const row of rows || []) {
          const val = row.value as Record<string, unknown>;
          if (!val || typeof val !== "object") continue;
          const vehicleId = String(val.vehicleId ?? "");
          const legacyId = String(val.id ?? "");
          const orgId = String(val.organizationId ?? "roam-default-org");
          if (!vehicleId || !legacyId) {
            skipped++;
            continue;
          }
          const { data: existing } = await supabase
            .from("maintenance_records")
            .select("id")
            .eq("organization_id", orgId)
            .eq("legacy_kv_id", legacyId)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }
          const performed_at_date = String(val.date ?? todayIso()).slice(0, 10);
          const performed_at_miles = Number(val.odo ?? 0);
          const { error: upErr } = await supabase.from("maintenance_records").insert({
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: null,
            performed_at_miles,
            performed_at_date,
            cost: val.cost != null ? Number(val.cost) : null,
            service_type: val.type != null ? String(val.type) : null,
            provider: val.provider != null ? String(val.provider) : null,
            notes: val.notes != null ? String(val.notes) : null,
            invoice_url: val.invoiceUrl != null ? String(val.invoiceUrl) : null,
            status: val.status != null ? String(val.status) : null,
            legacy_kv_id: legacyId,
            payload_json: val,
            updated_at: new Date().toISOString(),
          });
          if (upErr) {
            console.warn("[migrate-maintenance]", legacyId, upErr.message);
            skipped++;
          } else {
            inserted++;
          }
        }
        return c.json({ ok: true, inserted, skipped, scanned: (rows || []).length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  async function getVehicleFromKv(c: Context, vehicleId: string): Promise<Record<string, unknown> | null> {
    const raw = await kv.get(`vehicle:${vehicleId}`);
    if (!raw || typeof raw !== "object") return null;
    const scoped = filterByOrg([raw as Record<string, unknown>], c);
    return scoped[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // Tenant — schedule
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/maintenance-schedule/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const v = await getVehicleFromKv(c, vehicleId);
        if (!v) return c.json({ error: "Vehicle not found" }, 404);
        const metricsBase = Number(v.metrics && typeof v.metrics === "object"
          ? (v.metrics as { odometer?: number }).odometer
          : 0) || 0;
        const currentOdo = await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);
        const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const { data: scheduleRows, error: schErr } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("*")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId);
        if (schErr) throw schErr;

        const templateIds = [...new Set((scheduleRows || []).map((r: { template_id?: string }) => r.template_id).filter(Boolean))] as string[];
        const { data: tplRows } = templateIds.length
          ? await supabase.from("maintenance_task_templates").select("*").in("id", templateIds)
          : { data: [] as Record<string, unknown>[] };
        const catsByTpl = await loadCategoriesForTemplateIds(supabase, templateIds);
        const tplById: Record<string, Record<string, unknown>> = {};
        for (const t of tplRows || []) {
          const tid = String((t as { id: string }).id);
          tplById[tid] = {
            ...(t as Record<string, unknown>),
            categories: catsByTpl.get(tid) || [],
          };
        }

        const today = todayIso();
        const enriched = (scheduleRows || []).map((row: Record<string, unknown>) => {
          const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
          const nextMilesMaxRaw = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
          const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
          const schRowStatus = row.schedule_status != null ? String(row.schedule_status) : "active";
          const st = analyzeMaintenanceScheduleRow(
            currentOdo,
            today,
            nextMiles,
            nextMilesMaxRaw,
            nextDate,
            schRowStatus,
          ).status;
          const tid = String(row.template_id ?? "");
          return { ...row, template: tplById[tid] || null, computed_status: st };
        });

        const fleetStatus = enriched.length
          ? aggregateFleetStatus(enriched.map((r: { computed_status: string }) => ({
            status: r.computed_status as "ok" | "pending" | "overdue" | "fulfilled",
          })))
          : "No schedule";

        const dueSoonRows = enriched.filter((r: Record<string, unknown>) => {
          const st = r.computed_status as string;
          if (st === "fulfilled") return false;
          return r.next_due_miles != null;
        });
        const minNextMiles = dueSoonRows.length
          ? dueSoonRows
            .map((r: Record<string, unknown>) =>
              r.next_due_miles != null ? Number(r.next_due_miles) : Infinity
            )
            .reduce((a: number, b: number) => Math.min(a, b), Infinity)
          : Infinity;
        const nextOdo = minNextMiles === Infinity ? currentOdo + 5000 : minNextMiles;
        const remainingKm = Math.max(0, nextOdo - currentOdo);
        const daysToService = Math.max(0, Math.ceil(remainingKm / 50));

        const nextTypeLabel = enriched.find((r: Record<string, unknown>) =>
          r.computed_status !== "fulfilled" &&
          r.next_due_miles != null &&
          Number(r.next_due_miles) === minNextMiles
        );
        const tpl = nextTypeLabel?.template as { task_name?: string } | null | undefined;

        return c.json({
          catalogId,
          catalogMatched: !!catalogId,
          maintenanceStatus: {
            status: fleetStatus,
            nextTypeLabel: tpl?.task_name || "Service",
            daysToService,
            nextOdo,
            remainingKm,
          },
          schedule: enriched,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-schedule/:vehicleId/bootstrap",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const body = await c.req.json().catch(() => ({})) as { currentOdometer?: number };
        const v = await getVehicleFromKv(c, vehicleId);
        if (!v) return c.json({ error: "Vehicle not found" }, 404);
        const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
        if (!catalogId) return c.json({ error: "No vehicle catalog match for make/model/year", catalogMatched: false }, 400);
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const metricsBase = Number((v.metrics as { odometer?: number })?.odometer ?? 0) || 0;
        const currentOdo = body.currentOdometer != null && Number.isFinite(Number(body.currentOdometer))
          ? Number(body.currentOdometer)
          : await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);

        const run = await executeMaintenanceBootstrap({
          supabase,
          organizationId: orgId,
          vehicleId,
          currentOdo,
          catalogId,
        });
        if (!run.ok) {
          return c.json({ error: run.error, catalogId: run.catalogId, created: 0 }, 400);
        }
        if (run.emptyTemplates) {
          return c.json({
            created: 0,
            message: "No global or catalog templates for this vehicle",
            catalogId: run.catalogId,
            globalApplied: 0,
            catalogApplied: 0,
            skippedDuplicates: 0,
          });
        }
        return c.json({
          created: run.created,
          catalogId: run.catalogId,
          globalApplied: run.globalApplied,
          catalogApplied: run.catalogApplied,
          skippedDuplicates: run.skippedDuplicates,
          warnings: run.warnings,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — records (replaces KV maintenance_log)
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/maintenance-logs/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        let q = supabase
          .from("maintenance_records")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .order("performed_at_date", { ascending: false });

        const { data, error } = await q;
        if (error) throw error;

        const logs = (data || []).map((row: Record<string, unknown>) => {
          if (row.payload_json && typeof row.payload_json === "object") {
            return row.payload_json as Record<string, unknown>;
          }
          return {
            id: row.id,
            vehicleId: row.vehicle_id,
            date: row.performed_at_date,
            type: row.service_type || "Service",
            cost: row.cost != null ? Number(row.cost) : 0,
            odo: row.performed_at_miles,
            provider: row.provider || "",
            notes: row.notes || "",
            invoiceUrl: row.invoice_url || "",
            status: row.status || "Completed",
          };
        });

        return c.json(logs);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-logs",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("organization_id", orgId)
          .order("performed_at_date", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return c.json(data || []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-logs",
    requireAuth(),
    requirePermission("vehicles.edit"),
    requireCatalogMatched({
      label: "POST /maintenance-logs",
      vehicleId: (_c, body) => {
        if (!body || typeof body !== "object") return null;
        const id = (body as { vehicleId?: unknown }).vehicleId;
        return typeof id === "string" && id.trim() ? id.trim() : null;
      },
    }),
    async (c) => {
      try {
        const log = ((c.get("__cachedRequestBody") as Record<string, unknown> | null) ?? (await c.req.json())) as Record<string, unknown>;
        const vehicleId = String(log.vehicleId ?? "");
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const id = String(log.id || crypto.randomUUID());
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const performed_at_date = String(log.date ?? todayIso()).slice(0, 10);
        const performed_at_miles = Number(log.odo ?? 0);
        const templateId = log.templateId != null ? String(log.templateId) : null;
        const logMode = log.logMode != null ? String(log.logMode) : null;

        const currencyRaw = log.currency != null ? String(log.currency).trim().toUpperCase() : "JMD";
        const currency = currencyRaw || "JMD";
        const status = log.status != null ? String(log.status) : "Completed";

        // Auto-sum line items when present; otherwise use explicit cost
        const cost = Array.isArray(log.lines) && log.lines.length
          ? sumLogLines(log.lines)
          : (log.cost != null ? Number(log.cost) : null);

        const rowInsert = {
          id,
          organization_id: orgId,
          vehicle_id: vehicleId,
          template_id: templateId || null,
          performed_at_miles,
          performed_at_date,
          cost,
          currency,
          service_type: log.type != null ? String(log.type) : null,
          provider: log.provider != null ? String(log.provider) : null,
          notes: log.notes != null ? String(log.notes) : null,
          invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
          status,
          legacy_kv_id: null as string | null,
          payload_json: { ...log, id, vehicleId, currency, status, cost } as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert(rowInsert)
          .select()
          .single();
        if (insErr) throw insErr;

        // Service ledger + component schedules (ops truth); package clock only when members satisfied
        if (String(status).trim().toLowerCase() === "completed") {
          const ledgerLines = Array.isArray(log.lines)
            ? apiLinesToLedgerInputs(log.lines as unknown[])
            : [];
          if (ledgerLines.length) {
            await recordCompletedServiceLines({
              sb: supabase,
              organizationId: orgId,
              vehicleId,
              performedAtDate: performed_at_date,
              performedAtMiles: performed_at_miles,
              lines: ledgerLines,
              templateId,
              maintenanceRecordId: id,
            });
          }
          if (templateId && logMode !== "quick_job") {
            await maybeAdvancePackageSchedule({
              sb: supabase,
              organizationId: orgId,
              vehicleId,
              templateId,
              performedMiles: performed_at_miles,
              performedDate: performed_at_date,
              currentOdo: performed_at_miles,
              force: log.packageComplete === true || log.package_complete === true,
            });
          }
        }

        const ledgerInput = {
          id,
          vehicleId,
          performed_at_date,
          cost: rowInsert.cost,
          status,
          currency,
          service_type: rowInsert.service_type,
          provider: rowInsert.provider,
        };
        const ledgerResult = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);

        // Bridge: when lines present, also create a completed work order for the new garage UI
        let workOrderId: string | undefined;
        if (Array.isArray(log.lines) && log.lines.length) {
          const woId = crypto.randomUUID();
          const lineRows = (log.lines as unknown[])
            .map((raw, i) => {
              if (!raw || typeof raw !== "object") return null;
              return mapApiLineToDb(raw as Record<string, unknown>, i, woId);
            })
            .filter((r): r is Record<string, unknown> => r != null);
          const lineSum = lineRows.reduce((s, r) => s + (Number(r.line_total) || 0), 0);
          const logModeDb = logMode === "package" ? "package" : "quick_job";
          const packageComplete = logModeDb === "package" && !!templateId;
          const { error: woErr } = await supabase.from("maintenance_work_orders").insert({
            id: woId,
            organization_id: orgId,
            vehicle_id: vehicleId,
            status: "completed",
            opened_at: new Date().toISOString(),
            closed_at: new Date().toISOString(),
            performed_at_date,
            odometer: performed_at_miles,
            provider: rowInsert.provider,
            currency,
            template_id: templateId || null,
            package_complete: packageComplete,
            log_mode: logModeDb,
            notes: rowInsert.notes,
            invoice_url: rowInsert.invoice_url,
            total_cost: cost ?? lineSum,
            maintenance_record_id: id,
            payload_json: { source: "maintenance_logs_bridge", logId: id },
            updated_at: new Date().toISOString(),
          });
          if (woErr) {
            console.warn("[maintenance-logs] WO bridge insert failed:", woErr.message);
          } else {
            workOrderId = woId;
            if (lineRows.length) {
              const { error: lineErr } = await supabase
                .from("maintenance_work_order_lines")
                .insert(lineRows);
              if (lineErr) {
                console.warn("[maintenance-logs] WO lines bridge failed:", lineErr.message);
              } else {
                const usageRows = lineRows
                  .filter((r) => r.part_id && isUuid(String(r.part_id)))
                  .map((r) => ({
                    organization_id: orgId,
                    work_order_id: woId,
                    line_id: r.id != null ? String(r.id) : null,
                    part_id: String(r.part_id),
                    qty: r.qty != null ? Number(r.qty) : 1,
                    unit_cost: r.unit_price != null ? Number(r.unit_price) : null,
                    currency,
                    vehicle_id: vehicleId,
                    used_at: new Date().toISOString(),
                  }));
                if (usageRows.length) {
                  const { error: usageErr } = await supabase
                    .from("maintenance_parts_usage")
                    .insert(usageRows);
                  if (usageErr) {
                    console.warn("[maintenance-logs] parts usage bridge failed:", usageErr.message);
                  }
                }
              }
            }
            // Stash workOrderId on record payload for clients
            await supabase
              .from("maintenance_records")
              .update({
                payload_json: {
                  ...(rowInsert.payload_json as Record<string, unknown>),
                  workOrderId: woId,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          }
        }

        return c.json({
          success: true,
          data: inserted,
          workOrderId,
          ledgerPosted: ledgerResult.posted,
          ledgerWarning: ledgerResult.failed
            ? "Service saved but not posted to books — contact support if this persists"
            : undefined,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/make-server-37f42386/maintenance-logs/:vehicleId/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const id = c.req.param("id");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Maintenance record not found" }, 404);

        const prevStatus = String(existing.status ?? "").trim().toLowerCase();
        const nextStatus = body.status != null ? String(body.status) : String(existing.status ?? "Completed");
        const nextStatusLc = nextStatus.trim().toLowerCase();

        const performed_at_date = body.date != null
          ? String(body.date).slice(0, 10)
          : String(existing.performed_at_date ?? todayIso()).slice(0, 10);
        const performed_at_miles = body.odo != null
          ? Number(body.odo)
          : Number(existing.performed_at_miles ?? 0);

        const prevPayload = (existing.payload_json && typeof existing.payload_json === "object")
          ? existing.payload_json as Record<string, unknown>
          : {};
        const lines = body.lines !== undefined
          ? body.lines
          : prevPayload.lines;
        const cost = Array.isArray(lines) && lines.length
          ? sumLogLines(lines)
          : (body.cost !== undefined
            ? (body.cost != null ? Number(body.cost) : null)
            : (existing.cost != null ? Number(existing.cost) : null));

        const currencyRaw = body.currency != null
          ? String(body.currency).trim().toUpperCase()
          : String((existing as { currency?: string }).currency ?? "JMD").trim().toUpperCase();
        const currency = currencyRaw || "JMD";
        const service_type = body.type != null
          ? String(body.type)
          : (existing.service_type != null ? String(existing.service_type) : null);
        const provider = body.provider != null
          ? String(body.provider)
          : (existing.provider != null ? String(existing.provider) : null);
        const notes = body.notes != null
          ? String(body.notes)
          : (existing.notes != null ? String(existing.notes) : null);
        const invoice_url = body.invoiceUrl != null
          ? String(body.invoiceUrl)
          : (existing.invoice_url != null ? String(existing.invoice_url) : null);
        const templateId = body.templateId != null
          ? String(body.templateId)
          : (existing.template_id != null ? String(existing.template_id) : null);
        const logMode = body.logMode != null
          ? String(body.logMode)
          : (prevPayload.logMode != null ? String(prevPayload.logMode) : null);

        const payload_json = {
          ...prevPayload,
          ...body,
          id,
          vehicleId,
          date: performed_at_date,
          odo: performed_at_miles,
          cost,
          currency,
          type: service_type,
          provider,
          notes,
          invoiceUrl: invoice_url,
          templateId: templateId || undefined,
          status: nextStatus,
          lines,
          logMode: logMode || undefined,
        };

        const { data: updated, error: upErr } = await supabase
          .from("maintenance_records")
          .update({
            performed_at_miles,
            performed_at_date,
            cost,
            currency,
            service_type,
            provider,
            notes,
            invoice_url,
            status: nextStatus,
            template_id: templateId || null,
            payload_json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        const becameCompleted = prevStatus !== "completed" && nextStatusLc === "completed";
        if (becameCompleted || (nextStatusLc === "completed" && Array.isArray(lines) && lines.length)) {
          const ledgerLines = Array.isArray(lines) ? apiLinesToLedgerInputs(lines as unknown[]) : [];
          if (ledgerLines.length && becameCompleted) {
            await recordCompletedServiceLines({
              sb: supabase,
              organizationId: orgId,
              vehicleId,
              performedAtDate: performed_at_date,
              performedAtMiles: performed_at_miles,
              lines: ledgerLines,
              templateId,
              maintenanceRecordId: id,
            });
          }
          if (becameCompleted && templateId && logMode !== "quick_job") {
            await maybeAdvancePackageSchedule({
              sb: supabase,
              organizationId: orgId,
              vehicleId,
              templateId,
              performedMiles: performed_at_miles,
              performedDate: performed_at_date,
              currentOdo: performed_at_miles,
              force: body.packageComplete === true || body.package_complete === true,
            });
          }
        }

        // Ledger: delete prior, then re-append if still eligible (cost/status change)
        await deleteCanonicalLedgerBySource("financial_event", [id]);
        const ledgerInput = {
          id,
          vehicleId,
          performed_at_date,
          cost,
          status: nextStatus,
          currency,
          service_type,
          provider,
        };
        let ledgerPosted = false;
        let ledgerWarning: string | undefined;
        if (isMaintenanceLedgerEligible(ledgerInput)) {
          const ledgerResult = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);
          ledgerPosted = ledgerResult.posted;
          if (ledgerResult.failed) {
            ledgerWarning = "Service updated but not posted to books — contact support if this persists";
          }
        }

        return c.json({
          success: true,
          data: updated,
          ledgerPosted,
          ledgerWarning,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/make-server-37f42386/maintenance-logs/:vehicleId/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const id = c.req.param("id");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { error } = await supabase
          .from("maintenance_records")
          .delete()
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId);
        if (error) throw error;
        // Clean books even if UI retries after DB delete succeeded
        try {
          await deleteCanonicalLedgerBySource("financial_event", [id]);
        } catch (ledgerErr) {
          console.error("[maintenance] ledger delete after record delete failed:", ledgerErr);
        }
        return c.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Driver service requests → maintenance_records (status Requested, no ledger)
  // -------------------------------------------------------------------------
  route.post(
    "/make-server-37f42386/maintenance-requests",
    requireAuth({ requireOrg: true }),
    async (c) => {
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const rbacUser = c.get("rbacUser") as { userId?: string } | undefined;
        const driverId = String(rbacUser?.userId ?? "").trim();
        if (!driverId) return c.json({ error: "Unauthorized" }, 401);

        const { resolveDriverVehicleAssignment } = await import("./driver_vehicle_assignment.ts");
        const hintVehicleId = body.vehicleId != null ? String(body.vehicleId).trim() : undefined;
        const resolved = await resolveDriverVehicleAssignment(driverId, {
          organizationId: orgId,
          hintVehicleId: hintVehicleId || undefined,
        });
        const vehicleId = resolved.vehicleId;
        if (!vehicleId) {
          return c.json({
            error: "No assigned vehicle",
            code: "NO_ASSIGNED_VEHICLE",
            message: "You need an assigned vehicle before requesting service.",
          }, 400);
        }

        // Catalog gate — clear 4xx when unmatched (same philosophy as log create)
        const catalogId = await resolveCatalogIdForKvVehicle(
          supabase,
          { id: vehicleId, ...(resolved.vehicle || {}) },
        );
        if (!catalogId) {
          return c.json({
            error: "Vehicle is not matched to the motor catalog",
            code: "CATALOG_UNMATCHED",
            message: "Ask a fleet manager to link this vehicle to the catalog before requesting service.",
          }, 400);
        }

        const id = crypto.randomUUID();
        const performed_at_date = String(body.date ?? todayIso()).slice(0, 10);
        const performed_at_miles = Number(body.odometer ?? body.odo ?? 0);
        const serviceType = body.type != null ? String(body.type) : "Maintenance";
        const description = body.description != null ? String(body.description) : "";
        const priority = body.priority != null ? String(body.priority) : "Medium";
        const notes = [description, priority ? `Priority: ${priority}` : ""].filter(Boolean).join("\n");

        const payload_json = {
          source: "driver_service_request",
          driverId,
          priority,
          type: serviceType,
          description,
          date: performed_at_date,
          odo: performed_at_miles,
          vehicleId,
          id,
          status: "Requested",
        };

        const rowInsert = {
          id,
          organization_id: orgId,
          vehicle_id: vehicleId,
          template_id: null as string | null,
          performed_at_miles,
          performed_at_date,
          cost: null as number | null,
          currency: "JMD",
          service_type: serviceType,
          provider: "Driver Request",
          notes,
          invoice_url: null as string | null,
          status: "Requested",
          legacy_kv_id: null as string | null,
          payload_json,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert(rowInsert)
          .select()
          .single();
        if (insErr) throw insErr;

        // Phase 6: open a draft work order so fleet completes via garage job card
        let workOrderId: string | null = null;
        try {
          const woId = crypto.randomUUID();
          const { error: woErr } = await supabase.from("maintenance_work_orders").insert({
            id: woId,
            organization_id: orgId,
            vehicle_id: vehicleId,
            status: "draft",
            performed_at_date,
            odometer: performed_at_miles,
            provider: "Driver Request",
            currency: "JMD",
            log_mode: "quick_job",
            package_complete: false,
            notes,
            maintenance_record_id: id,
            payload_json: {
              ...payload_json,
              workOrderId: woId,
            },
            updated_at: new Date().toISOString(),
          });
          if (!woErr) {
            workOrderId = woId;
            await supabase
              .from("maintenance_records")
              .update({
                payload_json: { ...payload_json, workOrderId: woId },
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          } else {
            console.error("[maintenance-requests] draft WO:", woErr.message);
          }
        } catch (woCreateErr: unknown) {
          console.error("[maintenance-requests] draft WO:", woCreateErr);
        }

        // Never post Requested rows to the ledger
        return c.json({ success: true, data: inserted, workOrderId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-requests",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const status = String(c.req.query("status") || "Requested").trim() || "Requested";
        const { data, error } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("organization_id", orgId)
          .eq("status", status)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return c.json({ data: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /** Bootstrap merged templates for every org vehicle that has no schedule rows yet (catalog match required). */
  route.post(
    "/make-server-37f42386/maintenance-fleet-bootstrap",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const { data: kvRows, error: kvErr } = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "vehicle:%");
        if (kvErr) throw kvErr;
        const vehicles = filterByOrg(
          (kvRows || []).map((r: { value: unknown }) => r.value as Record<string, unknown>).filter(Boolean),
          c,
        );

        const odoMaps = await loadOdometerSupplementMaps(supabase, c);

        const results: Array<{
          vehicleId: string;
          created: number;
          skippedReason?: string;
          catalogId?: string | null;
        }> = [];
        let totalCreated = 0;

        // FIX: Pre-fetch all existing schedule rows in batch to avoid N queries
        const vehicleIds = vehicles.map((v) => String(v.id ?? "")).filter(Boolean);
        const { data: allScheduleRows } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("vehicle_id, id")
          .eq("organization_id", orgId)
          .in("vehicle_id", vehicleIds);
        
        const hasScheduleSet = new Set(
          (allScheduleRows || []).map((r) => r.vehicle_id as string)
        );

        for (const v of vehicles) {
          const vehicleId = String(v.id ?? "");
          if (!vehicleId) continue;

          // Use pre-fetched set instead of per-vehicle query
          if (hasScheduleSet.has(vehicleId)) {
            results.push({ vehicleId, created: 0, skippedReason: "already_has_schedule" });
            continue;
          }

          const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
          if (!catalogId) {
            results.push({ vehicleId, created: 0, skippedReason: "no_catalog_match" });
            continue;
          }

          const metricsBase = Number((v.metrics as { odometer?: number })?.odometer ?? 0) || 0;
          const currentOdo = canonicalOdometerFromMaps(vehicleId, metricsBase, odoMaps);
          const run = await executeMaintenanceBootstrap({
            supabase,
            organizationId: orgId,
            vehicleId,
            currentOdo,
            catalogId,
          });

          if (!run.ok) {
            results.push({
              vehicleId,
              created: 0,
              skippedReason: run.error,
              catalogId: run.catalogId,
            });
            continue;
          }
          if (run.emptyTemplates) {
            results.push({
              vehicleId,
              created: 0,
              skippedReason: "no_templates",
              catalogId: run.catalogId,
            });
            continue;
          }
          totalCreated += run.created;
          results.push({
            vehicleId,
            created: run.created,
            catalogId: run.catalogId,
          });
        }

        return c.json({ totalCreated, results });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // Fleet summary for Maintenance hub (all vehicles in org with odometer + status)
  route.get(
    "/make-server-37f42386/maintenance-fleet-summary",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const { data: kvRows } = await supabase
          .from("kv_store_37f42386")
          .select("value")
          .like("key", "vehicle:%");
        const vehicles = filterByOrg(
          (kvRows || []).map((r: { value: unknown }) => r.value as Record<string, unknown>).filter(Boolean),
          c,
        );

        const odoMaps = await loadOdometerSupplementMaps(supabase, c);

        const { data: schedules } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("vehicle_id, next_due_miles, next_due_miles_max, next_due_date, template_id, schedule_status")
          .eq("organization_id", orgId);

        const byVehicle: Record<string, Record<string, unknown>[]> = {};
        for (const s of schedules || []) {
          const vid = s.vehicle_id as string;
          if (!byVehicle[vid]) byVehicle[vid] = [];
          byVehicle[vid].push(s as Record<string, unknown>);
        }

        const templateIds = [...new Set((schedules || []).map((s) => s.template_id).filter(Boolean))] as string[];
        const { data: fleetTplRows } = templateIds.length
          ? await supabase.from("maintenance_task_templates").select("id, task_name").in("id", templateIds)
          : { data: [] as { id: string; task_name?: string | null }[] };
        const fleetTplById: Record<string, string> = {};
        for (const t of fleetTplRows || []) {
          const id = String((t as { id: string }).id);
          fleetTplById[id] = String((t as { task_name?: string | null }).task_name ?? "").trim() || "Service";
        }

        const today = todayIso();
        const items = await Promise.all(vehicles.map(async (v: Record<string, unknown>) => {
          const vid = String(v.id ?? "");
          const metricsBase = Number((v.metrics as { odometer?: number })?.odometer ?? 0);
          const odo = canonicalOdometerFromMaps(vid, metricsBase, odoMaps);
          const sch = byVehicle[vid] || [];
          const attention: FleetServiceAttentionItem[] = [];
          let maxCalendarDaysOverdue: number | null = null;
          let maxKmOverdue: number | null = null;

          const statuses: Array<"ok" | "pending" | "overdue" | "fulfilled"> = [];
          for (const row of sch) {
            const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
            const nextMilesMaxRaw = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
            const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
            const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
            const a = analyzeMaintenanceScheduleRow(odo, today, nextMiles, nextMilesMaxRaw, nextDate, schSt);
            if (a.calendarDaysOverdue != null) {
              maxCalendarDaysOverdue = maxCalendarDaysOverdue == null
                ? a.calendarDaysOverdue
                : Math.max(maxCalendarDaysOverdue, a.calendarDaysOverdue);
            }
            if (a.kmOverdue != null) {
              maxKmOverdue = maxKmOverdue == null ? a.kmOverdue : Math.max(maxKmOverdue, a.kmOverdue);
            }
            const tid = String(row.template_id ?? "");
            const taskName = fleetTplById[tid] ?? "Service";
            if (a.status === "overdue" || a.status === "pending") {
              const kind = a.status === "overdue" ? "overdue" as const : "due_soon" as const;
              let expanded = false;
              if (tid) {
                try {
                  const checklist = await getPackageChecklist({
                    sb: supabase,
                    organizationId: orgId,
                    vehicleId: vid,
                    templateId: tid,
                    currentOdo: odo,
                    today,
                  });
                  const dueItems = checklist.filter(
                    (i) => i.status === "outstanding" || i.status === "partial",
                  );
                  for (const item of dueItems) {
                    const pos =
                      item.positionAware && item.outstandingPositions.length
                        ? ` (${item.outstandingPositions.join(", ")})`
                        : "";
                    attention.push({
                      kind,
                      taskName: `${item.categoryName}${pos}`,
                    });
                    expanded = true;
                  }
                  // All members satisfied → do not re-list whole package
                } catch {
                  /* fall through to package name */
                }
              }
              if (!expanded) attention.push({ kind, taskName });
            }
            statuses.push(a.status);
          }
          const st = sch.length ? aggregateFleetStatus(statuses.map((s) => ({ status: s }))) : "No schedule";
          const eligibleForNext = sch.filter((r) => String(r.schedule_status ?? "active") !== "fulfilled");
          const minM = eligibleForNext.length
            ? eligibleForNext
              .map((r) => r.next_due_miles != null ? Number(r.next_due_miles) : Infinity)
              .reduce((a, b) => Math.min(a, b), Infinity)
            : Infinity;
          const nextOdo = minM === Infinity ? null : minM;
          const sortedAttention = sortFleetServiceAttention(attention);
          const servicesAttentionTruncated = sortedAttention.length > FLEET_SERVICES_ATTENTION_CAP;
          const servicesAttention = sortedAttention.slice(0, FLEET_SERVICES_ATTENTION_CAP);
          return {
            vehicleId: vid,
            licensePlate: v.licensePlate,
            make: v.make,
            model: v.model,
            year: v.year,
            odometer: odo,
            fleetStatus: st,
            nextDueOdometer: nextOdo,
            scheduleRowCount: sch.length,
            maxCalendarDaysOverdue,
            maxKmOverdue,
            servicesAttention,
            servicesAttentionTruncated,
          };
        }));

        return c.json({ items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Service ledger + outstanding (ops truth, not finance)
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/maintenance-service-ledger",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.query("vehicleId")?.trim() || "";
        const limit = Math.min(Number(c.req.query("limit") || 100) || 100, 500);
        let q = supabase
          .from("maintenance_service_ledger")
          .select("*")
          .eq("organization_id", orgId)
          .is("voided_at", null)
          .order("performed_at_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        if (vehicleId) q = q.eq("vehicle_id", vehicleId);
        const { data, error } = await q;
        if (error) throw error;
        const items = (data || []).map((r) => ({
          id: r.id,
          organizationId: r.organization_id,
          vehicleId: r.vehicle_id,
          performedAtDate: r.performed_at_date,
          performedAtMiles: r.performed_at_miles != null ? Number(r.performed_at_miles) : null,
          categoryId: r.category_id,
          categoryCode: r.category_code,
          categoryName: r.category_name,
          position: r.position,
          action: r.action,
          templateId: r.template_id,
          maintenanceRecordId: r.maintenance_record_id,
          workOrderId: r.work_order_id,
          notes: r.notes,
          createdAt: r.created_at,
        }));
        return c.json({ items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-outstanding/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const vehicle = await kv.get(`vehicle:${vehicleId}`);
        const metricsBase = Number(
          (vehicle as { metrics?: { odometer?: number } } | null)?.metrics?.odometer ?? 0,
        );
        const odo = await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);
        const today = todayIso();

        const { data: states, error } = await supabase
          .from("vehicle_component_schedule")
          .select("*, category:maintenance_service_categories(id, code, name, position_aware, icon_key)")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId);
        if (error) throw error;

        const items = [];
        for (const row of states || []) {
          const st = analyzeComponentRowStatus(odo, today, {
            next_due_miles: row.next_due_miles as number | null,
            next_due_miles_max: row.next_due_miles_max as number | null,
            next_due_date: row.next_due_date as string | null,
            schedule_status: row.schedule_status as string | null,
          });
          if (st !== "pending" && st !== "overdue") continue;
          const cat = row.category as Record<string, unknown> | null;
          items.push({
            categoryId: String(row.category_id),
            categoryCode: cat?.code != null ? String(cat.code) : "",
            categoryName: cat?.name != null ? String(cat.name) : "",
            position: row.position != null ? String(row.position) : null,
            status: st,
            lastPerformedDate: row.last_performed_date
              ? String(row.last_performed_date).slice(0, 10)
              : null,
            lastPerformedMiles:
              row.last_performed_miles != null ? Number(row.last_performed_miles) : null,
            nextDueMiles: row.next_due_miles != null ? Number(row.next_due_miles) : null,
            nextDueDate: row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null,
          });
        }
        return c.json({ vehicleId, odometer: odo, items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-package-checklist/:vehicleId/:templateId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const templateId = c.req.param("templateId");
        const vehicle = await kv.get(`vehicle:${vehicleId}`);
        const metricsBase = Number(
          (vehicle as { metrics?: { odometer?: number } } | null)?.metrics?.odometer ?? 0,
        );
        const odo = await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);
        const today = todayIso();
        const items = await getPackageChecklist({
          sb: supabase,
          organizationId: orgId,
          vehicleId,
          templateId,
          currentOdo: odo,
          today,
        });
        return c.json({ vehicleId, templateId, odometer: odo, items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-service-ledger/backfill",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const result = await backfillServiceLedgerForOrg({
          sb: supabase,
          organizationId: orgId,
        });
        return c.json({ success: true, ...result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — work orders (job cards)
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/maintenance-work-orders",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = String(c.req.query("vehicleId") || "").trim();
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const { data, error } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .order("opened_at", { ascending: false });
        if (error) throw error;
        return c.json({ items: (data || []).map((wo) => mapDbWorkOrderToApi(wo as Record<string, unknown>)) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/make-server-37f42386/maintenance-work-orders/:id",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const { data: wo, error } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (error) throw error;
        if (!wo) return c.json({ error: "Not found" }, 404);
        const { data: lines, error: lineErr } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        if (lineErr) throw lineErr;
        return c.json({
          item: mapDbWorkOrderToApi(
            wo as Record<string, unknown>,
            (lines || []) as Record<string, unknown>[],
          ),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-work-orders",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "").trim();
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const statusRaw = String(body.status ?? "draft").trim();
        const status = ["draft", "in_progress"].includes(statusRaw) ? statusRaw : "draft";
        const logModeRaw = String(body.logMode ?? body.log_mode ?? "quick_job").trim();
        const log_mode = logModeRaw === "package" ? "package" : "quick_job";
        const templateParsed = parseOptionalUuidField(body.templateId ?? body.template_id);
        if (!templateParsed.ok) return c.json({ error: "Invalid templateId" }, 400);
        const currencyRaw = body.currency != null ? String(body.currency).trim().toUpperCase() : "JMD";
        const currency = currencyRaw || "JMD";
        const woId = crypto.randomUUID();
        const rawLines = Array.isArray(body.lines) ? body.lines : [];
        const lineRows = rawLines
          .map((raw, i) => {
            if (!raw || typeof raw !== "object") return null;
            return mapApiLineToDb(raw as Record<string, unknown>, i, woId);
          })
          .filter((r): r is Record<string, unknown> => r != null);
        const totalCost = lineRows.reduce((s, r) => s + (Number(r.line_total) || 0), 0);

        const header = {
          id: woId,
          organization_id: orgId,
          vehicle_id: vehicleId,
          status,
          opened_at: new Date().toISOString(),
          performed_at_date: body.performedAtDate != null || body.performed_at_date != null
            ? String(body.performedAtDate ?? body.performed_at_date).slice(0, 10)
            : null,
          odometer: body.odometer != null ? Number(body.odometer) : null,
          provider: body.provider != null ? String(body.provider) : null,
          currency,
          template_id: templateParsed.value,
          package_complete: body.packageComplete === true || body.package_complete === true,
          log_mode,
          notes: body.notes != null ? String(body.notes) : null,
          invoice_url: body.invoiceUrl != null
            ? String(body.invoiceUrl)
            : (body.invoice_url != null ? String(body.invoice_url) : null),
          total_cost: totalCost || null,
          updated_at: new Date().toISOString(),
        };
        const { data: wo, error: woErr } = await supabase
          .from("maintenance_work_orders")
          .insert(header)
          .select()
          .single();
        if (woErr) throw woErr;
        if (lineRows.length) {
          const { error: lineErr } = await supabase
            .from("maintenance_work_order_lines")
            .insert(lineRows);
          if (lineErr) throw lineErr;
        }
        const { data: lines } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", woId)
          .order("sort_order", { ascending: true });
        return c.json({
          item: mapDbWorkOrderToApi(
            wo as Record<string, unknown>,
            (lines || []) as Record<string, unknown>[],
          ),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/make-server-37f42386/maintenance-work-orders/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Not found" }, 404);
        if (String(existing.status) === "completed") {
          return c.json({ error: "Cannot edit a completed work order" }, 400);
        }

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) {
          const st = String(body.status).trim();
          if (!["draft", "in_progress", "cancelled"].includes(st)) {
            return c.json({ error: "status must be draft, in_progress, or cancelled" }, 400);
          }
          patch.status = st;
        }
        if (body.performedAtDate !== undefined || body.performed_at_date !== undefined) {
          const v = body.performedAtDate ?? body.performed_at_date;
          patch.performed_at_date = v == null || v === "" ? null : String(v).slice(0, 10);
        }
        if (body.odometer !== undefined) {
          patch.odometer = body.odometer == null || body.odometer === "" ? null : Number(body.odometer);
        }
        if (body.provider !== undefined) patch.provider = body.provider == null ? null : String(body.provider);
        if (body.currency !== undefined) {
          const cur = String(body.currency).trim().toUpperCase();
          patch.currency = cur || "JMD";
        }
        if (body.templateId !== undefined || body.template_id !== undefined) {
          const tp = parseOptionalUuidField(body.templateId ?? body.template_id);
          if (!tp.ok) return c.json({ error: "Invalid templateId" }, 400);
          patch.template_id = tp.value;
        }
        if (body.packageComplete !== undefined || body.package_complete !== undefined) {
          patch.package_complete = body.packageComplete === true || body.package_complete === true;
        }
        if (body.logMode !== undefined || body.log_mode !== undefined) {
          const lm = String(body.logMode ?? body.log_mode).trim();
          patch.log_mode = lm === "package" ? "package" : "quick_job";
        }
        if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes);
        if (body.invoiceUrl !== undefined || body.invoice_url !== undefined) {
          const u = body.invoiceUrl ?? body.invoice_url;
          patch.invoice_url = u == null || u === "" ? null : String(u);
        }

        if (Array.isArray(body.lines)) {
          const { error: delErr } = await supabase
            .from("maintenance_work_order_lines")
            .delete()
            .eq("work_order_id", id);
          if (delErr) throw delErr;
          const lineRows = body.lines
            .map((raw, i) => {
              if (!raw || typeof raw !== "object") return null;
              const row = mapApiLineToDb(raw as Record<string, unknown>, i, id);
              delete row.id; // fresh ids on replace
              return row;
            })
            .filter((r): r is Record<string, unknown> => r != null);
          if (lineRows.length) {
            const { error: insErr } = await supabase
              .from("maintenance_work_order_lines")
              .insert(lineRows);
            if (insErr) throw insErr;
          }
          patch.total_cost = lineRows.reduce((s, r) => s + (Number(r.line_total) || 0), 0);
        }

        const { data: wo, error: upErr } = await supabase
          .from("maintenance_work_orders")
          .update(patch)
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        const { data: lines } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        return c.json({
          item: mapDbWorkOrderToApi(
            wo as Record<string, unknown>,
            (lines || []) as Record<string, unknown>[],
          ),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-work-orders/:id/complete",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

        const { data: wo, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!wo) return c.json({ error: "Not found" }, 404);
        if (String(wo.status) === "completed") {
          return c.json({ error: "Work order already completed" }, 400);
        }
        if (String(wo.status) === "cancelled") {
          return c.json({ error: "Cannot complete a cancelled work order" }, 400);
        }

        const { data: lines, error: lineErr } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        if (lineErr) throw lineErr;
        const lineRows = (lines || []) as Record<string, unknown>[];
        const totalCost = lineRows.reduce((s, r) => {
          const lt = r.line_total != null ? Number(r.line_total) : computeWoLineTotal(r);
          return s + (Number.isFinite(lt) ? lt : 0);
        }, 0);
        const roundedTotal = Math.round(totalCost * 100) / 100;

        const performed_at_date = body.performedAtDate != null || body.performed_at_date != null
          ? String(body.performedAtDate ?? body.performed_at_date).slice(0, 10)
          : (wo.performed_at_date != null ? String(wo.performed_at_date).slice(0, 10) : todayIso());
        const performed_at_miles = body.odometer != null
          ? Number(body.odometer)
          : (wo.odometer != null ? Number(wo.odometer) : 0);
        const currency = String(wo.currency ?? "JMD");
        const vehicleId = String(wo.vehicle_id);
        const templateId = wo.template_id != null ? String(wo.template_id) : null;
        const logMode = String(wo.log_mode ?? "quick_job");
        const packageComplete = wo.package_complete === true;
        const provider = body.provider != null
          ? String(body.provider)
          : (wo.provider != null ? String(wo.provider) : null);
        const notes = body.notes != null
          ? String(body.notes)
          : (wo.notes != null ? String(wo.notes) : null);
        const invoice_url = body.invoiceUrl != null || body.invoice_url != null
          ? String(body.invoiceUrl ?? body.invoice_url)
          : (wo.invoice_url != null ? String(wo.invoice_url) : null);

        const recordId = crypto.randomUUID();
        const apiLines = lineRows.map(mapDbLineToApi);
        const service_type = body.type != null
          ? String(body.type)
          : (packageComplete ? "Package service" : "Quick job");
        const payload_json = {
          id: recordId,
          vehicleId,
          date: performed_at_date,
          odo: performed_at_miles,
          type: service_type,
          cost: roundedTotal,
          currency,
          provider: provider || "",
          notes: notes || "",
          invoiceUrl: invoice_url || "",
          status: "Completed",
          templateId: templateId || undefined,
          logMode,
          workOrderId: id,
          lines: apiLines,
          source: "work_order_complete",
        };

        const { data: record, error: recErr } = await supabase
          .from("maintenance_records")
          .insert({
            id: recordId,
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: templateId,
            performed_at_miles,
            performed_at_date,
            cost: roundedTotal,
            currency,
            service_type,
            provider,
            notes,
            invoice_url,
            status: "Completed",
            legacy_kv_id: null,
            payload_json,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (recErr) throw recErr;

        const { data: completedWo, error: upErr } = await supabase
          .from("maintenance_work_orders")
          .update({
            status: "completed",
            closed_at: new Date().toISOString(),
            performed_at_date,
            odometer: performed_at_miles,
            provider,
            notes,
            invoice_url,
            total_cost: roundedTotal,
            maintenance_record_id: recordId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        // Service ledger + component schedules; package clock when members satisfied
        await recordCompletedServiceLines({
          sb: supabase,
          organizationId: orgId,
          vehicleId,
          performedAtDate: performed_at_date,
          performedAtMiles: performed_at_miles,
          lines: dbLinesToLedgerInputs(lineRows),
          templateId,
          maintenanceRecordId: recordId,
          workOrderId: id,
        });
        if (templateId && logMode !== "quick_job") {
          await maybeAdvancePackageSchedule({
            sb: supabase,
            organizationId: orgId,
            vehicleId,
            templateId,
            performedMiles: performed_at_miles,
            performedDate: performed_at_date,
            currentOdo: performed_at_miles,
            force: packageComplete === true,
          });
        }

        const ledgerInput = {
          id: recordId,
          vehicleId,
          performed_at_date,
          cost: roundedTotal,
          status: "Completed",
          currency,
          service_type,
          provider,
        };
        const ledgerResult = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);

        const usageRows = lineRows
          .filter((r) => r.part_id && isUuid(String(r.part_id)) && r.declined !== true)
          .map((r) => ({
            organization_id: orgId,
            work_order_id: id,
            line_id: r.id != null ? String(r.id) : null,
            part_id: String(r.part_id),
            qty: r.qty != null ? Number(r.qty) : 1,
            unit_cost: r.unit_price != null ? Number(r.unit_price) : null,
            currency,
            vehicle_id: vehicleId,
            used_at: new Date().toISOString(),
          }));
        if (usageRows.length) {
          const { error: usageErr } = await supabase
            .from("maintenance_parts_usage")
            .insert(usageRows);
          if (usageErr) {
            console.warn("[maintenance-wo] parts usage insert failed:", usageErr.message);
          }
        }

        return c.json({
          item: mapDbWorkOrderToApi(completedWo as Record<string, unknown>, lineRows),
          record,
          ledgerPosted: ledgerResult.posted,
          ledgerWarning: ledgerResult.failed
            ? "Work order completed but not posted to books — contact support if this persists"
            : undefined,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — digital vehicle inspection (DVI)
  // -------------------------------------------------------------------------
  route.get(
    "/make-server-37f42386/maintenance-inspection-templates",
    requireAuth(),
    async (c) => {
      try {
        const { data: templates, error } = await supabase
          .from("maintenance_inspection_templates")
          .select("*")
          .order("sort_order", { ascending: true });
        if (error) throw error;
        const ids = (templates || []).map((t: { id: string }) => t.id);
        const { data: items, error: itemErr } = ids.length
          ? await supabase
            .from("maintenance_inspection_items")
            .select("*")
            .in("template_id", ids)
            .order("sort_order", { ascending: true })
          : { data: [] as Record<string, unknown>[], error: null };
        if (itemErr) throw itemErr;
        const byTpl = new Map<string, Record<string, unknown>[]>();
        for (const it of items || []) {
          const tid = String((it as { template_id: string }).template_id);
          const list = byTpl.get(tid) || [];
          list.push(it as Record<string, unknown>);
          byTpl.set(tid, list);
        }
        return c.json({
          items: (templates || []).map((t: Record<string, unknown>) => ({
            ...t,
            items: byTpl.get(String(t.id)) || [],
          })),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/maintenance-inspection-findings",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const rawFindings = Array.isArray(body.findings) ? body.findings : [];
        if (!rawFindings.length) return c.json({ error: "findings[] is required" }, 400);

        const created: Record<string, unknown>[] = [];
        for (const raw of rawFindings) {
          if (!raw || typeof raw !== "object") continue;
          const f = raw as Record<string, unknown>;
          const vehicleId = String(f.vehicleId ?? f.vehicle_id ?? body.vehicleId ?? "").trim();
          if (!vehicleId) return c.json({ error: "vehicleId is required on each finding" }, 400);
          const statusRaw = String(f.status ?? "pass").trim();
          const status = ["pass", "attention", "fail"].includes(statusRaw) ? statusRaw : "pass";
          const woParsed = parseOptionalUuidField(f.workOrderId ?? f.work_order_id ?? body.workOrderId);
          if (!woParsed.ok) return c.json({ error: "Invalid workOrderId" }, 400);
          const itemParsed = parseOptionalUuidField(f.itemId ?? f.item_id);
          if (!itemParsed.ok) return c.json({ error: "Invalid itemId" }, 400);
          const systemParsed = parseOptionalUuidField(f.systemId ?? f.system_id);
          if (!systemParsed.ok) return c.json({ error: "Invalid systemId" }, 400);
          const componentParsed = parseOptionalUuidField(f.componentId ?? f.component_id);
          if (!componentParsed.ok) return c.json({ error: "Invalid componentId" }, 400);
          const declined = f.declined === true;

          let recommended_line_id: string | null = null;
          if ((status === "attention" || status === "fail") && !declined && woParsed.value) {
            const lineRow = mapApiLineToDb({
              systemId: systemParsed.value,
              componentId: componentParsed.value,
              systemCode: f.systemCode ?? f.system_code,
              systemName: f.systemName ?? f.system_name,
              categoryCode: f.componentCode ?? f.component_code ?? f.categoryCode,
              categoryName: f.componentName ?? f.component_name ?? f.categoryName ?? f.label,
              action: f.action ?? "inspect",
              recommended: true,
              declined: false,
              notes: f.notes != null ? String(f.notes) : null,
            }, 999, woParsed.value);
            const { data: insLine, error: lineInsErr } = await supabase
              .from("maintenance_work_order_lines")
              .insert(lineRow)
              .select("id")
              .single();
            if (lineInsErr) throw lineInsErr;
            recommended_line_id = insLine?.id != null ? String(insLine.id) : null;
          }

          const findingRow = {
            organization_id: orgId,
            vehicle_id: vehicleId,
            work_order_id: woParsed.value,
            item_id: itemParsed.value,
            system_id: systemParsed.value,
            component_id: componentParsed.value,
            status,
            notes: f.notes != null ? String(f.notes) : null,
            photo_url: f.photoUrl != null
              ? String(f.photoUrl)
              : (f.photo_url != null ? String(f.photo_url) : null),
            recommended_line_id,
            declined,
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error: insErr } = await supabase
            .from("maintenance_inspection_findings")
            .insert(findingRow)
            .select()
            .single();
          if (insErr) throw insErr;
          created.push({
            id: inserted.id,
            organizationId: inserted.organization_id,
            vehicleId: inserted.vehicle_id,
            workOrderId: inserted.work_order_id,
            itemId: inserted.item_id,
            systemId: inserted.system_id,
            componentId: inserted.component_id,
            status: inserted.status,
            notes: inserted.notes,
            photoUrl: inserted.photo_url,
            declined: inserted.declined === true,
            recommendedLineId: inserted.recommended_line_id,
          });
        }

        return c.json({ items: created });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/make-server-37f42386/maintenance-inspection-findings/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_inspection_findings")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Not found" }, 404);

        const declined = body.declined === true || body.decline === true;
        if (body.declined === undefined && body.decline === undefined) {
          return c.json({ error: "Set declined: true to decline a finding" }, 400);
        }

        const patch: Record<string, unknown> = {
          declined,
          updated_at: new Date().toISOString(),
        };
        if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes);

        // When declining, mark linked recommended line as declined
        if (declined && existing.recommended_line_id) {
          await supabase
            .from("maintenance_work_order_lines")
            .update({ declined: true, updated_at: new Date().toISOString() })
            .eq("id", existing.recommended_line_id);
        }

        const { data: updated, error: upErr } = await supabase
          .from("maintenance_inspection_findings")
          .update(patch)
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        return c.json({
          item: {
            id: updated.id,
            organizationId: updated.organization_id,
            vehicleId: updated.vehicle_id,
            workOrderId: updated.work_order_id,
            itemId: updated.item_id,
            systemId: updated.system_id,
            componentId: updated.component_id,
            status: updated.status,
            notes: updated.notes,
            photoUrl: updated.photo_url,
            declined: updated.declined === true,
            recommendedLineId: updated.recommended_line_id,
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /**
   * Daily overdue/due-soon digest → idempotent in-app alerts.
   * Authorize with X-Fleet-Cron-Secret or X-Rides-Cron-Secret.
   */
  route.post(
    "/make-server-37f42386/maintenance/overdue-digest",
    async (c) => {
      try {
        const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
        if (!secret) return c.json({ error: "Cron secret not configured" }, 503);
        const hdr =
          c.req.header("X-Fleet-Cron-Secret") || c.req.header("X-Rides-Cron-Secret");
        if (hdr !== secret) return c.json({ error: "Unauthorized" }, 401);

        const today = todayIso();
        const { data: schedules, error: schErr } = await supabase
          .from("vehicle_maintenance_schedule")
          .select(
            "organization_id, vehicle_id, template_id, next_due_miles, next_due_miles_max, next_due_date, schedule_status",
          )
          .neq("schedule_status", "fulfilled");
        if (schErr) throw schErr;

        const templateIds = [
          ...new Set(
            (schedules || [])
              .map((s) => (s.template_id != null ? String(s.template_id) : ""))
              .filter(Boolean),
          ),
        ];
        const { data: tplRows } = templateIds.length
          ? await supabase.from("maintenance_task_templates").select("id, task_name").in("id", templateIds)
          : { data: [] as { id: string; task_name?: string | null }[] };
        const tplName: Record<string, string> = {};
        for (const t of tplRows || []) {
          tplName[String(t.id)] = String(t.task_name ?? "").trim() || "Service";
        }

        const orgVehicleIds = new Map<string, Set<string>>();
        for (const s of schedules || []) {
          const org = String(s.organization_id ?? "");
          const vid = String(s.vehicle_id ?? "");
          if (!org || !vid) continue;
          if (!orgVehicleIds.has(org)) orgVehicleIds.set(org, new Set());
          orgVehicleIds.get(org)!.add(vid);
        }

        const odoByOrgVehicle = new Map<string, number>();
        for (const [orgId, vids] of orgVehicleIds) {
          for (const vid of vids) {
            const vehicle = await kv.get(`vehicle:${vid}`);
            if (!vehicle || typeof vehicle !== "object") {
              odoByOrgVehicle.set(`${orgId}:${vid}`, 0);
              continue;
            }
            const v = vehicle as Record<string, unknown>;
            const odo = Number(v.odometer ?? v.currentOdometer ?? 0);
            odoByOrgVehicle.set(`${orgId}:${vid}`, Number.isFinite(odo) ? odo : 0);
          }
        }

        let created = 0;
        let skipped = 0;
        for (const s of schedules || []) {
          const orgId = String(s.organization_id ?? "");
          const vehicleId = String(s.vehicle_id ?? "");
          const templateId = s.template_id != null ? String(s.template_id) : "";
          if (!orgId || !vehicleId || !templateId) continue;

          const odo = odoByOrgVehicle.get(`${orgId}:${vehicleId}`) ?? 0;
          const analysis = analyzeMaintenanceScheduleRow(
            odo,
            today,
            s.next_due_miles != null ? Number(s.next_due_miles) : null,
            s.next_due_miles_max != null ? Number(s.next_due_miles_max) : null,
            s.next_due_date != null ? String(s.next_due_date) : null,
            s.schedule_status != null ? String(s.schedule_status) : "active",
          );
          if (analysis.status !== "overdue" && analysis.status !== "pending") {
            skipped++;
            continue;
          }

          const alertId = `maint-overdue:${orgId}:${vehicleId}:${templateId}:${today}`;
          const key = `alert:${alertId}`;
          const existing = await kv.get(key);
          if (existing) {
            skipped++;
            continue;
          }

          const taskName = tplName[templateId] || "Service";
          const kind = analysis.status === "overdue" ? "overdue" : "due_soon";
          const alert = {
            id: alertId,
            organizationId: orgId,
            type: "maintenance_schedule",
            severity: kind === "overdue" ? "high" : "medium",
            title: kind === "overdue" ? `Overdue: ${taskName}` : `Due soon: ${taskName}`,
            message: `${taskName} is ${kind === "overdue" ? "overdue" : "due soon"} for vehicle ${vehicleId}. Open Fleet Maintenance to schedule or log service.`,
            vehicleId,
            templateId,
            taskName,
            kind,
            deepLink: "fleet-maintenance",
            timestamp: new Date().toISOString(),
            isRead: false,
          };
          await kv.set(key, alert);
          created++;
        }

        return c.json({ success: true, today, created, skipped, scanned: (schedules || []).length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance overdue-digest]", e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
