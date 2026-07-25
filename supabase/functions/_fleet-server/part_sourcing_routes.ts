/**
 * Motor parts sourcing — master data CRUD (Super Admin) + fleet compatible-parts read.
 */
import type { Context } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { filterByOrg } from "./org_scope.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

// Wave 5: DRY — use shared assertPlatformStaffResponse from rbac_middleware
const assertPartSourcingPlatformAccess = assertPlatformStaffResponse;

function normCode(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim().toUpperCase();
}

function chassisMatchesFitment(
  fitmentChassis: string | null | undefined,
  catalogChassis: string,
  hintChassis: string,
): boolean {
  const f = normCode(fitmentChassis);
  if (!f) return true;
  return f === normCode(catalogChassis) || (hintChassis.length > 0 && f === hintChassis);
}

function engineMatchesFitment(
  fitmentEngine: string | null | undefined,
  catalogEngine: string,
  hintEngine: string,
): boolean {
  const f = normCode(fitmentEngine);
  if (!f) return true;
  return f === normCode(catalogEngine) || (hintEngine.length > 0 && f === hintEngine);
}

function yearInFitmentRange(
  yearFrom: number | null | undefined,
  yearTo: number | null | undefined,
  vehicleYear: number | null,
): boolean {
  if (vehicleYear == null || !Number.isFinite(vehicleYear)) return true;
  if (yearFrom != null && Number.isFinite(yearFrom) && vehicleYear < yearFrom) return false;
  if (yearTo != null && Number.isFinite(yearTo) && vehicleYear > yearTo) return false;
  return true;
}

async function getVehicleFromKv(c: Context, vehicleId: string): Promise<Record<string, unknown> | null> {
  const raw = await kv.get(`vehicle:${vehicleId}`);
  if (!raw || typeof raw !== "object") return null;
  const scoped = filterByOrg([raw as Record<string, unknown>], c);
  return scoped[0] ?? null;
}

function parseVehicleYear(v: Record<string, unknown>): number | null {
  const y = v.year;
  if (y === undefined || y === null || y === "") return null;
  const n = Number(String(y).trim());
  return Number.isFinite(n) ? n : null;
}

const FITMENT_SELECT =
  "id, part_id, vehicle_catalog_id, chassis_code, engine_code, year_from, year_to, part_master ( id, category_id, name, oem_part_number, description, metadata, part_category ( id, slug, label, parent_id, sort_order ) )";

