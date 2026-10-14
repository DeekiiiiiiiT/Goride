import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import * as kv from "./kv_store.tsx";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import { decodeFrameBatch, decodeFrameNumber, engineFamilyPrefix } from "../../../packages/types/src/frameNumberDecode.ts";
import { CacheOnlySupplierAdapter } from "./parts_supplier_adapter.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

function fail(c: Context, e: unknown) {
  return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
}

export function registerPartsEnterpriseRoutes(route: RouteApp, supabase: SupabaseClient) {
  const staff = assertPlatformStaffResponse;

  route.get(
    "/make-server-37f42386/parts-sourcing-requests",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await supabase
          .from("parts_sourcing_requests")
          .select("*, part_master:resolved_part_id ( id, name, oem_part_number )")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e) {
        return fail(c, e);
      }
    },
  );

  route.get("/make-server-37f42386/admin/vehicle-platforms", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("vehicle_platform").select("*").order("code");
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/engine-families", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("engine_family").select("*").order("code");
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/parts-coverage", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("parts_catalog_coverage");
      if (error) throw error;
      const vehicles = await kv.getByPrefix("vehicle:");
      const active = (vehicles || []).filter((v) => {
        if (!v || typeof v !== "object") return false;
        const status = String((v as { status?: string }).status ?? "active").toLowerCase();
        return !["retired", "sold", "inactive", "archived"].includes(status);
      }).slice(0, 400);
      const { data: comps } = await supabase
        .from("part_master")
        .select("maintenance_component_id")
        .not("maintenance_component_id", "is", null);
      const componentIds = [...new Set((comps || []).map((r) => String((r as { maintenance_component_id: string }).maintenance_component_id)))].slice(0, 10);
      let covered = 0;
      if (componentIds.length === 0) {
        return c.json({
          coverage: {
            coveragePct: 0,
            vehicleCount: active.length,
            coveredCount: 0,
            componentsWithParts: 0,
            catalogCoverage: data,
          },
        });
      }
      for (const vehicle of active) {
        const catalogId = await resolveCatalogIdForKvVehicle(supabase, vehicle as Record<string, unknown>);
        if (!catalogId || componentIds.length === 0) continue;
        let ok = true;
        for (const comp of componentIds.slice(0, 10)) {
          const { data: hits } = await supabase.rpc("parts_for_vehicle", {
            p_catalog_id: catalogId,
            p_component_id: comp,
            p_vehicle_year: Number((vehicle as { year?: number }).year) || null,
          });
          const tierHit = (hits || []).some((h) => {
            const tier = Number((h as { tier?: number }).tier);
            return tier >= 1 && tier <= 3;
          });
          if (!tierHit) { ok = false; break; }
        }
        if (ok) covered += 1;
      }
      const fleetCount = active.length;
      const fleetPct = fleetCount ? Math.round((covered / fleetCount) * 1000) / 10 : 0;
      return c.json({
        coverage: {
          ...(typeof data === "object" && data ? data as Record<string, unknown> : {}),
          coveragePct: fleetPct,
          vehicleCount: fleetCount,
          coveredCount: covered,
          catalogCoverage: data,
        },
      });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/part-groups", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_interchange_group").select("*").order("code");
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-groups", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const code = String(body.code ?? "").trim();
      const fit_scope = String(body.fit_scope ?? "").trim();
      if (!code || !fit_scope) return c.json({ error: "code and fit_scope are required" }, 400);
      const { data, error } = await supabase.from("part_interchange_group").insert({
        code,
        label: body.label != null ? String(body.label) : null,
        fit_scope,
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/part-rules", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("interchange_fitment_rule")
        .select("*, part_interchange_group ( id, code, fit_scope, label )")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-rules", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const interchange_group_id = String(body.interchange_group_id ?? "");
      const target_kind = String(body.target_kind ?? "");
      if (!isUuid(interchange_group_id) || !target_kind) {
        return c.json({ error: "interchange_group_id and target_kind are required" }, 400);
      }
      let engine_family_id = body.engine_family_id ? String(body.engine_family_id) : null;
      let platform_id = body.platform_id ? String(body.platform_id) : null;
      if (!engine_family_id && body.engine_code) {
        const { data: eng } = await supabase.from("engine_family").select("id").eq("code", String(body.engine_code).trim().toUpperCase()).maybeSingle();
        engine_family_id = (eng as { id?: string } | null)?.id ?? null;
      }
      if (!platform_id && body.platform_code) {
        const { data: plat } = await supabase.from("vehicle_platform").select("id").eq("code", String(body.platform_code).trim().toUpperCase()).maybeSingle();
        platform_id = (plat as { id?: string } | null)?.id ?? null;
      }
      const { data, error } = await supabase.from("interchange_fitment_rule").insert({
        interchange_group_id,
        target_kind,
        engine_family_id,
        platform_id,
        vehicle_catalog_id: body.vehicle_catalog_id ? String(body.vehicle_catalog_id) : null,
        year_from: body.year_from != null && body.year_from !== "" ? Number(body.year_from) : null,
        year_to: body.year_to != null && body.year_to !== "" ? Number(body.year_to) : null,
        position: body.position ? String(body.position) : null,
        source: body.source ? String(body.source) : "manual",
        notes: body.notes ? String(body.notes) : null,
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-import", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { rows?: unknown[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return c.json({ error: "rows are required" }, 400);
      const batchId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("import_parts_catalog_rows", {
        p_rows: rows,
        p_batch_id: batchId,
      });
      if (error) throw error;
      return c.json({ result: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-import/undo", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { batchId?: string };
      if (!body.batchId || !isUuid(body.batchId)) return c.json({ error: "batchId required" }, 400);
      const { data, error } = await supabase.rpc("undo_parts_catalog_batch", { p_batch_id: body.batchId });
      if (error) throw error;
      return c.json({ result: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/part-link-reviews", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_number_link_review").select("*").eq("status", "open").limit(200);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/part-link-reviews/:id", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      const body = await c.req.json() as Record<string, unknown>;
      const status = String(body.status ?? "");
      if (!["linked", "dismissed"].includes(status)) return c.json({ error: "Invalid status" }, 400);
      const linked = body.linked_part_id ? String(body.linked_part_id) : null;
      const { data: review, error } = await supabase
        .from("part_number_link_review")
        .update({ status, linked_part_id: linked })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      if (status === "linked" && linked && review?.work_order_line_id) {
        await supabase.from("maintenance_work_order_lines").update({ part_id: linked }).eq("id", review.work_order_line_id);
      }
      return c.json({ item: review });
    } catch (e) {
      return fail(c, e);
    }
  });

  const listTable = (path: string, table: string) => {
    route.get(path, requireAuth(), async (c: Context) => {
      const denied = staff(c);
      if (denied) return denied;
      try {
        const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e) {
        return fail(c, e);
      }
    });
  };
  listTable("/make-server-37f42386/admin/part-cores", "part_core_return");
  listTable("/make-server-37f42386/admin/part-warranty-claims", "part_warranty_claim");
  listTable("/make-server-37f42386/admin/part-repeat-alerts", "part_repeat_alert");
  listTable("/make-server-37f42386/admin/part-quotes", "part_quote_request");
  listTable("/make-server-37f42386/admin/part-fit-feedback", "part_fit_feedback");

  route.patch("/make-server-37f42386/admin/part-cores/:id", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const status = String(body.status ?? "");
      const patch: Record<string, unknown> = { status };
      if (status === "shipped") patch.shipped_at = new Date().toISOString();
      if (status === "credited") {
        patch.credited_at = new Date().toISOString();
        if (body.credit_amount != null) patch.credit_amount = Number(body.credit_amount);
      }
      const { data, error } = await supabase.from("part_core_return").update(patch).eq("id", c.req.param("id")).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/part-repeat-alerts/:id", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("part_repeat_alert")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
        .eq("id", c.req.param("id"))
        .select("*")
        .single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-repeat-alerts/refresh", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.rpc("refresh_repeat_part_alerts", { p_km: 10000, p_days: 90 });
      if (error) throw error;
      return c.json({ inserted: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/part-quotes", requireAuth(), requirePermission("vehicles.edit"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const supplierIds = Array.isArray(body.supplierIds) ? body.supplierIds.map(String).slice(0, 3) : [];
      const { data, error } = await supabase.from("part_quote_request").insert({
        organization_id: orgId,
        vehicle_id: body.vehicleId ? String(body.vehicleId) : null,
        part_id: body.partId ? String(body.partId) : null,
        part_number: body.partNumber ? String(body.partNumber) : null,
        qty: body.qty != null ? Number(body.qty) : 1,
        needed_by: body.neededBy ? String(body.neededBy) : null,
        supplier_ids: supplierIds,
        note: body.note ? String(body.note).slice(0, 2000) : null,
        status: "open",
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/part-fit-feedback", requireAuth(), requirePermission("vehicles.edit"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const outcome = String(body.outcome ?? "");
      if (!["fit", "no_fit", "modified"].includes(outcome)) return c.json({ error: "Invalid outcome" }, 400);
      const partId = String(body.partId ?? "");
      if (!isUuid(partId)) return c.json({ error: "partId required" }, 400);
      const { data, error } = await supabase.from("part_fit_feedback").insert({
        part_id: partId,
        organization_id: orgId,
        outcome,
        vehicle_catalog_id: body.catalogId && isUuid(String(body.catalogId)) ? String(body.catalogId) : null,
        work_order_line_id: body.workOrderLineId && isUuid(String(body.workOrderLineId)) ? String(body.workOrderLineId) : null,
        notes: body.notes ? String(body.notes).slice(0, 2000) : null,
      }).select("*").single();
      if (error) throw error;
      let catalogId = body.catalogId && isUuid(String(body.catalogId)) ? String(body.catalogId) : null;
      if (!catalogId && body.vehicleId) {
        const vehicle = await kv.get(`vehicle:${String(body.vehicleId)}`);
        if (vehicle && typeof vehicle === "object") {
          catalogId = await resolveCatalogIdForKvVehicle(supabase, vehicle as Record<string, unknown>);
        }
      }
      if (catalogId && data && !(data as { vehicle_catalog_id?: string }).vehicle_catalog_id) {
        await supabase.from("part_fit_feedback").update({ vehicle_catalog_id: catalogId }).eq("id", (data as { id: string }).id);
      }
      if (outcome === "no_fit") {
        await supabase.from("part_rule_review").insert({
          organization_id: orgId,
          part_id: partId,
          vehicle_catalog_id: catalogId,
          work_order_line_id: body.workOrderLineId && isUuid(String(body.workOrderLineId)) ? String(body.workOrderLineId) : null,
          status: "open",
          notes: "Mechanic reported this part did not fit",
        });
      }
      if (outcome === "fit" && catalogId) {
        const { count } = await supabase
          .from("part_fit_feedback")
          .select("id", { count: "exact", head: true })
          .eq("part_id", partId)
          .eq("vehicle_catalog_id", catalogId)
          .eq("outcome", "fit");
        if ((count ?? 0) >= 3) {
          const { data: cat } = await supabase.from("vehicle_catalog").select("platform_id, engine_family_id").eq("id", catalogId).maybeSingle();
          const platformId = (cat as { platform_id?: string } | null)?.platform_id ?? null;
          const engineId = (cat as { engine_family_id?: string } | null)?.engine_family_id ?? null;
          if (platformId || engineId) {
            const { error: propErr } = await supabase.from("part_rule_proposal").insert({
              part_id: partId,
              target_kind: platformId ? "platform" : "engine_family",
              platform_id: platformId,
              engine_family_id: platformId ? null : engineId,
              fit_count: count ?? 3,
              status: "proposed",
            });
            if (propErr && !/duplicate|unique/i.test(propErr.message)) throw propErr;
          }
        }
      }
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/part-warranty-claims", requireAuth(), requirePermission("vehicles.edit"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const partId = String(body.partId ?? "");
      const vehicleId = String(body.vehicleId ?? "");
      if (!isUuid(partId) || !vehicleId) return c.json({ error: "partId and vehicleId required" }, 400);
      const { data, error } = await supabase.from("part_warranty_claim").insert({
        organization_id: orgId,
        part_id: partId,
        vehicle_id: vehicleId,
        supplier_id: body.supplierId && isUuid(String(body.supplierId)) ? String(body.supplierId) : null,
        work_order_line_id: body.workOrderLineId && isUuid(String(body.workOrderLineId)) ? String(body.workOrderLineId) : null,
        notes: body.notes ? String(body.notes) : null,
        status: "open",
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/vehicles/decode-frames", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const body = await c.req.json() as { text?: string; engineNumber?: string; year?: number };
      const decoded = body.text ? decodeFrameBatch(String(body.text)) : [];
      const enginePrefix = engineFamilyPrefix(body.engineNumber ?? null);
      const items = [];
      for (const row of decoded) {
        let matches: { id: string; make: string; model: string; chassis_code: string | null }[] = [];
        if (row.chassisPrefix) {
          const safePrefix = row.chassisPrefix.replace(/[%_\\]/g, "");
          const { data } = await supabase
            .from("vehicle_catalog")
            .select("id, make, model, chassis_code, production_start_year, production_end_year, production_start_month, production_end_month, engine_code")
            .ilike("chassis_code", `${safePrefix}%`)
            .limit(24);
          let rows = (data || []) as Array<{ id: string; make: string; model: string; chassis_code: string | null; production_start_year?: number | null; production_end_year?: number | null }>;
          const year = body.year != null ? Number(body.year) : null;
          if (year && Number.isFinite(year)) {
            const narrowed = rows.filter((r) => {
              const start = r.production_start_year ?? null;
              const end = r.production_end_year ?? null;
              if (start != null && year < start) return false;
              if (end != null && year > end) return false;
              return true;
            });
            if (narrowed.length) rows = narrowed;
          }
          matches = rows.slice(0, 8);
        }
        items.push({
          ...row,
          matchCount: matches.length,
          confidence: matches.length === 1 ? "high" : matches.length > 1 ? "ambiguous" : row.confidence,
          matches,
        });
      }
      return c.json({ items, enginePrefix });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-supplier-search", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const enabled = await isFeatureEnabled(FEATURE_FLAGS.PARTS_SUPPLIER_API);
      if (!enabled) return c.json({ error: "Live supplier feeds are off.", enabled: false }, 403);
      const body = await c.req.json() as { partNumber?: string };
      const partNumber = String(body.partNumber ?? "").trim();
      if (!partNumber) return c.json({ error: "partNumber required" }, 400);
      const norm = partNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const adapter = new CacheOnlySupplierAdapter(async (num) => {
        const key = num.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const { data } = await supabase
          .from("part_supplier_price_cache")
          .select("*")
          .eq("part_number_norm", key)
          .gt("expires_at", new Date().toISOString())
          .limit(10);
        const rows = (data || []) as Array<{
          supplier_key: string;
          unit_price: number | null;
          currency: string | null;
          stock_qty: number | null;
          observed_at: string;
          payload?: { miss?: boolean };
        }>;
        const row = rows.find((r) => r.unit_price != null && r.payload?.miss !== true);
        if (!row) return null;
        return {
          supplierKey: row.supplier_key,
          partNumber: num,
          unitPrice: row.unit_price,
          currency: row.currency,
          stockQty: row.stock_qty,
          observedAt: row.observed_at,
        };
      });
      const hit = await adapter.searchByPartNumber(partNumber);
      return c.json({ enabled: true, hit, partNumber: norm });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/org-part-stock", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("org_part_stock").select("*").order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/org-part-stock", requireAuth(), requirePermission("vehicles.edit"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as Record<string, unknown>;
      const partId = String(body.partId ?? "");
      if (!isUuid(partId)) return c.json({ error: "partId required" }, 400);
      const location = body.location ? String(body.location) : null;
      let stockQuery = supabase.from("org_part_stock").select("id").eq("organization_id", orgId).eq("part_id", partId);
      stockQuery = location ? stockQuery.eq("location", location) : stockQuery.is("location", null);
      const existing = await stockQuery.maybeSingle();
      const row = {
        organization_id: orgId,
        part_id: partId,
        qty: Number(body.qty ?? 0),
        location,
        reorder_point: body.reorderPoint != null ? Number(body.reorderPoint) : null,
        updated_at: new Date().toISOString(),
      };
      const foundId = (existing.data as { id?: string } | null)?.id;
      const { data, error } = foundId
        ? await supabase.from("org_part_stock").update(row).eq("id", foundId).select("*").single()
        : await supabase.from("org_part_stock").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  // Touch decodeFrameNumber so a single frame can be checked without a batch.
  route.get("/make-server-37f42386/part-cores", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const { data, error } = await supabase.from("part_core_return").select("*").eq("organization_id", orgId).order("due_by", { ascending: true });
      if (error) throw error;
      const items = data || [];
      const pending = items.filter((r) => (r as { status?: string }).status === "pending");
      const today = new Date().toISOString().slice(0, 10);
      const overdue = pending.filter((r) => (r as { due_by?: string }).due_by && String((r as { due_by?: string }).due_by) < today);
      const dollars = pending.reduce((s, r) => s + Number((r as { core_charge?: number }).core_charge || 0), 0);
      return c.json({ items, pendingCount: pending.length, overdueCount: overdue.length, pendingAmount: dollars });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/part-warranty-claims", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const { data, error } = await supabase.from("part_warranty_claim").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/part-repeat-alerts", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const { data, error } = await supabase.from("part_repeat_alert").select("*").eq("organization_id", orgId).eq("status", "open").order("created_at", { ascending: false });
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.patch("/make-server-37f42386/admin/part-warranty-claims/:id", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { status?: string };
      const status = String(body.status ?? "");
      if (!["open", "submitted", "credited", "rejected"].includes(status)) return c.json({ error: "Invalid status" }, 400);
      const { data, error } = await supabase.from("part_warranty_claim").update({ status }).eq("id", c.req.param("id")).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-quotes/:id/reply", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const quoteId = c.req.param("id");
      const { data: quote, error: qErr } = await supabase.from("part_quote_request").select("*").eq("id", quoteId).maybeSingle();
      if (qErr) throw qErr;
      if (!quote) return c.json({ error: "Quote not found" }, 404);
      const q = quote as { part_id?: string; supplier_ids?: string[]; organization_id?: string };
      const supplierId = body.supplierId && isUuid(String(body.supplierId)) ? String(body.supplierId) : q.supplier_ids?.[0];
      if (!supplierId || !q.part_id) return c.json({ error: "A supplier and a part are required" }, 400);
      const { data: offer, error: oErr } = await supabase.from("supplier_part_offer").insert({
        supplier_id: supplierId,
        part_id: q.part_id,
        supplier_sku: body.supplierSku ? String(body.supplierSku) : `quote-${quoteId.slice(0, 8)}`,
        unit_price: Number(body.unitPrice ?? 0),
        currency: body.currency ? String(body.currency) : "JMD",
        source: "quote",
        organization_id: q.organization_id ?? null,
        price_observed_at: new Date().toISOString(),
        is_active: true,
      }).select("*").single();
      if (oErr) throw oErr;
      const { error: uErr } = await supabase.from("part_quote_request").update({
        status: "quoted",
        reply_offer_id: (offer as { id: string }).id,
      }).eq("id", quoteId);
      if (uErr) throw uErr;
      return c.json({ offer });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/admin/part-supersession", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { oldPartId?: string; newPartId?: string };
      if (!body.oldPartId || !body.newPartId || !isUuid(body.oldPartId) || !isUuid(body.newPartId)) {
        return c.json({ error: "oldPartId and newPartId required" }, 400);
      }
      const { data, error } = await supabase.from("part_supersession").insert({
        old_part_id: body.oldPartId,
        new_part_id: body.newPartId,
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.get("/make-server-37f42386/admin/part-search", requireAuth(), async (c: Context) => {
    const denied = staff(c);
    if (denied) return denied;
    try {
      const q = c.req.query("q")?.trim() ?? "";
      if (q.length < 2) return c.json({ items: [] });
      const { data, error } = await supabase.rpc("parts_term_search", { p_query: q });
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/vehicles/decode-frames/confirm", requireAuth(), requirePermission("vehicles.edit"), async (c: Context) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 400);
      const body = await c.req.json() as { vehicleId?: string; catalogId?: string; chassisCode?: string; engineCode?: string };
      const vehicleId = String(body.vehicleId ?? "").trim();
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      const vehicle = await kv.get(`vehicle:${vehicleId}`);
      if (!vehicle || typeof vehicle !== "object") return c.json({ error: "Vehicle not found" }, 404);
      const row = vehicle as Record<string, unknown>;
      const owner = String(row.organizationId || row.organization_id || "");
      if (owner && owner !== orgId) return c.json({ error: "Vehicle not found" }, 404);
      const next = {
        ...row,
        vehicle_catalog_id: body.catalogId && isUuid(body.catalogId) ? body.catalogId : row.vehicle_catalog_id,
        vehicle_catalog_chassis_hint: body.chassisCode ? String(body.chassisCode) : row.vehicle_catalog_chassis_hint,
        vehicle_catalog_engine_code_hint: body.engineCode ? String(body.engineCode) : row.vehicle_catalog_engine_code_hint,
      };
      await kv.set(`vehicle:${vehicleId}`, next);
      return c.json({ ok: true, vehicleId });
    } catch (e) {
      return fail(c, e);
    }
  });

  route.post("/make-server-37f42386/vehicles/decode-frame", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const body = await c.req.json() as { value?: string };
      return c.json({ item: decodeFrameNumber(String(body.value ?? "")) });
    } catch (e) {
      return fail(c, e);
    }
  });
}
