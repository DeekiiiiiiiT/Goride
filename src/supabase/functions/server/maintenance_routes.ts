/**
 * Maintenance schedule API (Postgres) — templates, per-vehicle schedule, records.
 * Registered from index.tsx with service-role Supabase client.
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import { advanceAfterService, computeInitialScheduleRow } from "./maintenance_schedule_engine.ts";

function assertVehicleCatalogPlatformAccess(c: Context) {
  const rbacUser = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
  const role = rbacUser?.resolvedRole || rbacUser?.role;
  if (role !== "platform_owner" && role !== "superadmin" && role !== "platform_support") {
    return c.json({ error: "Only platform owner or support can manage maintenance templates" }, 403);
  }
  return null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeScheduleRowStatus(
  currentOdo: number,
  today: string,
  nextMiles: number | null,
  nextDate: string | null,
  scheduleRowStatus?: string | null,
): "ok" | "pending" | "overdue" | "fulfilled" {
  if (scheduleRowStatus === "fulfilled") return "fulfilled";
  const dueMiles = nextMiles != null && currentOdo >= nextMiles;
  const overdueMiles = nextMiles != null && currentOdo > nextMiles;
  const dueDate = nextDate != null && today >= nextDate;
  const overdueDate = nextDate != null && today > nextDate;
  if (overdueMiles || overdueDate) return "overdue";
  if (dueMiles || dueDate) return "pending";
  return "ok";
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

function normalizeMaintenanceTaskName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merge key: `task_code` when set, else normalized `task_name` (catalog wins on collision). */
function maintenanceTemplateMergeKey(t: { task_code?: unknown; task_name?: unknown }): string {
  const code = t.task_code != null ? String(t.task_code).trim() : "";
  if (code.length > 0) return `code:${code}`;
  return `name:${normalizeMaintenanceTaskName(String(t.task_name ?? ""))}`;
}

type MaintenanceTemplateRow = Record<string, unknown> & {
  id: string;
  template_scope?: string;
};

