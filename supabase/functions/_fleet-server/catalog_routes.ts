/**
 * Catalog read API. Any signed-in app user. Reference data only.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth } from "./rbac_middleware.ts";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";
import {
  getCatalogParts,
  getCatalogSchedule,
  getCatalogServiceKit,
  getCatalogVariant,
  resolveCatalogVariant,
  tieredSearchKilled,
} from "./catalog_api.ts";
import { FEATURE_FLAGS, setFeatureFlag } from "./feature_flags.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

function fail(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : "Could not read the catalog.";
  return c.json({ error: message }, 500);
}

function staffJson(c: Context, body: unknown) {
  assertNoCustomerIdentity(body);
  return c.json(body as Record<string, unknown>);
}

export function registerCatalogRoutes(route: RouteApp, supabase: SupabaseClient) {
  const base = "/make-server-37f42386/catalog/v1";

  route.get(`${base}/variants/:id`, requireAuth(), async (c: Context) => {
    try {
      const id = c.req.param("id")?.trim() ?? "";
      if (!UUID_RE.test(id)) return c.json({ error: "Invalid variant" }, 400);
      const item = await getCatalogVariant(supabase, id);
      if (!item) return c.json({ error: "Variant not found" }, 404);
      assertNoCustomerIdentity(item);
      return c.json(item);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get(`${base}/variants/:id/parts`, requireAuth(), async (c: Context) => {
    try {
      const id = c.req.param("id")?.trim() ?? "";
      if (!UUID_RE.test(id)) return c.json({ error: "Invalid variant" }, 400);
      const yearRaw = c.req.query("year");
      const year = yearRaw ? Number(yearRaw) : null;
      const result = await getCatalogParts(supabase, id, {
        componentId: c.req.query("component"),
        vehicleYear: Number.isFinite(year) ? year : null,
      });
      assertNoCustomerIdentity(result);
      return c.json(result);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get(`${base}/variants/:id/schedule`, requireAuth(), async (c: Context) => {
    try {
      const id = c.req.param("id")?.trim() ?? "";
      if (!UUID_RE.test(id)) return c.json({ error: "Invalid variant" }, 400);
      const yearRaw = c.req.query("year");
      const year = yearRaw ? Number(yearRaw) : null;
      const result = await getCatalogSchedule(supabase, id, Number.isFinite(year) ? year : null);
      assertNoCustomerIdentity(result);
      return c.json(result);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get(`${base}/variants/:id/service-kit`, requireAuth(), async (c: Context) => {
    try {
      const id = c.req.param("id")?.trim() ?? "";
      if (!UUID_RE.test(id)) return c.json({ error: "Invalid variant" }, 400);
      const result = await getCatalogServiceKit(supabase, id, c.req.query("task")?.trim() || null);
      assertNoCustomerIdentity(result);
      return c.json(result);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post(`${base}/resolve`, requireAuth(), async (c: Context) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const result = await resolveCatalogVariant(supabase, {
        make: body.make != null ? String(body.make) : undefined,
        model: body.model != null ? String(body.model) : undefined,
        year: body.year != null ? String(body.year) : undefined,
        chassis: body.chassis != null ? String(body.chassis) : undefined,
        engine: body.engine != null ? String(body.engine) : undefined,
        frameNumber: body.frameNumber != null ? String(body.frameNumber) : undefined,
      });
      assertNoCustomerIdentity(result);
      return c.json(result);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/matrix", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("catalog_coverage_matrix");
      if (error) throw error;
      return staffJson(c, { matrix: data ?? {} });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/signals", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      const [demand, fit, unmatched, partDemand, tasks] = await Promise.all([
        supabase.from("catalog_signal_variant_demand").select("variant_id, vehicle_count, fleet_count, refreshed_at"),
        supabase.from("catalog_signal_fit").select("part_id, variant_id, fit_count, no_fit_count, modified_count"),
        supabase.from("catalog_signal_unmatched_numbers").select("part_number, component_id, variant_id, occurrences"),
        supabase.from("catalog_signal_part_demand").select("variant_id, component_id, open_count, fleet_count, latest_need_text"),
        supabase.from("catalog_task").select("id, vehicle_catalog_id, component_id, kind, note, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(100),
      ]);
      const body = {
        demand: demand.data || [],
        fit: fit.data || [],
        unmatched: unmatched.data || [],
        partDemand: partDemand.data || [],
        tasks: tasks.data || [],
        variantId: variantId || null,
      };
      return staffJson(c, body);
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/compare", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const variantId = c.req.query("variantId")?.trim() || "";
      if (!UUID_RE.test(variantId)) return c.json({ error: "Pick a variant." }, 400);
      const legacy = await getCatalogParts(supabase, variantId, { killed: true });
      const readyRow = await getCatalogParts(supabase, variantId, { killed: false });
      const forcedTiered = await (async () => {
        const { data, error } = await supabase.rpc("parts_for_vehicle", {
          p_catalog_id: variantId,
          p_component_id: null,
          p_vehicle_year: null,
        });
        if (error) throw error;
        return data || [];
      })();
      return staffJson(c, {
        variantId,
        ready: readyRow.ready,
        legacy: legacy.items,
        tiered: forcedTiered,
      });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/blast", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const kind = c.req.query("kind")?.trim() || "";
      const id = c.req.query("id")?.trim() || "";
      if (!["variant", "platform", "engine_family"].includes(kind) || !UUID_RE.test(id)) {
        return c.json({ error: "A platform, engine, or variant is required." }, 400);
      }
      const { data, error } = await supabase.rpc("catalog_blast_radius", { p_kind: kind, p_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return staffJson(c, {
        variantCount: Number((row as { variant_count?: number } | null)?.variant_count ?? 0),
        makeCount: Number((row as { make_count?: number } | null)?.make_count ?? 0),
      });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/tiered-kill", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { killed?: boolean };
      const killed = body.killed === true;
      await setFeatureFlag(FEATURE_FLAGS.PARTS_TIERED_SEARCH, killed, {
        description: killed
          ? "Emergency stop. Every variant uses the old parts list."
          : "Off. Ready variants use tiered parts. This switch is only an emergency stop.",
        updatedBy: "catalog",
        enabledForOrgs: [],
      });
      return staffJson(c, { killed, active: await tieredSearchKilled() });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/refresh-demand", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("refresh_catalog_variant_demand");
      if (error) throw error;
      return staffJson(c, { refreshed: data ?? 0 });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/seed-in-use", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("seed_in_use_engine_parts");
      if (error) throw error;
      return staffJson(c, { rulesAdded: data ?? 0 });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/tasks", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("catalog_task").select("id, vehicle_catalog_id, component_id, kind, note, status, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch("/make-server-37f42386/admin/catalog/tasks/:id", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      const body = await c.req.json() as { status?: string };
      const status = body.status === "done" || body.status === "dismissed" ? body.status : "";
      if (!status) return c.json({ error: "Pick done or dismissed." }, 400);
      const { error } = await supabase.from("catalog_task").update({ status }).eq("id", id);
      if (error) throw error;
      return staffJson(c, { ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });
}
