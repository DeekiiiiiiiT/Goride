/**
 * Maintenance master governance routes (§2 server layer).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import {
  assertCatalogGovernResponse,
  assertCatalogWriteResponse,
  bodyRequestsGovernActivation,
  catalogActorId,
  governWriteOrProposal,
} from "./catalog_access.ts";
import { getOrgId } from "./org_scope.ts";
import { isMaintenanceMasterGovernanceEnabled } from "./maintenance_master_flag.ts";
import { ROAM_POLICY_STARTER_SET, matchCategoryId } from "./maintenance_master_starter.ts";
import { enrichMaintenanceDueItems, fetchScheduleExplain } from "./maintenance_master_fleet_enrich.ts";
import { fleetDb } from "./repos/baseRepo.ts";
import {
  MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS,
  registerMaintenanceJobsAdminRoutes,
} from "./maintenance_jobs_admin_routes.ts";

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function denyIfGovernanceOff(c: Context, supabase: SupabaseClient): Promise<Response | null> {
  if (!(await isMaintenanceMasterGovernanceEnabled(supabase))) {
    return c.json({ error: "Not found" }, 404);
  }
  return null;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function normalizeSchedulePosition(position: string | null | undefined): string | null {
  if (position == null || position === "") return null;
  return String(position);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterScheduleByPosition(query: any, position: string | null | undefined) {
  const pos = normalizeSchedulePosition(position);
  if (pos === null) return query.is("position", null);
  return query.eq("position", pos);
}

function intervalChangedRevision(oldRow: Record<string, unknown>, newRow: Record<string, unknown>): boolean {
  const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const km = (r: Record<string, unknown>) => n(r.interval_km);
  return km(oldRow) !== km(newRow) || n(oldRow.interval_months) !== n(newRow.interval_months);
}

/** How an approved support request is applied (same routes the owner uses). */
export function proposalReplay(
  action: string,
  entityId: string,
  payload: Record<string, unknown>,
): { method: string; path: string; body?: Record<string, unknown> } | null {
  if (action === "create_active_rule") return { method: "POST", path: "/admin/maintenance/rules", body: payload };
  if (action === "patch_rule") return { method: "PATCH", path: `/admin/maintenance/rules/${entityId}`, body: payload };
  if (action === "retire_rule") return { method: "POST", path: `/admin/maintenance/rules/${entityId}/retire` };
  return null;
}

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

