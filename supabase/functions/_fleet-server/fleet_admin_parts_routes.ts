/**
 * Roam Fleet admin parts desk. Customer operations live here, not in Dominion.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireProductAdmin } from "./product_admin_guard.ts";
import { listCatalogOrphanVehicles } from "./vehicle_catalog_enterprise.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  patch: (path: string, ...handlers: unknown[]) => void;
};

function fail(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : "Could not load the parts desk.";
  return c.json({ error: message }, 500);
}

async function allow(c: Context) {
  const auth = await requireProductAdmin(c, "fleet");
  if (auth instanceof Response) return auth;
  return null;
}

export function registerFleetAdminPartsRoutes(route: RouteApp, supabase: SupabaseClient) {
  const list = (path: string, table: string) => {
    route.get(path, async (c: Context) => {
      const denied = await allow(c);
      if (denied) return denied;
      try {
        const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (error) {
        return fail(c, error);
      }
    });
  };

  const root = "/make-server-37f42386/fleet-admin/parts";
  list(`${root}/requests`, "parts_sourcing_requests");
  list(`${root}/quotes`, "part_quote_request");
  list(`${root}/cores`, "part_core_return");
  list(`${root}/claims`, "part_warranty_claim");
  list(`${root}/alerts`, "part_repeat_alert");
  list(`${root}/stock`, "org_part_stock");

  route.get(`${root}/offers`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("supplier_part_offer")
        .select("*, supplier ( id, name ), part_master ( id, name )")
        .not("organization_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get(`${root}/orphans`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const items = await listCatalogOrphanVehicles(supabase);
      return c.json({ items, total: items.length });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post(`${root}/orphans/relink`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { vehicleId?: string; catalogId?: string };
      const vehicleId = String(body.vehicleId ?? "").trim();
      const catalogId = String(body.catalogId ?? "").trim();
      if (!vehicleId || !UUID_RE.test(catalogId)) return c.json({ error: "A vehicle and a catalog variant are required." }, 400);
      const raw = await kv.get(`vehicle:${vehicleId}`);
      if (!raw || typeof raw !== "object") return c.json({ error: "Vehicle not found" }, 404);
      const { data: variant, error } = await supabase.from("vehicle_catalog").select("id").eq("id", catalogId).maybeSingle();
      if (error) throw error;
      if (!variant) return c.json({ error: "Variant not found" }, 404);
      await kv.set(`vehicle:${vehicleId}`, {
        ...(raw as Record<string, unknown>),
        vehicle_catalog_id: catalogId,
        catalogStatus: "matched",
      });
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch(`${root}/requests/:id`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const status = String(body.status ?? "").trim();
      if (!["open", "in_progress", "resolved", "rejected"].includes(status)) return c.json({ error: "Invalid status" }, 400);
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (body.adminNote != null) patch.admin_note = String(body.adminNote).slice(0, 2000);
      if (status === "resolved" || status === "rejected") patch.resolved_at = new Date().toISOString();
      if (body.resolvedPartId !== undefined) {
        patch.resolved_part_id = body.resolvedPartId ? String(body.resolvedPartId) : null;
      }
      if (body.catalogTask) {
        const task = body.catalogTask as { vehicleCatalogId?: string; componentId?: string; note?: string };
        await supabase.from("catalog_task").insert({
          vehicle_catalog_id: task.vehicleCatalogId && UUID_RE.test(task.vehicleCatalogId) ? task.vehicleCatalogId : null,
          component_id: task.componentId && UUID_RE.test(task.componentId) ? task.componentId : null,
          kind: "add_part",
          note: task.note ? String(task.note).slice(0, 2000) : null,
        });
      }
      const { data, error } = await supabase.from("parts_sourcing_requests").update(patch).eq("id", c.req.param("id")).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch(`${root}/cores/:id`, async (c: Context) => {
    const denied = await allow(c);
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
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch(`${root}/claims/:id`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const status = String((await c.req.json() as { status?: string }).status ?? "");
      if (!["open", "submitted", "credited", "rejected"].includes(status)) return c.json({ error: "Invalid status" }, 400);
      const { data, error } = await supabase.from("part_warranty_claim").update({ status }).eq("id", c.req.param("id")).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch(`${root}/alerts/:id`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("part_repeat_alert").update({ status: "dismissed" }).eq("id", c.req.param("id")).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.post(`${root}/quotes/:id/reply`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const quoteId = c.req.param("id");
      const { data: quote, error: qErr } = await supabase.from("part_quote_request").select("*").eq("id", quoteId).maybeSingle();
      if (qErr) throw qErr;
      if (!quote) return c.json({ error: "Quote not found" }, 404);
      const q = quote as { part_id?: string; supplier_ids?: string[]; organization_id?: string };
      const supplierId = body.supplierId && UUID_RE.test(String(body.supplierId)) ? String(body.supplierId) : q.supplier_ids?.[0];
      if (!supplierId || !q.part_id) return c.json({ error: "A supplier and a part are required" }, 400);
      const { data: offer, error: oErr } = await supabase.from("supplier_part_offer").insert({
        supplier_id: supplierId,
        part_id: q.part_id,
        supplier_sku: body.supplierSku ? String(body.supplierSku) : `quote-${quoteId.slice(0, 8)}`,
        unit_price: Number(body.unitPrice ?? 0),
        currency: body.currency ? String(body.currency) : "JMD",
        lead_time_days: body.leadTimeDays != null && body.leadTimeDays !== "" ? Number(body.leadTimeDays) : null,
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
    } catch (error) {
      return fail(c, error);
    }
  });

  route.get(`${root}/link-reviews`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("part_number_link_review")
        .select("id, organization_id, part_number, candidate_count, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (error) {
      return fail(c, error);
    }
  });

  route.patch(`${root}/link-reviews/:id`, async (c: Context) => {
    const denied = await allow(c);
    if (denied) return denied;
    try {
      const body = await c.req.json() as { status?: string; partNumber?: string };
      const status = String(body.status ?? "");
      if (!["linked", "dismissed"].includes(status)) return c.json({ error: "Choose link or dismiss." }, 400);
      let linked: string | null = null;
      if (status === "linked") {
        const number = String(body.partNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!number) return c.json({ error: "Enter the catalog part number." }, 400);
        const { data: part, error: partErr } = await supabase
          .from("part_master")
          .select("id")
          .eq("oem_part_number_norm", number)
          .maybeSingle();
        if (partErr) throw partErr;
        if (!part) return c.json({ error: "That catalog part number was not found." }, 404);
        linked = String((part as { id: string }).id);
      }
      const { data: review, error } = await supabase
        .from("part_number_link_review")
        .update({ status, linked_part_id: linked })
        .eq("id", c.req.param("id"))
        .select("id, work_order_line_id, status")
        .single();
      if (error) throw error;
      if (status === "linked" && linked && review?.work_order_line_id) {
        await supabase.from("maintenance_work_order_lines").update({ part_id: linked }).eq("id", review.work_order_line_id);
      }
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });
}
