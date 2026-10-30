/**
 * Catalog read API. Any signed-in app user. Reference data only.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth } from "./rbac_middleware.ts";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";
import {
  assembleMatchSections,
  enrichFleetParts,
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

function optionalYear(value: unknown): number | null | false {
  if (value == null || value === "") return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return false;
  return year;
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
        supabase.from("catalog_signal_part_demand").select("variant_id, component_id, open_count, fleet_count"),
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
      const ready = await supabase.rpc("refresh_variant_parts_readiness");
      if (ready.error) throw ready.error;
      return staffJson(c, { refreshed: data ?? 0 });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/seed-in-use", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    return c.json({ error: "Parts are entered from a source, not seeded." }, 410);
  });

  route.get("/make-server-37f42386/admin/catalog/parts-overview", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("admin_parts_overview");
      if (error) throw error;
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/find-parts", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const make = (c.req.query("make") ?? "").trim();
      const model = (c.req.query("model") ?? "").trim();
      const yearRaw = Number(c.req.query("year") ?? "");
      const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : null;
      const variantId = (c.req.query("variantId") ?? "").trim();
      let query = supabase
        .from("vehicle_catalog")
        .select("id, make, model, chassis_code, engine_code, production_start_year, production_end_year, drivetrain");
      if (variantId) {
        query = query.eq("id", variantId);
      } else if (make || model || year != null) {
        if (make) query = query.ilike("make", make);
        if (model) query = query.ilike("model", model);
        if (year != null) {
          query = query.lte("production_start_year", year).or(`production_end_year.is.null,production_end_year.gte.${year}`);
        }
        query = query.limit(40);
      } else {
        query = query.limit(0);
      }
      const { data: rows, error } = await query;
      if (error) throw error;
      const variants = (rows || []) as Array<Record<string, unknown>>;
      const picked = variantId
        ? variants.find((row) => String(row.id) === variantId) ?? null
        : variants.length === 1 ? variants[0] : null;
      if (!picked) {
        return staffJson(c, { variants, sections: [], picked: null, coverage: null });
      }
      const pickedId = String(picked.id);
      const parts = await getCatalogParts(supabase, pickedId, { vehicleYear: year });
      const enriched = await enrichFleetParts(supabase, parts.mode, parts.items, null, 0);
      const sections = assembleMatchSections(
        parts.mode === "tiered" ? enriched as Array<{ tier?: number; sisterNames?: string | null }> : [],
        parts.universal,
      );
      const [{ data: readyRow }, { data: specRows }, { data: listingRows }] = await Promise.all([
        supabase.from("variant_parts_readiness").select("components_ready").eq("variant_id", pickedId).maybeSingle(),
        supabase.from("catalog_spec_value").select("spec_key").eq("vehicle_catalog_id", pickedId),
        supabase.from("part_listing").select("id").eq("vehicle_catalog_id", pickedId),
      ]);
      const essentials = Number((readyRow as { components_ready?: number } | null)?.components_ready ?? 0);
      const specs = new Set((specRows || []).map((row) => String((row as { spec_key?: string }).spec_key ?? ""))).size;
      const coverage = {
        essentials,
        essentialsTotal: 10,
        specs,
        specsTotal: 13,
        otherParts: (listingRows || []).length,
      };
      assertNoCustomerIdentity(parts);
      return staffJson(c, { variants, picked, sections, ready: parts.ready, coverage });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/body-families", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("admin_body_families");
      if (error) throw error;
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/body-families", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json();
      const { data, error } = await supabase.rpc("admin_save_body_family", { p_input: body });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/parts/reach-preview", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as {
        variantId?: string;
        tickedVariantIds?: string[];
        componentOpCode?: string;
        groupId?: string;
        yearFrom?: number | string | null;
        yearTo?: number | string | null;
      };
      if (!UUID_RE.test(String(body.variantId ?? ""))) return c.json({ error: "Choose a vehicle" }, 400);
      const groupRaw = String(body.groupId ?? "").trim();
      if (groupRaw && !UUID_RE.test(groupRaw)) return c.json({ error: "Choose the part" }, 400);
      const yearFrom = optionalYear(body.yearFrom);
      const yearTo = optionalYear(body.yearTo);
      if (yearFrom === false || yearTo === false) return c.json({ error: "Enter a real year" }, 400);
      const ticked = Array.isArray(body.tickedVariantIds) ? body.tickedVariantIds.filter((id) => UUID_RE.test(id)) : [];
      const { data, error } = await supabase.rpc("listing_reach_preview", {
        p_variant: body.variantId,
        p_ticked: ticked,
        p_op: String(body.componentOpCode ?? "").trim(),
        p_group: groupRaw || null,
        p_year_from: yearFrom,
        p_year_to: yearTo,
      });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? { sister: [], engine: [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/parts/group/:groupId", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const groupId = c.req.param("groupId");
      const variantId = (c.req.query("variantId") ?? "").trim();
      if (!UUID_RE.test(groupId) || !UUID_RE.test(variantId)) return c.json({ error: "Choose the part and the vehicle" }, 400);
      const { data, error } = await supabase.rpc("guided_part_group", { p_group: groupId, p_variant: variantId });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/parts/exclude", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json();
      const { data, error } = await supabase.rpc("admin_exclude_listing", { p_input: body });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? {});
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

  route.post("/make-server-37f42386/admin/catalog/reference-offer", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as {
        partId?: string;
        supplierId?: string;
        unitPrice?: number;
        currency?: string;
        supplierSku?: string;
      };
      const partId = String(body.partId ?? "");
      const supplierId = String(body.supplierId ?? "");
      const supplierSku = String(body.supplierSku ?? "").trim();
      const unitPrice = Number(body.unitPrice);
      if (!UUID_RE.test(partId) || !UUID_RE.test(supplierId) || !supplierSku || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return c.json({ error: "A confirmed part, supplier, price, and supplier code are required." }, 400);
      }
      const { data: part, error: partErr } = await supabase
        .from("part_master")
        .select("id, catalog_decision")
        .eq("id", partId)
        .maybeSingle();
      if (partErr) throw partErr;
      if (!part || (part as { catalog_decision?: string }).catalog_decision !== "confirmed") {
        return c.json({ error: "Only a confirmed catalog part can have a reference price." }, 400);
      }
      const { data, error } = await supabase.from("supplier_part_offer").insert({
        supplier_id: supplierId,
        part_id: partId,
        supplier_sku: supplierSku.slice(0, 80),
        unit_price: unitPrice,
        currency: body.currency ? String(body.currency).slice(0, 8) : "JMD",
        source: "manual",
        organization_id: null,
        is_active: true,
        price_observed_at: new Date().toISOString(),
      }).select("id, part_id, supplier_id, supplier_sku, unit_price, currency").single();
      if (error) throw error;
      return staffJson(c, { offer: data });
    } catch (error) {
      return fail(c, error);
    }
  });

  const guided = async (c: Context, name: string) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const actor = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
      const actorId = String(actor?.userId ?? actor?.id ?? "");
      if (UUID_RE.test(actorId)) {
        body.verifiedBy = body.verifiedBy ?? actorId;
        body.createdBy = body.createdBy ?? actorId;
      }
      const { data, error } = await supabase.rpc(name, { p_input: body });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  };

  route.post("/make-server-37f42386/admin/catalog/parts/preview", requireAuth(), (c: Context) => guided(c, "preview_guided_fit"));
  route.post("/make-server-37f42386/admin/catalog/parts/guided", requireAuth(), (c: Context) => guided(c, "save_guided_part"));
  route.patch("/make-server-37f42386/admin/catalog/parts/:groupId/fit", requireAuth(), async (c: Context) => {
    const body = await c.req.json() as Record<string, unknown>;
    body.groupId = c.req.param("groupId");
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const actor = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
      const actorId = String(actor?.userId ?? actor?.id ?? "");
      if (UUID_RE.test(actorId)) {
        body.verifiedBy = body.verifiedBy ?? actorId;
        body.createdBy = body.createdBy ?? actorId;
      }
      const { data, error } = await supabase.rpc("replace_guided_fit", { p_input: body });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? {});
    } catch (error) {
      return fail(c, error);
    }
  });
  route.post("/make-server-37f42386/admin/catalog/parts/remove", requireAuth(), (c: Context) => guided(c, "remove_guided_variant"));
  route.post("/make-server-37f42386/admin/catalog/applicability", requireAuth(), (c: Context) => guided(c, "save_component_applicability"));
  route.post("/make-server-37f42386/admin/catalog/specs", requireAuth(), (c: Context) => guided(c, "save_catalog_spec"));
  route.post("/make-server-37f42386/admin/catalog/universal-parts", requireAuth(), (c: Context) => guided(c, "save_universal_part"));
  route.post("/make-server-37f42386/admin/catalog/related-supplies", requireAuth(), (c: Context) => guided(c, "save_related_supply"));

  route.get("/make-server-37f42386/admin/catalog/variants/:id/checklist", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id")?.trim() ?? "";
      if (!UUID_RE.test(id)) return c.json({ error: "Invalid variant" }, 400);
      const { data, error } = await supabase.rpc("variant_parts_checklist", { p_catalog_id: id });
      if (error) return c.json({ error: error.message }, 400);
      return staffJson(c, data ?? { jobs: [], specs: [], supplies: [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/spec-keys", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("spec_key").select("key, label, value_type, unit, allowed_values").order("label");
      if (error) throw error;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/universal-parts", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("universal_part")
        .select("id, spec_key, spec_value, manufacturer, part_number, name, extra, evidence_url")
        .order("manufacturer");
      if (error) throw error;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/vehicle-options", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const make = (c.req.query("make") ?? "").trim();
      const model = (c.req.query("model") ?? "").trim();
      let query = supabase.from("vehicle_catalog").select("make, model, production_start_year, production_end_year");
      if (make) query = query.ilike("make", make);
      if (model) query = query.ilike("model", model);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      const rows = (data || []) as Array<{ make?: string; model?: string; production_start_year?: number; production_end_year?: number }>;
      const makes = [...new Set(rows.map((row) => String(row.make ?? "")).filter(Boolean))].sort();
      const models = [...new Set(rows.map((row) => String(row.model ?? "")).filter(Boolean))].sort();
      const years = new Set<number>();
      for (const row of rows) {
        const from = Number(row.production_start_year ?? 0);
        const to = Number(row.production_end_year ?? from);
        if (!from) continue;
        for (let year = from; year <= (to || from); year += 1) years.add(year);
      }
      return staffJson(c, { makes, models, years: [...years].sort((a, b) => b - a) });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/part-jobs", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("guided_part_jobs");
      if (error) throw error;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/part-categories", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_category").select("id, label, slug").order("sort_order");
      if (error) throw error;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/same-model", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const variantId = (c.req.query("variantId") ?? "").trim();
      const { data: mine, error } = await supabase.from("vehicle_catalog").select("make, model, production_start_year, production_end_year").eq("id", variantId).maybeSingle();
      if (error) throw error;
      if (!mine) return staffJson(c, { items: [] });
      const row = mine as { make?: string; model?: string };
      const { data, error: listError } = await supabase
        .from("vehicle_catalog")
        .select("id, make, model, chassis_code, production_start_year, production_end_year, drivetrain")
        .ilike("make", String(row.make ?? ""))
        .ilike("model", String(row.model ?? ""))
        .limit(80);
      if (listError) throw listError;
      return staffJson(c, { items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post("/make-server-37f42386/admin/catalog/universal-parts/delete", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { id?: string };
      if (!body.id) return c.json({ error: "Choose the universal part" }, 400);
      const { error } = await supabase.from("universal_part").delete().eq("id", body.id);
      if (error) throw error;
      return staffJson(c, { ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/import-batches", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("admin_recent_import_batches");
      if (error) throw error;
      const items = Array.isArray(data) ? data : [];
      return staffJson(c, { items });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get("/make-server-37f42386/admin/catalog/advanced-tables", requireAuth(), async (c: Context) => {
    const denied = assertPlatformStaffResponse(c);
    if (denied) return denied;
    try {
      const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
      const page = 50;
      const end = offset + page - 1;
      const [partsCount, brandsCount, listingsCount, parts, brands, listings] = await Promise.all([
        supabase.from("part_master").select("id", { count: "exact", head: true }),
        supabase.from("part_master").select("id", { count: "exact", head: true }).not("interchange_group_id", "is", null),
        supabase.from("part_listing").select("id", { count: "exact", head: true }),
        supabase.from("part_master").select("id, name, oem_part_number, manufacturer, category_id").order("id").range(offset, end),
        supabase.from("part_master").select("id, interchange_group_id, manufacturer, oem_part_number").not("interchange_group_id", "is", null).order("id").range(offset, end),
        supabase.from("part_listing").select("id, vehicle_catalog_id, interchange_group_id, position, evidence_url").order("id").range(offset, end),
      ]);
      if (partsCount.error) throw partsCount.error;
      if (brandsCount.error) throw brandsCount.error;
      if (listingsCount.error) throw listingsCount.error;
      if (parts.error) throw parts.error;
      if (brands.error) throw brands.error;
      if (listings.error) throw listings.error;
      return staffJson(c, {
        offset,
        page,
        parts: { count: partsCount.count ?? 0, rows: parts.data || [] },
        brands: { count: brandsCount.count ?? 0, rows: brands.data || [] },
        listings: { count: listingsCount.count ?? 0, rows: listings.data || [] },
      });
    } catch (error) {
      return fail(c, error);
    }
  });
}
