import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
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
      return c.json({ coverage: data });
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
      const { data, error } = await supabase.from("interchange_fitment_rule").insert({
        interchange_group_id,
        target_kind,
        engine_family_id: body.engine_family_id ? String(body.engine_family_id) : null,
        platform_id: body.platform_id ? String(body.platform_id) : null,
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
        .update({ status: "dismissed" })
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
      if (outcome === "no_fit") {
        await supabase.from("part_repeat_alert").insert({
          organization_id: orgId,
          kind: "component",
          status: "open",
          detail: `Mechanic reported no fit for part ${partId}`,
          part_number: partId,
        });
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
      const body = await c.req.json() as { text?: string; engineNumber?: string };
      const decoded = body.text ? decodeFrameBatch(String(body.text)) : [];
      const enginePrefix = engineFamilyPrefix(body.engineNumber ?? null);
      const items = [];
      for (const row of decoded) {
        let matches: { id: string; make: string; model: string; chassis_code: string | null }[] = [];
        if (row.chassisPrefix) {
          const { data } = await supabase
            .from("vehicle_catalog")
            .select("id, make, model, chassis_code")
            .ilike("chassis_code", `${row.chassisPrefix}%`)
            .limit(8);
          matches = (data || []) as typeof matches;
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
          .maybeSingle();
        if (!data) return null;
        const row = data as {
          supplier_key: string;
          unit_price: number | null;
          currency: string | null;
          stock_qty: number | null;
          observed_at: string;
        };
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
      if (!hit) {
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await supabase.from("part_supplier_price_cache").upsert({
          supplier_key: "cache",
          part_number_norm: norm,
          observed_at: new Date().toISOString(),
          expires_at: expires,
          payload: { miss: true },
        }, { onConflict: "supplier_key,part_number_norm" });
      }
      return c.json({ enabled: true, hit });
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
      const { data, error } = await supabase.from("org_part_stock").insert({
        organization_id: orgId,
        part_id: partId,
        qty: Number(body.qty ?? 0),
        location: body.location ? String(body.location) : null,
        reorder_point: body.reorderPoint != null ? Number(body.reorderPoint) : null,
        updated_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e) {
      return fail(c, e);
    }
  });

  // Touch decodeFrameNumber so a single frame can be checked without a batch.
  route.post("/make-server-37f42386/vehicles/decode-frame", requireAuth(), requirePermission("vehicles.view"), async (c: Context) => {
    try {
      const body = await c.req.json() as { value?: string };
      return c.json({ item: decodeFrameNumber(String(body.value ?? "")) });
    } catch (e) {
      return fail(c, e);
    }
  });
}