export function registerPartSourcingRoutes(
  app: { get: unknown; post: unknown; patch: unknown; delete: unknown },
  supabase: SupabaseClient,
) {
  const route = app as {
    get: (path: string, ...handlers: unknown[]) => void;
    post: (path: string, ...handlers: unknown[]) => void;
    patch: (path: string, ...handlers: unknown[]) => void;
    delete: (path: string, ...handlers: unknown[]) => void;
  };

  route.get(
    "/make-server-37f42386/vehicles/:vehicleId/compatible-parts",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId")?.trim() ?? "";
        if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
        const v = await getVehicleFromKv(c, vehicleId);
        if (!v) return c.json({ error: "Vehicle not found" }, 404);

        const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
        if (!catalogId) {
          return c.json({
            items: [],
            catalogMatched: false,
            message: "Link this vehicle to the motor catalog to see compatible parts.",
          });
        }

        const categoryId = c.req.query("category_id")?.trim() || "";

        const { data: catRow, error: catErr } = await supabase
          .from("vehicle_catalog")
          .select("id, chassis_code, engine_code")
          .eq("id", catalogId)
          .maybeSingle();
        if (catErr) throw catErr;
        const catalogChassis = String((catRow as { chassis_code?: string } | null)?.chassis_code ?? "");
        const catalogEngine = String((catRow as { engine_code?: string } | null)?.engine_code ?? "");

        const hintChassis = normCode(
          v.vehicle_catalog_chassis_hint ?? v.vehicle_catalog_generation_hint ?? "",
        );
        const hintEngine = normCode(v.vehicle_catalog_engine_code_hint ?? "");
        const vehicleYear = parseVehicleYear(v);

        const { data: fitRows, error: fitErr } = await supabase
          .from("part_fitment")
          .select(FITMENT_SELECT)
          .eq("vehicle_catalog_id", catalogId);
        if (fitErr) throw fitErr;

        type FitRow = {
          id: string;
          part_id: string;
          chassis_code?: string | null;
          engine_code?: string | null;
          year_from?: number | null;
          year_to?: number | null;
          part_master: {
            id: string;
            category_id: string;
            name: string;
            oem_part_number?: string | null;
            description?: string | null;
            metadata?: unknown;
            part_category: { id: string; slug: string; label: string; parent_id?: string | null; sort_order?: number };
          } | null;
        };

        const matched: FitRow[] = [];
        for (const raw of fitRows || []) {
          const row = raw as FitRow;
          if (!row.part_master) continue;
          if (categoryId && isUuid(categoryId) && row.part_master.category_id !== categoryId) continue;
          if (
            !yearInFitmentRange(row.year_from, row.year_to, vehicleYear) ||
            !chassisMatchesFitment(row.chassis_code, catalogChassis, hintChassis) ||
            !engineMatchesFitment(row.engine_code, catalogEngine, hintEngine)
          ) {
            continue;
          }
          matched.push(row);
        }

        const partIds = [...new Set(matched.map((m) => m.part_id))];
        const offersByPart: Record<string, unknown[]> = {};
        if (partIds.length) {
          const { data: offers, error: offErr } = await supabase
            .from("supplier_part_offer")
            .select(
              "id, supplier_id, part_id, supplier_sku, unit_price, currency, moq, lead_time_days, url, is_active, supplier ( id, name, default_lead_time_days )",
            )
            .in("part_id", partIds)
            .eq("is_active", true);
          if (offErr) throw offErr;
          for (const o of offers || []) {
            const pid = String((o as { part_id: string }).part_id);
            if (!offersByPart[pid]) offersByPart[pid] = [];
            offersByPart[pid].push(o);
          }
        }

        const items = matched.map((m) => ({
          fitmentId: m.id,
          part: m.part_master,
          offers: offersByPart[m.part_id] ?? [],
        }));

        return c.json({
          catalogMatched: true,
          catalogId,
          items,
          count: items.length,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get("/make-server-37f42386/admin/part-categories", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase
        .from("part_category")
        .select("id, parent_id, slug, label, sort_order, created_at, updated_at")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;

      const { data: counts } = await supabase.from("part_master").select("category_id");
      const countByCat: Record<string, number> = {};
      for (const r of counts || []) {
        const cid = String((r as { category_id: string }).category_id);
        countByCat[cid] = (countByCat[cid] || 0) + 1;
      }

      const items = (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        part_count: countByCat[String(row.id)] || 0,
      }));
      return c.json({ items });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post("/make-server-37f42386/admin/part-categories", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const slug = String(body.slug ?? "").trim().toLowerCase().replace(/\s+/g, "-");
      const label = String(body.label ?? "").trim();
      const sort_order = body.sort_order != null ? Number(body.sort_order) : 0;
      const parent_id = body.parent_id != null && String(body.parent_id).trim() !== ""
        ? String(body.parent_id).trim()
        : null;
      if (!slug || !label) return c.json({ error: "slug and label are required" }, 400);
      if (parent_id && !isUuid(parent_id)) return c.json({ error: "Invalid parent_id" }, 400);

      const row = {
        slug,
        label,
        sort_order: Number.isFinite(sort_order) ? sort_order : 0,
        parent_id,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("part_category").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.patch("/make-server-37f42386/admin/part-categories/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const body = (await c.req.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.label !== undefined) row.label = String(body.label).trim();
      if (body.slug !== undefined) {
        row.slug = String(body.slug).trim().toLowerCase().replace(/\s+/g, "-");
      }
      if (body.sort_order !== undefined) {
        const n = Number(body.sort_order);
        row.sort_order = Number.isFinite(n) ? n : 0;
      }
      if (body.parent_id !== undefined) {
        const p = body.parent_id;
        row.parent_id = p === null || p === "" ? null : String(p);
        if (row.parent_id && !isUuid(String(row.parent_id))) return c.json({ error: "Invalid parent_id" }, 400);
        if (row.parent_id === id) return c.json({ error: "Category cannot be its own parent" }, 400);
      }
      const keys = Object.keys(row).filter((k) => k !== "updated_at");
      if (keys.length === 0) return c.json({ error: "No fields to update" }, 400);
      const { data, error } = await supabase.from("part_category").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.delete("/make-server-37f42386/admin/part-categories/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const { data: children } = await supabase.from("part_category").select("id").eq("parent_id", id).limit(1);
      if (children?.length) return c.json({ error: "Remove child categories first" }, 400);
      const { data: parts } = await supabase.from("part_master").select("id").eq("category_id", id).limit(1);
      if (parts?.length) return c.json({ error: "Reassign or delete parts in this category first" }, 400);
      const { data, error } = await supabase.from("part_category").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "Not found" }, 404);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.get("/make-server-37f42386/admin/part-parts", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const categoryId = c.req.query("category_id")?.trim() || "";
      let q = supabase
        .from("part_master")
        .select("*, part_category ( id, slug, label )")
        .order("name", { ascending: true });
      if (categoryId && isUuid(categoryId)) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post("/make-server-37f42386/admin/part-parts", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const category_id = String(body.category_id ?? "").trim();
      const name = String(body.name ?? "").trim();
      if (!isUuid(category_id) || !name) return c.json({ error: "category_id and name are required" }, 400);
      const row: Record<string, unknown> = {
        category_id,
        name,
        oem_part_number: body.oem_part_number != null && String(body.oem_part_number).trim() !== ""
          ? String(body.oem_part_number).trim()
          : null,
        description: body.description != null && String(body.description).trim() !== ""
          ? String(body.description).trim()
          : null,
        metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("part_master").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.patch("/make-server-37f42386/admin/part-parts/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const body = (await c.req.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.category_id !== undefined) {
        const cid = String(body.category_id).trim();
        if (!isUuid(cid)) return c.json({ error: "Invalid category_id" }, 400);
        row.category_id = cid;
      }
      if (body.name !== undefined) row.name = String(body.name).trim();
      if (body.oem_part_number !== undefined) {
        row.oem_part_number = body.oem_part_number === null || body.oem_part_number === ""
          ? null
          : String(body.oem_part_number).trim();
      }
      if (body.description !== undefined) {
        row.description = body.description === null || body.description === ""
          ? null
          : String(body.description).trim();
      }
      if (body.metadata !== undefined) row.metadata = body.metadata;
      const keys = Object.keys(row).filter((k) => k !== "updated_at");
      if (keys.length === 0) return c.json({ error: "No fields to update" }, 400);
      const { data, error } = await supabase.from("part_master").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.delete("/make-server-37f42386/admin/part-parts/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const { data, error } = await supabase.from("part_master").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "Not found" }, 404);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.get("/make-server-37f42386/admin/part-suppliers", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const { data, error } = await supabase.from("supplier").select("*").order("name", { ascending: true });
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post("/make-server-37f42386/admin/part-suppliers", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      if (!name) return c.json({ error: "name is required" }, 400);
      const row: Record<string, unknown> = {
        name,
        contact_email: body.contact_email != null && String(body.contact_email).trim() !== ""
          ? String(body.contact_email).trim()
          : null,
        contact_phone: body.contact_phone != null && String(body.contact_phone).trim() !== ""
          ? String(body.contact_phone).trim()
          : null,
        default_lead_time_days: body.default_lead_time_days != null && body.default_lead_time_days !== ""
          ? Number(body.default_lead_time_days)
          : null,
        notes: body.notes != null && String(body.notes).trim() !== "" ? String(body.notes).trim() : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("supplier").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.patch("/make-server-37f42386/admin/part-suppliers/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const body = (await c.req.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) row.name = String(body.name).trim();
      if (body.contact_email !== undefined) {
        row.contact_email = body.contact_email === null || body.contact_email === ""
          ? null
          : String(body.contact_email).trim();
      }
      if (body.contact_phone !== undefined) {
        row.contact_phone = body.contact_phone === null || body.contact_phone === ""
          ? null
          : String(body.contact_phone).trim();
      }
      if (body.default_lead_time_days !== undefined) {
        row.default_lead_time_days = body.default_lead_time_days === null || body.default_lead_time_days === ""
          ? null
          : Number(body.default_lead_time_days);
      }
      if (body.notes !== undefined) {
        row.notes = body.notes === null || body.notes === "" ? null : String(body.notes).trim();
      }
      const keys = Object.keys(row).filter((k) => k !== "updated_at");
      if (keys.length === 0) return c.json({ error: "No fields to update" }, 400);
      const { data, error } = await supabase.from("supplier").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.delete("/make-server-37f42386/admin/part-suppliers/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const { data, error } = await supabase.from("supplier").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "Not found" }, 404);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.get("/make-server-37f42386/admin/part-offers", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const partId = c.req.query("part_id")?.trim() || "";
      const supplierId = c.req.query("supplier_id")?.trim() || "";
      let q = supabase
        .from("supplier_part_offer")
        .select("*, supplier ( id, name ), part_master ( id, name )")
        .order("updated_at", { ascending: false });
      if (partId && isUuid(partId)) q = q.eq("part_id", partId);
      if (supplierId && isUuid(supplierId)) q = q.eq("supplier_id", supplierId);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post("/make-server-37f42386/admin/part-offers", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const supplier_id = String(body.supplier_id ?? "").trim();
      const part_id = String(body.part_id ?? "").trim();
      const supplier_sku = String(body.supplier_sku ?? "").trim();
      if (!isUuid(supplier_id) || !isUuid(part_id) || !supplier_sku) {
        return c.json({ error: "supplier_id, part_id, and supplier_sku are required" }, 400);
      }
      const unit_price = body.unit_price != null ? Number(body.unit_price) : 0;
      const row: Record<string, unknown> = {
        supplier_id,
        part_id,
        supplier_sku,
        unit_price: Number.isFinite(unit_price) ? unit_price : 0,
        currency: body.currency != null && String(body.currency).trim() !== "" ? String(body.currency).trim() : "USD",
        moq: body.moq != null && Number(body.moq) >= 1 ? Math.floor(Number(body.moq)) : 1,
        lead_time_days: body.lead_time_days != null && body.lead_time_days !== ""
          ? Number(body.lead_time_days)
          : null,
        url: body.url != null && String(body.url).trim() !== "" ? String(body.url).trim() : null,
        is_active: body.is_active === false ? false : true,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("supplier_part_offer").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.patch("/make-server-37f42386/admin/part-offers/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const body = (await c.req.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.unit_price !== undefined) row.unit_price = Number(body.unit_price);
      if (body.currency !== undefined) row.currency = String(body.currency).trim();
      if (body.moq !== undefined) row.moq = Math.max(1, Math.floor(Number(body.moq)));
      if (body.lead_time_days !== undefined) {
        row.lead_time_days = body.lead_time_days === null || body.lead_time_days === ""
          ? null
          : Number(body.lead_time_days);
      }
      if (body.url !== undefined) {
        row.url = body.url === null || body.url === "" ? null : String(body.url).trim();
      }
      if (body.is_active !== undefined) row.is_active = Boolean(body.is_active);
      if (body.supplier_sku !== undefined) row.supplier_sku = String(body.supplier_sku).trim();
      const keys = Object.keys(row).filter((k) => k !== "updated_at");
      if (keys.length === 0) return c.json({ error: "No fields to update" }, 400);
      const { data, error } = await supabase.from("supplier_part_offer").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.delete("/make-server-37f42386/admin/part-offers/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const { data, error } = await supabase.from("supplier_part_offer").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "Not found" }, 404);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.get("/make-server-37f42386/admin/part-fitment", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const catalogId = c.req.query("vehicle_catalog_id")?.trim() || "";
      const partId = c.req.query("part_id")?.trim() || "";
      let q = supabase
        .from("part_fitment")
        .select("*, part_master ( id, name, oem_part_number )")
        .order("created_at", { ascending: false });
      if (catalogId && isUuid(catalogId)) q = q.eq("vehicle_catalog_id", catalogId);
      if (partId && isUuid(partId)) q = q.eq("part_id", partId);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.post("/make-server-37f42386/admin/part-fitment", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const part_id = String(body.part_id ?? "").trim();
      const vehicle_catalog_id = String(body.vehicle_catalog_id ?? "").trim();
      if (!isUuid(part_id) || !isUuid(vehicle_catalog_id)) {
        return c.json({ error: "part_id and vehicle_catalog_id are required UUIDs" }, 400);
      }
      const row: Record<string, unknown> = {
        part_id,
        vehicle_catalog_id,
        chassis_code: body.chassis_code != null && String(body.chassis_code).trim() !== ""
          ? String(body.chassis_code).trim()
          : null,
        engine_code: body.engine_code != null && String(body.engine_code).trim() !== ""
          ? String(body.engine_code).trim()
          : null,
        year_from: body.year_from != null && body.year_from !== "" ? Number(body.year_from) : null,
        year_to: body.year_to != null && body.year_to !== "" ? Number(body.year_to) : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("part_fitment").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.patch("/make-server-37f42386/admin/part-fitment/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const body = (await c.req.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.chassis_code !== undefined) {
        row.chassis_code = body.chassis_code === null || body.chassis_code === ""
          ? null
          : String(body.chassis_code).trim();
      }
      if (body.engine_code !== undefined) {
        row.engine_code = body.engine_code === null || body.engine_code === ""
          ? null
          : String(body.engine_code).trim();
      }
      if (body.year_from !== undefined) {
        row.year_from = body.year_from === null || body.year_from === "" ? null : Number(body.year_from);
      }
      if (body.year_to !== undefined) {
        row.year_to = body.year_to === null || body.year_to === "" ? null : Number(body.year_to);
      }
      const keys = Object.keys(row).filter((k) => k !== "updated_at");
      if (keys.length === 0) return c.json({ error: "No fields to update" }, 400);
      const { data, error } = await supabase.from("part_fitment").update(row).eq("id", id).select("*").single();
      if (error) throw error;
      if (!data) return c.json({ error: "Not found" }, 404);
      return c.json({ item: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.delete("/make-server-37f42386/admin/part-fitment/:id", requireAuth(), async (c) => {
    const denied = assertPartSourcingPlatformAccess(c);
    if (denied) return denied;
    try {
      const id = c.req.param("id");
      if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
      const { data, error } = await supabase.from("part_fitment").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return c.json({ error: "Not found" }, 404);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  route.get(
    "/make-server-37f42386/admin/part-catalog/:vehicleCatalogId/parts-preview",
    requireAuth(),
    async (c) => {
      const denied = assertPartSourcingPlatformAccess(c);
      if (denied) return denied;
      try {
        const vehicleCatalogId = c.req.param("vehicleCatalogId")?.trim() ?? "";
        if (!isUuid(vehicleCatalogId)) return c.json({ error: "Invalid vehicleCatalogId" }, 400);
        const categoryId = c.req.query("category_id")?.trim() || "";

        const { data: catRow, error: catErr } = await supabase
          .from("vehicle_catalog")
          .select("id, chassis_code, engine_code, production_start_year, production_end_year")
          .eq("id", vehicleCatalogId)
          .maybeSingle();
        if (catErr) throw catErr;
        if (!catRow) return c.json({ error: "Catalog row not found" }, 404);

        const catalogChassis = String((catRow as { chassis_code?: string }).chassis_code ?? "");
        const catalogEngine = String((catRow as { engine_code?: string }).engine_code ?? "");
        const vehicleYear = (catRow as { production_start_year?: number }).production_start_year != null
          ? Number((catRow as { production_start_year: number }).production_start_year)
          : null;

        const { data: fitRows, error: fitErr } = await supabase
          .from("part_fitment")
          .select(FITMENT_SELECT)
          .eq("vehicle_catalog_id", vehicleCatalogId);
        if (fitErr) throw fitErr;

        type FitRow = {
          id: string;
          part_id: string;
          chassis_code?: string | null;
          engine_code?: string | null;
          year_from?: number | null;
          year_to?: number | null;
          part_master: {
            id: string;
            category_id: string;
            name: string;
            oem_part_number?: string | null;
            part_category: { id: string; slug: string; label: string };
          } | null;
        };

        const matched: FitRow[] = [];
        for (const raw of fitRows || []) {
          const row = raw as FitRow;
          if (!row.part_master) continue;
          if (categoryId && isUuid(categoryId) && row.part_master.category_id !== categoryId) continue;
          if (
            !yearInFitmentRange(row.year_from, row.year_to, vehicleYear) ||
            !chassisMatchesFitment(row.chassis_code, catalogChassis, "") ||
            !engineMatchesFitment(row.engine_code, catalogEngine, "")
          ) {
            continue;
          }
          matched.push(row);
        }

        const partIds = [...new Set(matched.map((m) => m.part_id))];
        const offersByPart: Record<string, unknown[]> = {};
        if (partIds.length) {
          const { data: offers, error: offErr } = await supabase
            .from("supplier_part_offer")
            .select(
              "id, supplier_id, part_id, supplier_sku, unit_price, currency, moq, lead_time_days, url, is_active, supplier ( id, name, default_lead_time_days )",
            )
            .in("part_id", partIds)
            .eq("is_active", true);
          if (offErr) throw offErr;
          for (const o of offers || []) {
            const pid = String((o as { part_id: string }).part_id);
            if (!offersByPart[pid]) offersByPart[pid] = [];
            offersByPart[pid].push(o);
          }
        }

        const items = matched.map((m) => ({
          fitmentId: m.id,
          part: m.part_master,
          offers: offersByPart[m.part_id] ?? [],
        }));

        return c.json({ catalogId: vehicleCatalogId, items, count: items.length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
