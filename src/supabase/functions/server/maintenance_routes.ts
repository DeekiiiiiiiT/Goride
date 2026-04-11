/**
 * Maintenance schedule API (Postgres) — templates, per-vehicle schedule, records.
 * Registered from index.tsx with service-role Supabase client.
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";

function assertVehicleCatalogPlatformAccess(c: Context) {
  const rbacUser = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
  const role = rbacUser?.resolvedRole || rbacUser?.role;
  if (role !== "platform_owner" && role !== "superadmin" && role !== "platform_support") {
    return c.json({ error: "Only platform owner or support can manage maintenance templates" }, 403);
  }
  return null;
}

function addMonthsIso(ymd: string, months: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeScheduleRowStatus(
  currentOdo: number,
  today: string,
  nextMiles: number | null,
  nextDate: string | null,
): "ok" | "pending" | "overdue" {
  const dueMiles = nextMiles != null && currentOdo >= nextMiles;
  const overdueMiles = nextMiles != null && currentOdo > nextMiles;
  const dueDate = nextDate != null && today >= nextDate;
  const overdueDate = nextDate != null && today > nextDate;
  if (overdueMiles || overdueDate) return "overdue";
  if (dueMiles || dueDate) return "pending";
  return "ok";
}

function aggregateFleetStatus(
  rows: Array<{ status: "ok" | "pending" | "overdue" }>,
): "Healthy" | "Due Soon" | "Overdue" {
  if (rows.some((r) => r.status === "overdue")) return "Overdue";
  if (rows.some((r) => r.status === "pending")) return "Due Soon";
  return "Healthy";
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
      const catalogId = c.req.param("catalogId");
      try {
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("vehicle_catalog_id", catalogId)
          .order("sort_order", { ascending: true })
          .order("task_name", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
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
      const catalogId = c.req.param("catalogId");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const task_name = String(body.task_name ?? "").trim();
        if (!task_name) return c.json({ error: "task_name is required" }, 400);
        const row = {
          vehicle_catalog_id: catalogId,
          task_name,
          description: body.description != null ? String(body.description) : null,
          interval_miles: body.interval_miles != null && body.interval_miles !== ""
            ? Number(body.interval_miles)
            : null,
          interval_months: body.interval_months != null && body.interval_months !== ""
            ? Number(body.interval_months)
            : null,
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
        if (body.description !== undefined) patch.description = body.description;
        if (body.interval_miles !== undefined) {
          patch.interval_miles = body.interval_miles === "" || body.interval_miles == null
            ? null
            : Number(body.interval_miles);
        }
        if (body.interval_months !== undefined) {
          patch.interval_months = body.interval_months === "" || body.interval_months == null
            ? null
            : Number(body.interval_months);
        }
        if (body.priority !== undefined) patch.priority = String(body.priority);
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
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
          const st = computeScheduleRowStatus(currentOdo, today, nextMiles, nextDate);
          const tid = String(row.template_id ?? "");
          return { ...row, template: tplById[tid] || null, computed_status: st };
        });

        const fleetStatus = enriched.length
          ? aggregateFleetStatus(enriched.map((r: { computed_status: string }) => ({
            status: r.computed_status as "ok" | "pending" | "overdue",
          })))
          : "Healthy";

        const minNextMiles = enriched
          .map((r: Record<string, unknown>) =>
            r.next_due_miles != null ? Number(r.next_due_miles) : Infinity
          )
          .reduce((a: number, b: number) => Math.min(a, b), Infinity);
        const nextOdo = minNextMiles === Infinity ? currentOdo + 5000 : minNextMiles;
        const remainingKm = Math.max(0, nextOdo - currentOdo);
        const daysToService = Math.max(0, Math.ceil(remainingKm / 50));

        const nextTypeLabel = enriched.find((r: Record<string, unknown>) =>
          r.next_due_miles != null && Number(r.next_due_miles) === minNextMiles
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

        const { data: templates, error: tErr } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("vehicle_catalog_id", catalogId);
        if (tErr) throw tErr;
        if (!templates?.length) return c.json({ created: 0, message: "No templates for this catalog row" });

        let created = 0;
        for (const t of templates) {
          const intM = t.interval_miles != null ? Number(t.interval_miles) : null;
          const intMo = t.interval_months != null ? Number(t.interval_months) : null;
          let nextMiles: number | null = intM != null ? currentOdo + intM : null;
          let nextDate: string | null = intMo != null ? addMonthsIso(today, intMo) : null;
          const row = {
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: t.id,
            last_performed_miles: currentOdo,
            last_performed_date: today,
            next_due_miles: nextMiles,
            next_due_date: nextDate,
            updated_at: new Date().toISOString(),
          };
          const { error } = await supabase.from("vehicle_maintenance_schedule").upsert(row, {
            onConflict: "organization_id,vehicle_id,template_id",
          });
          if (!error) created++;
        }
        return c.json({ created, catalogId });
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
            const intM = template.interval_miles != null ? Number(template.interval_miles) : null;
            const intMo = template.interval_months != null ? Number(template.interval_months) : null;
            let nextMiles: number | null = intM != null ? performed_at_miles + intM : null;
            let nextDate: string | null = intMo != null ? addMonthsIso(performed_at_date, intMo) : null;
            await supabase
              .from("vehicle_maintenance_schedule")
              .update({
                last_performed_miles: performed_at_miles,
                last_performed_date: performed_at_date,
                next_due_miles: nextMiles,
                next_due_date: nextDate,
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
          .select("vehicle_id, next_due_miles, next_due_date, template_id")
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
            return computeScheduleRowStatus(odo, today, nextMiles, nextDate);
          });
          const st = sch.length ? aggregateFleetStatus(statuses.map((s) => ({ status: s }))) : "Healthy";
          const minM = sch
            .map((r) => r.next_due_miles != null ? Number(r.next_due_miles) : Infinity)
            .reduce((a, b) => Math.min(a, b), Infinity);
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