function mergeGlobalAndCatalogTemplates(
  globalRows: MaintenanceTemplateRow[],
  catalogRows: MaintenanceTemplateRow[],
): { merged: MaintenanceTemplateRow[]; catalogOverridesGlobal: number } {
  const merged = new Map<string, MaintenanceTemplateRow>();
  let catalogOverridesGlobal = 0;
  for (const g of globalRows) {
    merged.set(maintenanceTemplateMergeKey(g), g);
  }
  for (const c of catalogRows) {
    const k = maintenanceTemplateMergeKey(c);
    const prev = merged.get(k);
    if (prev && String(prev.template_scope ?? "catalog") === "global") {
      catalogOverridesGlobal++;
    }
    merged.set(k, c);
  }
  const list = [...merged.values()];
  list.sort((a, b) => {
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.task_name ?? "").localeCompare(String(b.task_name ?? ""));
  });
  return { merged: list, catalogOverridesGlobal };
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

  async function resolveVehicleCatalogId(
    make: string,
    model: string,
    yearStr: string,
  ): Promise<string | null> {
    const year = parseInt(yearStr, 10);
    if (!Number.isFinite(year)) return null;
    const m = make.trim().toLowerCase();
    const mo = model.trim().toLowerCase();
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("id, make, model, year")
      .eq("year", year);
    if (error || !data?.length) return null;
    const row = data.find(
      (r: { make?: string; model?: string }) =>
        String(r.make ?? "").trim().toLowerCase() === m &&
        String(r.model ?? "").trim().toLowerCase() === mo,
    );
    return row ? (row as { id: string }).id : null;
  }

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
        const make = String(v.make ?? "");
        const model = String(v.model ?? "");
        const year = String(v.year ?? "");
        const currentOdo = Number(v.metrics && typeof v.metrics === "object"
          ? (v.metrics as { odometer?: number }).odometer
          : 0) || 0;
        const catalogId = await resolveVehicleCatalogId(make, model, year);
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
          const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
          const schRowStatus = row.schedule_status != null ? String(row.schedule_status) : "active";
          const st = computeScheduleRowStatus(currentOdo, today, nextMiles, nextDate, schRowStatus);
          const tid = String(row.template_id ?? "");
          return { ...row, template: tplById[tid] || null, computed_status: st };
        });

        const fleetStatus = enriched.length
          ? aggregateFleetStatus(enriched.map((r: { computed_status: string }) => ({
            status: r.computed_status as "ok" | "pending" | "overdue" | "fulfilled",
          })))
          : "Healthy";

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
        const make = String(v.make ?? "");
        const model = String(v.model ?? "");
        const year = String(v.year ?? "");
        const catalogId = await resolveVehicleCatalogId(make, model, year);
        if (!catalogId) return c.json({ error: "No vehicle catalog match for make/model/year", catalogMatched: false }, 400);
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const currentOdo = body.currentOdometer != null
          ? Number(body.currentOdometer)
          : Number((v.metrics as { odometer?: number })?.odometer ?? 0) || 0;
        const today = todayIso();

        const { data: globalTemplates, error: gErr } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("template_scope", "global");
        if (gErr) throw gErr;
        const { data: catalogTemplates, error: cErr } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("vehicle_catalog_id", catalogId)
          .eq("template_scope", "catalog");
        if (cErr) throw cErr;
        const { merged: templates, catalogOverridesGlobal } = mergeGlobalAndCatalogTemplates(
          (globalTemplates || []) as MaintenanceTemplateRow[],
          (catalogTemplates || []) as MaintenanceTemplateRow[],
        );
        const globalApplied = templates.filter((t) => String(t.template_scope ?? "") === "global").length;
        const catalogApplied = templates.filter((t) => String(t.template_scope ?? "") === "catalog").length;
        if (!templates.length) {
          return c.json({
            created: 0,
            message: "No global or catalog templates for this vehicle",
            catalogId,
            globalApplied: 0,
            catalogApplied: 0,
            skippedDuplicates: 0,
          });
        }

        let created = 0;
        const bootstrapErrors: string[] = [];
        for (const t of templates) {
          const computed = computeInitialScheduleRow(t as Record<string, unknown>, currentOdo, today);
          if (!computed.ok) {
            bootstrapErrors.push(`${(t as { task_name?: string }).task_name ?? t.id}: ${computed.reason}`);
            continue;
          }
          const row = {
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: t.id,
            last_performed_miles: currentOdo,
            last_performed_date: today,
            next_due_miles: computed.next_due_miles,
            next_due_date: computed.next_due_date,
            schedule_status: computed.schedule_status,
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from("vehicle_maintenance_schedule").upsert(row, {
            onConflict: "organization_id,vehicle_id,template_id",
          });
          if (!error) created++;
        }
        if (bootstrapErrors.length && created === 0) {
          return c.json({ error: bootstrapErrors.join("; "), catalogId, created: 0 }, 400);
        }
        return c.json({
          created,
          catalogId,
          globalApplied,
          catalogApplied,
          skippedDuplicates: catalogOverridesGlobal,
          warnings: bootstrapErrors.length ? bootstrapErrors : undefined,
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
    async (c) => {
      try {
        const log = (await c.req.json()) as Record<string, unknown>;
        const vehicleId = String(log.vehicleId ?? "");
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const id = String(log.id || crypto.randomUUID());
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const performed_at_date = String(log.date ?? todayIso()).slice(0, 10);
        const performed_at_miles = Number(log.odo ?? 0);
        const templateId = log.templateId != null ? String(log.templateId) : null;

        const rowInsert = {
          id,
          organization_id: orgId,
          vehicle_id: vehicleId,
          template_id: templateId || null,
          performed_at_miles,
          performed_at_date,
          cost: log.cost != null ? Number(log.cost) : null,
          service_type: log.type != null ? String(log.type) : null,
          provider: log.provider != null ? String(log.provider) : null,
          notes: log.notes != null ? String(log.notes) : null,
          invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
          status: log.status != null ? String(log.status) : "Completed",
          legacy_kv_id: null as string | null,
          payload_json: { ...log, id, vehicleId } as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert(rowInsert)
          .select()
          .single();
        if (insErr) throw insErr;

        // Advance schedule if template linked
        if (templateId) {
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
                next_due_date: adv.next_due_date,
                schedule_status: adv.schedule_status,
                updated_at: new Date().toISOString(),
              })
              .eq("organization_id", orgId)
              .eq("vehicle_id", vehicleId)
              .eq("template_id", templateId);
          }
        }

        return c.json({ success: true, data: inserted });
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
        return c.json({ success: true });
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

        const { data: schedules } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("vehicle_id, next_due_miles, next_due_date, template_id, schedule_status")
          .eq("organization_id", orgId);

        const byVehicle: Record<string, Record<string, unknown>[]> = {};
        for (const s of schedules || []) {
          const vid = s.vehicle_id as string;
          if (!byVehicle[vid]) byVehicle[vid] = [];
          byVehicle[vid].push(s as Record<string, unknown>);
        }

        const items = vehicles.map((v: Record<string, unknown>) => {
          const vid = String(v.id ?? "");
          const odo = Number((v.metrics as { odometer?: number })?.odometer ?? 0);
          const sch = byVehicle[vid] || [];
          const today = todayIso();
          const statuses = sch.map((row) => {
            const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
            const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
            const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
            return computeScheduleRowStatus(odo, today, nextMiles, nextDate, schSt);
          });
          const st = sch.length ? aggregateFleetStatus(statuses.map((s) => ({ status: s }))) : "Healthy";
          const eligibleForNext = sch.filter((r) => String(r.schedule_status ?? "active") !== "fulfilled");
          const minM = eligibleForNext.length
            ? eligibleForNext
              .map((r) => r.next_due_miles != null ? Number(r.next_due_miles) : Infinity)
              .reduce((a, b) => Math.min(a, b), Infinity)
            : Infinity;
          const nextOdo = minM === Infinity ? null : minM;
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
          };
        });

        return c.json({ items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
