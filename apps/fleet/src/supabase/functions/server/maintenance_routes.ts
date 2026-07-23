/**
 * Maintenance schedule API (Postgres) — templates, per-vehicle schedule, records.
 * Registered from index.tsx with service-role Supabase client.
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { advanceAfterService, computeInitialScheduleRow } from "./maintenance_schedule_engine.ts";
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

export function registerMaintenanceRoutes(app: { get: unknown; post: unknown; patch: unknown; delete: unknown }, supabase: SupabaseClient) {
  const route = app as {
    get: (path: string, ...handlers: unknown[]) => void;
    post: (path: string, ...handlers: unknown[]) => void;
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
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
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
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
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
        const tplById: Record<string, Record<string, unknown>> = {};
        for (const t of tplRows || []) tplById[String((t as { id: string }).id)] = t as Record<string, unknown>;

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

        const currencyRaw = log.currency != null ? String(log.currency).trim().toUpperCase() : "JMD";
        const currency = currencyRaw || "JMD";
        const status = log.status != null ? String(log.status) : "Completed";

        const rowInsert = {
          id,
          organization_id: orgId,
          vehicle_id: vehicleId,
          template_id: templateId || null,
          performed_at_miles,
          performed_at_date,
          cost: log.cost != null ? Number(log.cost) : null,
          currency,
          service_type: log.type != null ? String(log.type) : null,
          provider: log.provider != null ? String(log.provider) : null,
          notes: log.notes != null ? String(log.notes) : null,
          invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
          status,
          legacy_kv_id: null as string | null,
          payload_json: { ...log, id, vehicleId, currency, status } as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert(rowInsert)
          .select()
          .single();
        if (insErr) throw insErr;

        // Advance schedule if template linked and this is a completed service
        if (templateId && String(status).trim().toLowerCase() === "completed") {
          const { data: template } = await supabase
            .from("maintenance_task_templates")
            .select("*")
            .eq("id", templateId)
            .maybeSingle();
          if (template) {
            const adv = advanceAfterService(template as Record<string, unknown>, performed_at_miles, performed_at_date);
            await supabase
              .from("vehicle_maintenance_schedule")
              .update({
                last_performed_miles: performed_at_miles,
                last_performed_date: performed_at_date,
                next_due_miles: adv.next_due_miles,
                next_due_miles_max: adv.next_due_miles_max,
                next_due_date: adv.next_due_date,
                schedule_status: adv.schedule_status,
                updated_at: new Date().toISOString(),
              })
              .eq("organization_id", orgId)
              .eq("vehicle_id", vehicleId)
              .eq("template_id", templateId);
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
        return c.json({
          success: true,
          data: inserted,
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
        const cost = body.cost !== undefined
          ? (body.cost != null ? Number(body.cost) : null)
          : (existing.cost != null ? Number(existing.cost) : null);
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

        const prevPayload = (existing.payload_json && typeof existing.payload_json === "object")
          ? existing.payload_json as Record<string, unknown>
          : {};
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
        if (becameCompleted && templateId) {
          const { data: template } = await supabase
            .from("maintenance_task_templates")
            .select("*")
            .eq("id", templateId)
            .maybeSingle();
          if (template) {
            const adv = advanceAfterService(template as Record<string, unknown>, performed_at_miles, performed_at_date);
            await supabase
              .from("vehicle_maintenance_schedule")
              .update({
                last_performed_miles: performed_at_miles,
                last_performed_date: performed_at_date,
                next_due_miles: adv.next_due_miles,
                next_due_miles_max: adv.next_due_miles_max,
                next_due_date: adv.next_due_date,
                schedule_status: adv.schedule_status,
                updated_at: new Date().toISOString(),
              })
              .eq("organization_id", orgId)
              .eq("vehicle_id", vehicleId)
              .eq("template_id", templateId);
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

        // Never post Requested rows to the ledger
        return c.json({ success: true, data: inserted });
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
        const items = vehicles.map((v: Record<string, unknown>) => {
          const vid = String(v.id ?? "");
          const metricsBase = Number((v.metrics as { odometer?: number })?.odometer ?? 0);
          const odo = canonicalOdometerFromMaps(vid, metricsBase, odoMaps);
          const sch = byVehicle[vid] || [];
          const attention: FleetServiceAttentionItem[] = [];
          let maxCalendarDaysOverdue: number | null = null;
          let maxKmOverdue: number | null = null;

          const statuses = sch.map((row) => {
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
            if (a.status === "overdue") attention.push({ kind: "overdue", taskName });
            else if (a.status === "pending") attention.push({ kind: "due_soon", taskName });
            return a.status;
          });
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
        });

        return c.json({ items });
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