export function registerMaintenanceMasterRoutes(route: RouteApp, supabase: SupabaseClient): void {
  route.get("/admin/platform-feature-flags/maintenance_master_governance", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const enabled = await isMaintenanceMasterGovernanceEnabled(supabase);
      return c.json({ name: "maintenance_master_governance", enabled });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/rules", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const scope = c.req.query("scope");
      let q = supabase
        .from("maintenance_task_templates")
        .select("*")
        .not("component_id", "is", null)
        .is("archived_at", null);
      if (scope) q = q.eq("template_scope", scope);
      const { data, error } = await q.order("task_name");
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/rules", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      if (bodyRequestsGovernActivation(body)) {
        return governWriteOrProposal(
          c,
          supabase,
          {
            entityTable: "maintenance_task_templates",
            entityId: String(body.id ?? "new"),
            action: "create_active_rule",
            payload: body,
          },
          async () => {
            const governDenied = assertCatalogGovernResponse(c);
            if (governDenied) return governDenied;
            return c.json({ error: "Use draft status or proposal flow" }, 400);
          },
        );
      }
      const row = mapRuleBodyToRow(body);
      const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.patch("/admin/maintenance/rules/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const { data: existing } = await supabase.from("maintenance_task_templates").select("status").eq("id", id).maybeSingle();
      const needsGovern = bodyRequestsGovernActivation(body) ||
        String((existing as { status?: string } | null)?.status ?? "") === "active";
      if (needsGovern) {
        return governWriteOrProposal(
          c,
          supabase,
          { entityTable: "maintenance_task_templates", entityId: id, action: "patch_rule", payload: body },
          async () => saveRuleAndRecompute(c, supabase, id, body),
        );
      }
      const patch = mapRuleBodyToRow(body, true);
      const { data, error } = await supabase.from("maintenance_task_templates").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/rules/:id/impact", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const { data: rule, error: rErr } = await supabase.from("maintenance_task_templates").select("*").eq("id", id).maybeSingle();
      if (rErr) throw rErr;
      if (!rule) return c.json({ error: "Not found" }, 404);
      const { data: impact, error } = await supabase.rpc("maintenance_rule_impact", { p_rule: rule });
      if (error) throw error;
      return c.json({ impact, rule });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/rules/:id/retire", requireAuth(), async (c: Context) => {
    return governWriteOrProposal(
      c,
      supabase,
      {
        entityTable: "maintenance_task_templates",
        entityId: c.req.param("id"),
        action: "retire_rule",
        payload: {},
      },
      async () => {
        const id = c.req.param("id");
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .update({ status: "retired", archived_at: now, updated_at: now })
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
          await supabase.rpc("recompute_component_schedules_for_rule", { p_rule_id: id });
        }
        return c.json({ item: data });
      },
    );
  });

  route.get("/admin/maintenance/preview", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const car = String(c.req.query("car") ?? "").trim();
    if (!isUuid(car)) return c.json({ error: "car query must be a vehicle_catalog uuid" }, 400);
    const severe = c.req.query("severe") === "1" || c.req.query("severe") === "true";
    try {
      const { data: cat, error: catErr } = await supabase
        .from("vehicle_catalog")
        .select("id, make, model, chassis_code, platform_id, engine_family_id, vehicle_class, production_start_year, production_end_year")
        .eq("id", car)
        .maybeSingle();
      if (catErr) throw catErr;
      if (!cat) return c.json({ error: "Catalog car not found" }, 404);
      let platformFamilyId: string | null = null;
      if (cat.platform_id) {
        const { data: plat } = await supabase
          .from("vehicle_platform")
          .select("parent_id")
          .eq("id", cat.platform_id)
          .maybeSingle();
        platformFamilyId = (plat as { parent_id?: string | null } | null)?.parent_id ?? null;
      }
      const vehicleClass = String(cat.vehicle_class ?? "car").toLowerCase();
      const vehicleYear = cat.production_start_year != null ? Number(cat.production_start_year) : null;
      const { data: components, error: compErr } = await supabase
        .from("maintenance_service_categories")
        .select("id, code, name, op_code, icon_key")
        .eq("kind", "component")
        .eq("status", "active")
        .order("sort_order");
      if (compErr) throw compErr;
      const items: Record<string, unknown>[] = [];
      const notOnCar: Record<string, unknown>[] = [];
      for (const comp of components || []) {
        const componentId = String(comp.id);
        const { data: activeRule } = await supabase.rpc("mm_pick_part_rule", {
          p_component_id: componentId,
          p_catalog_id: car,
          p_platform_id: cat.platform_id,
          p_platform_family_id: platformFamilyId,
          p_engine_family_id: cat.engine_family_id,
          p_vehicle_class: vehicleClass,
          p_vehicle_year: vehicleYear,
          p_statuses: ["active", "needs_checking"],
        });
        const { data: globalRow } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("component_id", componentId)
          .eq("template_scope", "global")
          .eq("status", "active")
          .is("archived_at", null)
          .maybeSingle();
        const { data: notOn } = await supabase
          .from("catalog_component_applicability")
          .select("reason")
          .eq("component_id", componentId)
          .eq("applicable", false)
          .or(`vehicle_catalog_id.eq.${car},platform_id.eq.${cat.platform_id}`)
          .limit(1);
        if (notOn?.length) {
          notOnCar.push({
            component_id: componentId,
            component_name: comp.name,
            task_name: comp.name,
            reason: String((notOn[0] as { reason?: string }).reason ?? "Not on this car"),
          });
          continue;
        }
        const rule = activeRule as Record<string, unknown> | null;
        if (!rule?.id) continue;
        const global = globalRow as Record<string, unknown> | null;
        const globalScope = String(global?.template_scope ?? "");
        const winsScope = String(rule.template_scope ?? "");
        const insteadOf =
          winsScope !== "global" && globalScope === "global"
            ? global
            : null;
        let intervalKm = rule.interval_km != null ? Number(rule.interval_km) : null;
        let intervalMonths = rule.interval_months != null ? Number(rule.interval_months) : null;
        if (severe) {
          if (rule.severe_interval_km != null) intervalKm = Number(rule.severe_interval_km);
          if (rule.severe_interval_months != null) intervalMonths = Number(rule.severe_interval_months);
        }
        items.push({
          component_id: componentId,
          component_name: comp.name,
          task_name: comp.name,
          template_scope: rule.template_scope,
          source_type: rule.source_type,
          status: rule.status,
          interval_km: intervalKm,
          interval_months: intervalMonths,
          instead_of_km: insteadOf?.interval_km ?? null,
          instead_of_months: insteadOf?.interval_months ?? null,
          rule_id: rule.id,
        });
      }
      return c.json({
        catalog: cat,
        severe_duty: severe,
        items,
        not_on_car: notOnCar,
      });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/summary", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { data: rules, error: rErr } = await supabase
        .from("maintenance_task_templates")
        .select("id, status, source_type, template_scope, component_id")
        .not("component_id", "is", null)
        .is("archived_at", null);
      if (rErr) throw rErr;
      const list = rules || [];
      const globalActive = list.filter((r) => String(r.template_scope) === "global" && r.status === "active").length;
      const specific = list.filter((r) => String(r.template_scope) !== "global").length;
      const bySource = { maker_manual: 0, part_maker: 0, roam_policy: 0 };
      for (const r of list) {
        const k = String(r.source_type ?? "roam_policy") as keyof typeof bySource;
        if (k in bySource) bySource[k]++;
      }
      const { count: reviewConflicts } = await supabase
        .from("maintenance_rule_conflict")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");
      const { count: needsChecking } = await supabase
        .from("maintenance_task_templates")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_checking")
        .not("component_id", "is", null);
      const { count: fleetCars } = await supabase
        .schema("fleet")
        .from("vehicles")
        .select("*", { count: "exact", head: true })
        .not("vehicle_catalog_id", "is", null);
      return c.json({
        partScheduleCount: list.length,
        globalActive,
        specificCount: specific,
        sourceCounts: bySource,
        reviewCount: (reviewConflicts ?? 0) + (needsChecking ?? 0),
        openConflicts: reviewConflicts ?? 0,
        fleetCarsUsingSchedules: fleetCars ?? 0,
      });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/review-list", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { data: conflicts, error: cErr } = await supabase
        .from("maintenance_rule_conflict")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;
      const { data: proposals, error: pErr } = await supabase
        .from("catalog_governance_proposal")
        .select("*")
        .eq("entity_table", "maintenance_task_templates")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;
      return c.json({ conflicts: conflicts || [], proposals: proposals || [] });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  // Owner approves a support request: replay it through the same route the owner would use,
  // so every existing rule (impact, review list, history) applies. Then mark it approved.
  route.post("/admin/maintenance/proposals/:id/approve", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      const { data: p, error } = await supabase
        .from("catalog_governance_proposal")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!p || String(p.status) !== "pending") return c.json({ error: "This request is no longer waiting." }, 409);
      const replay = proposalReplay(String(p.action), String(p.entity_id), (p.payload ?? {}) as Record<string, unknown>);
      if (!replay) return c.json({ error: "This kind of request can't be approved here." }, 400);
      const base = c.req.path.slice(0, c.req.path.indexOf("/admin/maintenance"));
      const app = route as unknown as {
        request: (path: string, init?: RequestInit, env?: unknown) => Promise<Response>;
      };
      const res = await app.request(
        `${base}${replay.path}`,
        { method: replay.method, headers: c.req.raw.headers, body: replay.body ? JSON.stringify(replay.body) : undefined },
        c.env,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return c.json({ error: body.error || "The change could not be applied." }, res.status as 400);
      }
      const { error: upErr } = await supabase
        .from("catalog_governance_proposal")
        .update({ status: "approved", reviewed_by: catalogActorId(c), reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) throw upErr;
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/proposals/:id/reject", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const note = String(body.note ?? "").trim();
      if (!note) return c.json({ error: "Say why you're rejecting it." }, 400);
      const { data, error } = await supabase
        .from("catalog_governance_proposal")
        .update({
          status: "rejected",
          review_note: note,
          reviewed_by: catalogActorId(c),
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", c.req.param("id"))
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "This request is no longer waiting." }, 409);
      return c.json({ success: true });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/part-schedules-index", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { data: rules, error: rErr } = await supabase
        .from("maintenance_task_templates")
        .select(
          "id, component_id, template_scope, status, source_type, confidence, interval_km, interval_months, updated_at, engine_family_id, platform_id, vehicle_catalog_id",
        )
        .not("component_id", "is", null)
        .is("archived_at", null);
      if (rErr) throw rErr;
      const { data: pkgLinks, error: pErr } = await supabase
        .from("maintenance_package_categories")
        .select("category_id, template:maintenance_task_templates(id, task_name, component_id)");
      if (pErr) throw pErr;
      const packagesByComponent = new Map<string, string[]>();
      for (const row of pkgLinks || []) {
        const tpl = (row as { template?: { component_id?: string | null; task_name?: string } }).template;
        if (tpl?.component_id) continue;
        const catId = String((row as { category_id?: string }).category_id ?? "");
        const name = String(tpl?.task_name ?? "");
        if (!catId || !name) continue;
        const list = packagesByComponent.get(catId) || [];
        if (!list.includes(name)) list.push(name);
        packagesByComponent.set(catId, list);
      }
      const byComponent = new Map<string, Record<string, unknown>[]>();
      for (const r of rules || []) {
        const cid = String(r.component_id ?? "");
        if (!cid) continue;
        const list = byComponent.get(cid) || [];
        list.push(r as Record<string, unknown>);
        byComponent.set(cid, list);
      }
      const items: Record<string, unknown>[] = [];
      for (const [componentId, list] of byComponent) {
        const global = list.find((r) => String(r.template_scope) === "global" && r.status === "active") ||
          list.find((r) => String(r.template_scope) === "global");
        const specific = list.filter((r) => String(r.template_scope) !== "global" && r.status !== "retired");
        const scopeChips = specific.slice(0, 4).map((r) => ({
          scope: r.template_scope,
          engine_family_id: r.engine_family_id,
          platform_id: r.platform_id,
          vehicle_catalog_id: r.vehicle_catalog_id,
        }));
        const lastChanged = list.reduce((max, r) => {
          const t = String(r.updated_at ?? "");
          return t > max ? t : max;
        }, "");
        items.push({
          component_id: componentId,
          global_rule_id: global?.id ?? null,
          interval_km: global?.interval_km ?? null,
          interval_months: global?.interval_months ?? null,
          source_type: global?.source_type ?? null,
          confidence: global?.confidence ?? null,
          status: global?.status ?? (list[0] as { status?: string })?.status ?? null,
          specific_count: specific.length,
          specific_scopes: scopeChips,
          package_names: packagesByComponent.get(componentId) || [],
          last_changed_at: lastChanged || null,
          rule_count: list.length,
        });
      }
      return c.json({ items });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance-categories/:id/usage", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    const id = c.req.param("id");
    if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
    try {
      const { count: scheduleCount } = await supabase
        .from("maintenance_task_templates")
        .select("*", { count: "exact", head: true })
        .eq("component_id", id)
        .is("archived_at", null);
      const { count: packageCount } = await supabase
        .from("maintenance_package_categories")
        .select("*", { count: "exact", head: true })
        .eq("category_id", id);
      const { count: inspectionCount } = await supabase
        .from("maintenance_task_templates")
        .select("*", { count: "exact", head: true })
        .eq("component_id", id)
        .eq("due_kind", "statutory_inspection")
        .is("archived_at", null);
      const { count: partsCount } = await supabase
        .from("part_master")
        .select("*", { count: "exact", head: true })
        .eq("maintenance_component_id", id);
      const { count: fleetCars } = await supabase
        .schema("fleet")
        .from("vehicles")
        .select("*", { count: "exact", head: true })
        .not("vehicle_catalog_id", "is", null);
      const { count: fleetWithPart } = await supabase
        .from("vehicle_component_schedule")
        .select("*", { count: "exact", head: true })
        .eq("category_id", id)
        .neq("schedule_status", "retired");
      return c.json({
        schedules: scheduleCount ?? 0,
        packages: packageCount ?? 0,
        inspections: inspectionCount ?? 0,
        partsInCatalogue: partsCount ?? 0,
        fleetCarsUsingPart: fleetWithPart ?? 0,
        fleetCarsTotal: fleetCars ?? 0,
      });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/scope-coverage", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const scope = String(c.req.query("scope") ?? "global");
      let q = supabase.from("vehicle_catalog").select("*", { count: "exact", head: true });
      if (scope === "variant") {
        const catalogId = String(c.req.query("vehicle_catalog_id") ?? "");
        if (!isUuid(catalogId)) return c.json({ count: 0 });
        q = q.eq("id", catalogId);
      } else if (scope === "platform") {
        const platformId = String(c.req.query("platform_id") ?? "");
        if (!isUuid(platformId)) return c.json({ count: 0 });
        q = q.eq("platform_id", platformId);
      } else if (scope === "engine_family") {
        const engineId = String(c.req.query("engine_family_id") ?? "");
        if (!isUuid(engineId)) return c.json({ count: 0 });
        q = q.eq("engine_family_id", engineId);
      }
      const yearFrom = c.req.query("year_from");
      const yearTo = c.req.query("year_to");
      if (yearFrom != null && yearFrom !== "") {
        q = q.gte("production_end_year", Number(yearFrom));
      }
      if (yearTo != null && yearTo !== "") {
        q = q.lte("production_start_year", Number(yearTo));
      }
      const { count, error } = await q;
      if (error) throw error;
      return c.json({ count: count ?? 0 });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/health", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { count: fleetCars } = await supabase
        .schema("fleet")
        .from("vehicles")
        .select("*", { count: "exact", head: true })
        .not("vehicle_catalog_id", "is", null);
      const { count: catalogInUse } = await supabase
        .from("vehicle_catalog")
        .select("*", { count: "exact", head: true });
      const { count: specificRules } = await supabase
        .from("maintenance_task_templates")
        .select("*", { count: "exact", head: true })
        .not("component_id", "is", null)
        .neq("template_scope", "global")
        .eq("status", "active")
        .is("archived_at", null);
      const { count: noDue } = await supabase
        .from("vehicle_component_schedule")
        .select("*", { count: "exact", head: true })
        .is("next_due_date", null)
        .is("next_due_km", null)
        .neq("schedule_status", "retired");
      const { count: odometerNeeded } = await supabase
        .from("vehicle_component_schedule")
        .select("*", { count: "exact", head: true })
        .eq("schedule_status", "odometer_needed");
      const { count: reviewConflicts } = await supabase
        .from("maintenance_rule_conflict")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");
      const { count: needsChecking } = await supabase
        .from("maintenance_task_templates")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_checking")
        .not("component_id", "is", null);
      const { count: retiredCatsOnCars } = await supabase
        .from("vehicle_component_schedule")
        .select("*", { count: "exact", head: true })
        .eq("schedule_status", "retired");
      const { data: rules } = await supabase
        .from("maintenance_task_templates")
        .select("source_type")
        .not("component_id", "is", null)
        .is("archived_at", null);
      const bySource = { maker_manual: 0, part_maker: 0, roam_policy: 0 };
      for (const r of rules || []) {
        const k = String(r.source_type ?? "roam_policy") as keyof typeof bySource;
        if (k in bySource) bySource[k]++;
      }
      const carsNoSpecific = Math.max(0, (catalogInUse ?? 0) - (specificRules ?? 0));
      return c.json({
        lastCheckedAt: new Date().toISOString(),
        rows: [
          { key: "no_specific", label: "Cars in use with no specific schedule", count: carsNoSpecific, page: "maintenance-templates" },
          {
            key: "by_source",
            label: "Schedules by source",
            count: (rules || []).length,
            detail: `Car maker ${bySource.maker_manual} · Part maker ${bySource.part_maker} · Roam policy ${bySource.roam_policy}`,
            page: "maintenance-templates",
          },
          { key: "no_due", label: "Roam Fleet parts with no due date", count: noDue ?? 0, page: "maintenance-templates" },
          { key: "odometer", label: "Waiting for a first odometer reading", count: odometerNeeded ?? 0, page: "maintenance-templates" },
          {
            key: "review",
            label: "Schedules waiting for review",
            count: (reviewConflicts ?? 0) + (needsChecking ?? 0),
            page: "maintenance-templates",
          },
          { key: "override", label: "More specific schedules overriding everyone's", count: specificRules ?? 0, page: "maintenance-templates" },
          { key: "retired_on_cars", label: "Retired part types still on cars", count: retiredCatsOnCars ?? 0, page: "maintenance-templates" },
        ],
        fleetCarsUsingSchedules: fleetCars ?? 0,
        sourceCounts: bySource,
      });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/conflicts/:id/retire-both", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    const id = c.req.param("id");
    try {
      const { data: conflict, error: cErr } = await supabase
        .from("maintenance_rule_conflict")
        .select("*")
        .eq("id", id)
        .eq("status", "open")
        .maybeSingle();
      if (cErr) throw cErr;
      if (!conflict) return c.json({ error: "Conflict not found" }, 404);
      const now = new Date().toISOString();
      await supabase
        .from("maintenance_task_templates")
        .update({ status: "retired", archived_at: now, updated_at: now })
        .in("id", [conflict.rule_id_a, conflict.rule_id_b]);
      await supabase
        .from("maintenance_rule_conflict")
        .update({ status: "resolved", resolved_at: now, resolution_note: "Retire both" })
        .eq("id", id);
      if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
        await supabase.rpc("recompute_component_schedules_for_rule", { p_rule_id: conflict.rule_id_a });
      }
      return c.json({ success: true, retired: [conflict.rule_id_a, conflict.rule_id_b] });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/history/export.csv", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { data, error } = await supabase
        .from("platform_revision")
        .select("created_at, entity_id, actor, old_row, new_row")
        .eq("entity_table", "maintenance_task_templates")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const header = "created_at,entity_id,actor,change\n";
      const lines = (data || []).map((row) =>
        [
          csvEscape(row.created_at),
          csvEscape(row.entity_id),
          csvEscape(row.actor),
          csvEscape(JSON.stringify(row.new_row ?? {})),
        ].join(",")
      );
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="maintenance-history.csv"');
      return c.body(header + lines.join("\n"));
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/preview/export.csv", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    const car = String(c.req.query("car") ?? "").trim();
    if (!isUuid(car)) return c.json({ error: "car query must be a vehicle_catalog uuid" }, 400);
    try {
      const { data, error } = await supabase.rpc("schedule_for_variant", {
        p_catalog_id: car,
        p_vehicle_year: null,
      });
      if (error) throw error;
      const header = "part,interval_km,interval_months,scope,source,status\n";
      const lines = (data || []).map((row: Record<string, unknown>) =>
        [
          csvEscape(row.task_name ?? row.component_name),
          csvEscape(row.interval_km),
          csvEscape(row.interval_months),
          csvEscape(row.template_scope),
          csvEscape(row.source_type),
          csvEscape(row.status),
        ].join(",")
      );
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="maintenance-preview.csv"');
      return c.body(header + lines.join("\n"));
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/rules/load-roam-policy-starter", requireAuth(), async (c: Context) => {
    const denied = assertCatalogGovernResponse(c);
    if (denied) return denied;
    const off = await denyIfGovernanceOff(c, supabase);
    if (off) return off;
    try {
      const { data: categories, error: catErr } = await supabase
        .from("maintenance_service_categories")
        .select("id, code, name")
        .eq("kind", "component");
      if (catErr) throw catErr;
      const cats = (categories || []) as Array<{ id: string; code: string; name: string }>;
      const created: string[] = [];
      const skipped: string[] = [];
      const unmatched: string[] = [];
      for (const row of ROAM_POLICY_STARTER_SET) {
        const { data: existing } = await supabase
          .from("maintenance_task_templates")
          .select("id")
          .eq("task_code", row.task_code)
          .maybeSingle();
        if (existing?.id) {
          skipped.push(row.task_code);
          continue;
        }
        const componentId = matchCategoryId(cats, row.category_hint);
        if (!componentId) {
          unmatched.push(row.task_code);
          continue;
        }
        const insertRow = {
          task_name: row.task_name,
          task_code: row.task_code,
          template_scope: "global",
          component_id: componentId,
          interval_km: row.interval_km,
          interval_months: row.interval_months,
          status: "draft",
          source_type: "roam_policy",
          confidence: "uncertain",
          applicable_vehicle_classes: ["car"],
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("maintenance_task_templates").insert(insertRow);
        if (error) throw error;
        created.push(row.task_code);
      }
      return c.json({ created, skipped, unmatched });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.get("/admin/maintenance/history", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    const kind = String(c.req.query("kind") ?? "").trim();
    const entityId = String(c.req.query("id") ?? "");
    const entityQuery = String(c.req.query("entity") ?? "").trim();
    const TABLES_ALL = [
      "maintenance_service_categories",
      "maintenance_job_section_groups",
      "maintenance_job_sections",
      "maintenance_job_section_members",
      "maintenance_job_relations",
      "maintenance_task_templates",
    ];
    let entityTables: string[];
    if (entityQuery) {
      entityTables = [entityQuery];
    } else if (!kind || kind === "schedules") {
      entityTables = ["maintenance_task_templates"];
    } else if (kind === "jobs") {
      entityTables = ["maintenance_service_categories"];
    } else if (kind === "sections") {
      entityTables = [
        "maintenance_job_section_groups",
        "maintenance_job_sections",
        "maintenance_job_section_members",
      ];
    } else if (kind === "links") {
      entityTables = ["maintenance_job_relations"];
    } else if (kind === "all") {
      entityTables = TABLES_ALL;
    } else {
      return c.json({ error: "Kind must be jobs, sections, links, schedules, or all." }, 400);
    }
    try {
      let q = supabase
        .from("platform_revision")
        .select("*")
        .in("entity_table", entityTables)
        .order("created_at", { ascending: false })
        .limit(200);
      if (entityId) q = q.eq("entity_id", entityId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const actorIds = [...new Set(rows.map((r) => r.actor).filter(Boolean))] as string[];
      const actorLabels = new Map<string, string>();
      if (actorIds.length) {
        const { data: users } = await supabase.auth.admin.listUsers({ perPage: 200 });
        for (const u of users?.users ?? []) {
          if (u.id && actorIds.includes(u.id)) {
            const meta = u.user_metadata as Record<string, unknown> | undefined;
            const name = meta?.full_name ?? meta?.name;
            actorLabels.set(u.id, String(name || u.email || u.id));
          }
        }
      }
      const enriched = await Promise.all(
        rows.map(async (row) => {
          const newRow = (row.new_row ?? {}) as Record<string, unknown>;
          const oldRow = (row.old_row ?? {}) as Record<string, unknown>;
          const actorId = row.actor ? String(row.actor) : "";
          let cars_updated: number | null = null;
          const ruleId = String(row.entity_id ?? newRow.id ?? "");
          const statusChanged =
            String(oldRow.status ?? "") !== String(newRow.status ?? "") ||
            intervalChangedRevision(oldRow, newRow);
          if (ruleId && isUuid(ruleId) && statusChanged && String(newRow.component_id ?? oldRow.component_id ?? "")) {
            try {
              const { data: impact } = await supabase.rpc("maintenance_rule_impact", {
                p_rule: { ...newRow, id: ruleId },
              });
              cars_updated = Number((impact as { count?: number })?.count ?? 0);
            } catch {
              cars_updated = null;
            }
          }
          return {
            ...row,
            actor_label: actorId ? actorLabels.get(actorId) ?? actorId : "Roam setup",
            cars_updated,
          };
        }),
      );
      return c.json({ items: enriched });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance/conflicts/:id/resolve", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id");
    try {
      const body = (await c.req.json()) as { pick?: string; winner_rule_id?: string };
      const pick = String(body.pick ?? body.winner_rule_id ?? "").trim();
      if (!pick || !isUuid(pick)) return c.json({ error: "pick must be rule id (Pick A / Pick B)" }, 400);
      const { data: conflict, error: cErr } = await supabase
        .from("maintenance_rule_conflict")
        .select("*")
        .eq("id", id)
        .eq("status", "open")
        .maybeSingle();
      if (cErr) throw cErr;
      if (!conflict) return c.json({ error: "Conflict not found" }, 404);
      const loser = pick === String(conflict.rule_id_a) ? conflict.rule_id_b : conflict.rule_id_a;
      const now = new Date().toISOString();
      await supabase.from("maintenance_task_templates").update({ status: "retired", updated_at: now }).eq("id", loser);
      await supabase.from("maintenance_task_templates").update({ status: "active", updated_at: now }).eq("id", pick);
      await supabase
        .from("maintenance_rule_conflict")
        .update({
          status: "resolved",
          picked_rule_id: pick,
          resolved_at: now,
        })
        .eq("id", id);
      if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
        await supabase.rpc("recompute_component_schedules_for_rule", { p_rule_id: pick });
      }
      return c.json({ success: true, winner_rule_id: pick });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.patch(
    "/vehicles/:vehicleId/maintenance/custom-interval",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const vehicleId = c.req.param("vehicleId");
      const body = (await c.req.json()) as {
        category_id?: string;
        position?: string | null;
        custom_interval_km?: number | null;
        custom_interval_months?: number | null;
        reason?: string;
      };
      const reason = String(body.reason ?? "").trim();
      if (!reason) return c.json({ error: "reason is required" }, 400);
      const categoryId = String(body.category_id ?? "");
      if (!isUuid(categoryId)) return c.json({ error: "category_id required" }, 400);
      try {
        const { data: roam } = await supabase.rpc("schedule_rule_for_part", {
          p_org: orgId,
          p_vehicle_id: vehicleId,
          p_component_id: categoryId,
          p_position: body.position ?? null,
          p_include_custom: false,
        });
        const rule = Array.isArray(roam) ? roam[0] : roam;
        const roamKm = rule?.interval_km != null ? Number(rule.interval_km) : null;
        const roamMo = rule?.interval_months != null ? Number(rule.interval_months) : null;
        const customKm = body.custom_interval_km != null ? Number(body.custom_interval_km) : null;
        const customMo = body.custom_interval_months != null ? Number(body.custom_interval_months) : null;
        if (
          (roamKm != null && customKm != null && customKm > roamKm) ||
          (roamMo != null && customMo != null && customMo > roamMo)
        ) {
          return c.json({ error: "Custom schedules can only be shorter than Roam's" }, 400);
        }
        const now = new Date().toISOString();
        let scheduleQuery = supabase
          .from("vehicle_component_schedule")
          .update({
            custom_interval_km: customKm,
            custom_interval_months: customMo,
            custom_reason: reason,
            custom_set_at: now,
            schedule_status: "manual_override",
            updated_at: now,
          })
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .eq("category_id", categoryId);
        scheduleQuery = filterScheduleByPosition(scheduleQuery, body.position);
        const { data, error } = await scheduleQuery.select("*").maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Schedule row not found" }, 404);
        if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
          const { error: rpcErr } = await supabase.rpc("mm_recompute_schedule_row", {
            p_org: orgId,
            p_vehicle_id: vehicleId,
            p_category_id: categoryId,
            p_position: normalizeSchedulePosition(body.position),
            p_existing_id: data.id,
          });
          if (rpcErr) throw rpcErr;
        }
        const { data: refreshed } = await supabase
          .from("vehicle_component_schedule")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        return c.json({ item: refreshed ?? data });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.delete(
    "/vehicles/:vehicleId/maintenance/custom-interval",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const vehicleId = c.req.param("vehicleId");
      const categoryId = String(c.req.query("category_id") ?? "");
      const position = c.req.query("position");
      if (!isUuid(categoryId)) return c.json({ error: "category_id required" }, 400);
      try {
        let clearQuery = supabase
          .from("vehicle_component_schedule")
          .update({
            custom_interval_km: null,
            custom_interval_months: null,
            custom_reason: null,
            custom_set_at: null,
            custom_set_by: null,
            schedule_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId)
          .eq("category_id", categoryId);
        clearQuery = filterScheduleByPosition(clearQuery, position);
        const { data, error } = await clearQuery.select("*").maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Schedule row not found" }, 404);
        if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
          const { error: rpcErr } = await supabase.rpc("mm_recompute_schedule_row", {
            p_org: orgId,
            p_vehicle_id: vehicleId,
            p_category_id: categoryId,
            p_position: normalizeSchedulePosition(position),
            p_existing_id: data.id,
          });
          if (rpcErr) throw rpcErr;
        }
        return c.json({ item: data });
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );

  route.patch(
    "/vehicles/:vehicleId/maintenance/severe-duty",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const vehicleId = c.req.param("vehicleId");
      const body = (await c.req.json()) as { severe_duty?: boolean; reason?: string };
      try {
        const { data, error } = await fleetDb()
          .from("fleet_vehicles")
          .update({ severe_duty: body.severe_duty === true })
          .eq("organization_id", orgId)
          .eq("id", vehicleId)
          .select("id, severe_duty")
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Vehicle not found" }, 404);
        if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
          const { error: rpcErr } = await supabase.rpc("recompute_component_schedules_for_car", {
            p_org: orgId,
            p_vehicle_id: vehicleId,
          });
          if (rpcErr) throw rpcErr;
        }
        return c.json({ item: data, reason: body.reason ?? null });
      } catch (e: unknown) {
        return c.json({ error: errMsg(e) }, 500);
      }
    },
  );

  registerMaintenanceJobsAdminRoutes(route, supabase);

  route.get(
    "/vehicles/:vehicleId/maintenance/schedule-explain",
    requireAuth(),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const vehicleId = c.req.param("vehicleId");
      const categoryId = String(c.req.query("category_id") ?? "");
      const position = c.req.query("position");
      if (!isUuid(categoryId)) return c.json({ error: "category_id required" }, 400);
      try {
        const explain = await fetchScheduleExplain(
          supabase,
          orgId,
          vehicleId,
          categoryId,
          position && position !== "" ? position : null,
        );
        return c.json(explain);
      } catch (e: unknown) {
        return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    },
  );
}

function mapRuleBodyToRow(body: Record<string, unknown>, patch = false): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!patch || body.task_name !== undefined) row.task_name = String(body.task_name ?? "").trim();
  if (!patch || body.task_code !== undefined) row.task_code = body.task_code != null ? String(body.task_code).trim() : null;
  if (!patch || body.template_scope !== undefined) row.template_scope = String(body.template_scope ?? "global");
  if (!patch || body.component_id !== undefined) row.component_id = body.component_id;
  if (!patch || body.interval_km !== undefined) {
    const raw = body.interval_km;
    row.interval_km = raw != null && raw !== "" ? Number(raw) : null;
  }
  if (!patch || body.interval_months !== undefined) {
    row.interval_months = body.interval_months != null && body.interval_months !== "" ? Number(body.interval_months) : null;
  }
  if (!patch || body.status !== undefined) row.status = String(body.status ?? "draft");
  if (!patch || body.source_type !== undefined) row.source_type = String(body.source_type ?? "roam_policy");
  if (!patch || body.confidence !== undefined) row.confidence = String(body.confidence ?? "uncertain");
  if (!patch || body.vehicle_catalog_id !== undefined) row.vehicle_catalog_id = body.vehicle_catalog_id;
  if (!patch || body.platform_id !== undefined) row.platform_id = body.platform_id;
  if (!patch || body.engine_family_id !== undefined) row.engine_family_id = body.engine_family_id;
  if (!patch || body.year_from !== undefined) row.year_from = body.year_from != null ? Number(body.year_from) : null;
  if (!patch || body.year_to !== undefined) row.year_to = body.year_to != null ? Number(body.year_to) : null;
  if (!patch || body.applicable_vehicle_classes !== undefined) {
    row.applicable_vehicle_classes = Array.isArray(body.applicable_vehicle_classes)
      ? body.applicable_vehicle_classes
      : ["car"];
  } else if (!patch) {
    row.applicable_vehicle_classes = ["car"];
  }
  if (!patch || body.description !== undefined) row.description = body.description;
  if (!patch || body.fleet_tip !== undefined) row.fleet_tip = body.fleet_tip;
  if (!patch || body.overdue_effect !== undefined) row.overdue_effect = body.overdue_effect;
  if (!patch || body.evidence_url !== undefined) row.evidence_url = body.evidence_url;
  if (!patch || body.severe_interval_km !== undefined) {
    row.severe_interval_km = body.severe_interval_km != null && body.severe_interval_km !== "" ? Number(body.severe_interval_km) : null;
  }
  if (!patch || body.severe_interval_months !== undefined) {
    row.severe_interval_months =
      body.severe_interval_months != null && body.severe_interval_months !== "" ? Number(body.severe_interval_months) : null;
  }
  return row;
}

async function saveRuleAndRecompute(
  c: Context,
  supabase: SupabaseClient,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const governDenied = assertCatalogGovernResponse(c);
  if (governDenied) return governDenied;
  const patch = mapRuleBodyToRow(body, true);
  const { data: impact, error: iErr } = await supabase.rpc("maintenance_rule_impact", {
    p_rule: { ...body, id },
  });
  if (iErr) throw iErr;
  void impact;
  const { data, error } = await supabase.from("maintenance_task_templates").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  if (await isMaintenanceMasterGovernanceEnabled(supabase)) {
    await supabase.rpc("recompute_component_schedules_for_rule", { p_rule_id: id });
  }
  return c.json({ item: data, impact });
}

export const MAINTENANCE_MASTER_ROUTE_GUARDS: Record<string, "catalog.write" | "catalog.govern" | "staff_read" | "vehicles.edit"> = {
  "GET /admin/platform-feature-flags/maintenance_master_governance": "staff_read",
  "GET /admin/maintenance/summary": "staff_read",
  "GET /admin/maintenance/review-list": "staff_read",
  "GET /admin/maintenance/part-schedules-index": "staff_read",
  "GET /admin/maintenance-categories/:id/usage": "staff_read",
  "GET /admin/maintenance/scope-coverage": "staff_read",
  "GET /admin/maintenance/health": "staff_read",
  "POST /admin/maintenance/conflicts/:id/retire-both": "catalog.govern",
  "GET /admin/maintenance/history/export.csv": "staff_read",
  "GET /admin/maintenance/preview/export.csv": "staff_read",
  "POST /admin/maintenance/rules/load-roam-policy-starter": "catalog.govern",
  "GET /admin/maintenance/rules": "staff_read",
  "POST /admin/maintenance/rules": "catalog.write",
  "PATCH /admin/maintenance/rules/:id": "catalog.write",
  "GET /admin/maintenance/rules/:id/impact": "staff_read",
  "POST /admin/maintenance/rules/:id/retire": "catalog.govern",
  "GET /admin/maintenance/preview": "staff_read",
  "GET /admin/maintenance/history": "staff_read",
  "POST /admin/maintenance/proposals/:id/approve": "catalog.govern",
  "POST /admin/maintenance/proposals/:id/reject": "catalog.govern",
  "POST /admin/maintenance/conflicts/:id/resolve": "catalog.write",
  "PATCH /vehicles/:vehicleId/maintenance/custom-interval": "vehicles.edit",
  "DELETE /vehicles/:vehicleId/maintenance/custom-interval": "vehicles.edit",
  "PATCH /vehicles/:vehicleId/maintenance/severe-duty": "vehicles.edit",
  "GET /vehicles/:vehicleId/maintenance/schedule-explain": "vehicles.view",
  ...MAINTENANCE_JOBS_ADMIN_ROUTE_GUARDS,
};
