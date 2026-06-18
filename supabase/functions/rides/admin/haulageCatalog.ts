/**
 * Admin CRUD for haulage freight catalog + body capacity.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { invalidateHaulageCatalogCache } from "../haulage/catalogDb.ts";
import { invalidateVehicleTypesCache } from "../fare/vehicleTypesDb.ts";
import { invalidateServiceMatchingCache } from "../fare/serviceMatching.ts";

type DbBundle = {
  db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
  tables: Record<string, string>;
};

const CATEGORIES = "rides_haulage_categories";
const SUBGROUPS = "rides_haulage_item_subgroups";
const ITEMS = "rides_haulage_items";
const VARIANTS = "rides_haulage_item_variants";
const VEHICLE_TYPES = "rides_vehicle_types";

export function registerHaulageCatalogAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: (c: { json: (body: unknown, status?: number) => Response }) => Promise<DbBundle | Response>,
) {
  admin.get("/haulage/categories", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db } = resolved;
    const { data, error } = await db.from(CATEGORIES).select("*").order("sort_order");
    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    return c.json({ categories: data ?? [] });
  });

  admin.post("/haulage/categories", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db } = resolved;
    const row = {
      id: String(body.id ?? "").trim().toLowerCase(),
      title: String(body.title ?? "").trim(),
      description: String(body.description ?? ""),
      icon: String(body.icon ?? "inventory_2"),
      sort_order: Number(body.sort_order ?? 50),
      is_active: body.is_active !== false,
    };
    if (!row.id || !row.title) return c.json({ error: "invalid_category" }, 400);
    const { data, error } = await db.from(CATEGORIES).upsert(row).select("*").single();
    if (error) return c.json({ error: "save_failed", message: error.message }, 500);
    invalidateHaulageCatalogCache();
    return c.json({ category: data });
  });

  admin.patch("/haulage/categories/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = decodeURIComponent(c.req.param("id"));
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const patch: Record<string, unknown> = {};
    for (const key of ["title", "description", "icon", "sort_order", "is_active"] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await resolved.db.from(CATEGORIES).update(patch).eq("id", id).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    invalidateHaulageCatalogCache();
    return c.json({ category: data });
  });

  admin.get("/haulage/items", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const categoryId = c.req.query("category_id")?.trim();
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    let q = resolved.db.from(ITEMS).select("*").order("sort_order");
    if (categoryId) q = q.eq("category_id", categoryId);
    const { data: items, error } = await q;
    if (error) return c.json({ error: "list_failed", message: error.message }, 500);
    const ids = (items ?? []).map((i: { id: string }) => i.id);
    let variants: unknown[] = [];
    if (ids.length) {
      const { data: v } = await resolved.db.from(VARIANTS).select("*").in("item_id", ids).order("sort_order");
      variants = v ?? [];
    }
    const byItem = new Map<string, unknown[]>();
    for (const v of variants as { item_id: string }[]) {
      const list = byItem.get(v.item_id) ?? [];
      list.push(v);
      byItem.set(v.item_id, list);
    }
    return c.json({
      items: (items ?? []).map((item: { id: string }) => ({
        ...item,
        variants: byItem.get(item.id) ?? [],
      })),
    });
  });

  admin.post("/haulage/items", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const row = {
      id: String(body.id ?? "").trim().toLowerCase(),
      category_id: String(body.category_id ?? "").trim(),
      subgroup_id: body.subgroup_id ? String(body.subgroup_id) : null,
      title: String(body.title ?? "").trim(),
      subtitle: String(body.subtitle ?? ""),
      icon: String(body.icon ?? "inventory_2"),
      emoji: body.emoji ? String(body.emoji) : null,
      sort_order: Number(body.sort_order ?? 50),
      is_active: body.is_active !== false,
      requires_manual_specs: body.requires_manual_specs === true,
    };
    if (!row.id || !row.title || !row.category_id) return c.json({ error: "invalid_item" }, 400);
    const { data, error } = await resolved.db.from(ITEMS).upsert(row).select("*").single();
    if (error) return c.json({ error: "save_failed", message: error.message }, 500);
    invalidateHaulageCatalogCache();
    return c.json({ item: data });
  });

  admin.patch("/haulage/items/:id", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const id = decodeURIComponent(c.req.param("id"));
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const patch: Record<string, unknown> = {};
    for (const key of [
      "category_id", "subgroup_id", "title", "subtitle", "icon", "emoji",
      "sort_order", "is_active", "requires_manual_specs",
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await resolved.db.from(ITEMS).update(patch).eq("id", id).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    invalidateHaulageCatalogCache();
    return c.json({ item: data });
  });

  admin.put("/haulage/items/:itemId/variants/:variantId", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const itemId = decodeURIComponent(c.req.param("itemId"));
    const variantId = decodeURIComponent(c.req.param("variantId"));
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const weight = Number(body.weight_kg);
    if (!Number.isFinite(weight) || weight <= 0) return c.json({ error: "invalid_weight" }, 400);
    const row = {
      item_id: itemId,
      id: variantId,
      label: String(body.label ?? variantId).trim(),
      sort_order: Number(body.sort_order ?? 10),
      is_active: body.is_active !== false,
      weight_kg: weight,
      length_cm: body.length_cm != null ? Number(body.length_cm) : null,
      width_cm: body.width_cm != null ? Number(body.width_cm) : null,
      height_cm: body.height_cm != null ? Number(body.height_cm) : null,
      min_body_type_slug: body.min_body_type_slug ? String(body.min_body_type_slug) : null,
      upright_only: body.upright_only === true,
      fragile_default: body.fragile_default === true,
      requires_disassembly_default: body.requires_disassembly_default === true,
      gear_tags: Array.isArray(body.gear_tags) ? body.gear_tags.map(String) : [],
    };
    const { data, error } = await resolved.db.from(VARIANTS).upsert(row).select("*").single();
    if (error) return c.json({ error: "save_failed", message: error.message }, 500);
    invalidateHaulageCatalogCache();
    return c.json({ variant: data });
  });

  admin.patch("/vehicle-types/:slug/capacity", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;
    const slug = decodeURIComponent(c.req.param("slug")).trim().toLowerCase();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { data: existing } = await resolved.db.from(VEHICLE_TYPES)
      .select("slug, solution_kind").eq("slug", slug).maybeSingle();
    if (!existing || (existing as { solution_kind: string }).solution_kind !== "vehicle") {
      return c.json({ error: "not_a_body_type" }, 404);
    }
    const patch: Record<string, unknown> = {};
    for (const key of [
      "max_payload_kg", "cargo_length_cm", "cargo_width_cm", "cargo_height_cm", "supports_upright_load",
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    const { data, error } = await resolved.db.from(VEHICLE_TYPES).update(patch).eq("slug", slug).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    invalidateVehicleTypesCache();
    invalidateServiceMatchingCache();
    return c.json({ vehicle_type: data });
  });
}
