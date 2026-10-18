/**
 * Menu library admin: cuisines, starter kits and dish templates.
 * Ops can read (the menu builder needs kits and templates); admins change.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient as BaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRoleSet } from "../../_shared/productAdmin.ts";
import { logAdminAction } from "../../_shared/auditLog.ts";
import { ADMIN_ROLES, OPS_ROLES } from "../inHouse/access.ts";
import {
  cleanAliases,
  cleanLabel,
  cuisineSlug,
  parseKitBody,
  parseTemplateBody,
  type CuisineRow,
  type KitRow,
} from "./menuLibrary.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = BaseClient<any, any, any>;

const CUISINE_COLS = "id, label, aliases, sort, icon_url, archived_at";
const KIT_COLS = "id, cuisine, cuisine_ids, name, payload, sort, archived_at, updated_at";
const TEMPLATE_COLS = "id, name, description, product_type, cuisine_ids, payload, sort, archived_at, updated_at, updated_by";

async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const raw = await c.req.json().catch(() => ({}));
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

export async function loadCuisines(sb: SupabaseClient): Promise<CuisineRow[]> {
  const { data, error } = await sb.from("cuisines").select(CUISINE_COLS).order("sort").order("label");
  if (error) throw new Error(error.message);
  return (data || []) as CuisineRow[];
}

async function cuisineUsage(sb: SupabaseClient, cuisines: CuisineRow[]) {
  const [{ data: merchants }, { data: kits }, { data: templates }] = await Promise.all([
    sb.from("merchants").select("id, name, cuisines, cuisine_type"),
    sb.from("menu_kits").select("cuisine_ids").is("archived_at", null),
    sb.from("menu_product_templates").select("cuisine_ids").is("archived_at", null),
  ]);
  const usage = new Map(cuisines.map((c) => [c.id, {
    restaurants: 0,
    kits: 0,
    templates: 0,
    restaurantList: [] as Array<{ id: string; name: string; primary: boolean }>,
  }]));
  const idByLabel = new Map(cuisines.map((c) => [c.label.toLowerCase(), c.id]));
  for (const m of (merchants || []) as Array<{ id: string; name: string | null; cuisines: string[] | null; cuisine_type: string | null }>) {
    const list = m.cuisines || [];
    const labels = new Set([...list, ...(m.cuisine_type ? [m.cuisine_type] : [])].map((l) => l.toLowerCase()));
    const primary = (list[0] || m.cuisine_type || "").toLowerCase();
    for (const label of labels) {
      const id = idByLabel.get(label);
      if (!id) continue;
      const entry = usage.get(id)!;
      entry.restaurants += 1;
      entry.restaurantList.push({ id: m.id, name: m.name || "Unnamed", primary: label === primary });
    }
  }
  for (const k of (kits || []) as Array<{ cuisine_ids: string[] | null }>) {
    for (const id of k.cuisine_ids || []) if (usage.has(id)) usage.get(id)!.kits += 1;
  }
  for (const t of (templates || []) as Array<{ cuisine_ids: string[] | null }>) {
    for (const id of t.cuisine_ids || []) if (usage.has(id)) usage.get(id)!.templates += 1;
  }
  return usage;
}

/** Active templates for the menu builder ("Add dish → From template"). */
export async function listActiveTemplates(sb: SupabaseClient) {
  const { data } = await sb.from("menu_product_templates")
    .select("id, name, description, product_type, cuisine_ids, payload")
    .is("archived_at", null)
    .order("sort")
    .order("name");
  return (data || []).map((t: Record<string, unknown>) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    productType: t.product_type,
    cuisineIds: t.cuisine_ids || [],
    payload: t.payload,
  }));
}

function kitOut(row: KitRow & { updated_at?: string }) {
  return {
    id: row.id,
    name: row.name,
    cuisineIds: row.cuisine_ids || [],
    payload: row.payload,
    sort: row.sort ?? 0,
    archivedAt: row.archived_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function templateOut(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    productType: row.product_type,
    cuisineIds: row.cuisine_ids || [],
    payload: row.payload,
    sort: row.sort ?? 0,
    archivedAt: row.archived_at ?? null,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

export function registerMenuLibraryRoutes(app: Hono, deps: { getServiceSupabase: () => SupabaseClient }) {
  const audit = (request: Request, admin: { id: string }, action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>) =>
    logAdminAction({ actorUserId: admin.id, action, resourceType, resourceId, metadata, request });

  // Public: the active cuisine list for partner sign-up, profiles and customer filters.
  app.get("/cuisines", async (c) => {
    const sb = deps.getServiceSupabase();
    const { data, error } = await sb.from("cuisines").select("id, label, icon_url, sort")
      .is("archived_at", null).order("sort").order("label");
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ cuisines: (data || []).map((r: { id: string; label: string; icon_url: string | null }) => ({ id: r.id, label: r.label, iconUrl: r.icon_url })) });
  });

  app.get("/admin/menu-library", async (c) => {
    const admin = await requireRoleSet(c, OPS_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    try {
      const cuisines = await loadCuisines(sb);
      const [usage, { data: kits, error: kitErr }, { data: templates, error: tplErr }] = await Promise.all([
        cuisineUsage(sb, cuisines),
        sb.from("menu_kits").select(KIT_COLS).order("sort").order("name"),
        sb.from("menu_product_templates").select(TEMPLATE_COLS).order("sort").order("name"),
      ]);
      if (kitErr || tplErr) return c.json({ error: (kitErr || tplErr)!.message }, 500);
      return c.json({
        cuisines: cuisines.map((row) => ({
          id: row.id,
          label: row.label,
          aliases: row.aliases || [],
          sort: row.sort,
          iconUrl: row.icon_url ?? null,
          archivedAt: row.archived_at ?? null,
          usage: usage.get(row.id),
        })),
        kits: (kits || []).map(kitOut),
        templates: (templates || []).map(templateOut),
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Menu library failed" }, 500);
    }
  });

  // ---- Cuisines -------------------------------------------------------------

  app.post("/admin/menu-library/cuisines", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const b = await body(c);
    const label = cleanLabel(b.label);
    if (!label) return c.json({ error: "Enter a cuisine name (max 60 characters, no •)" }, 400);
    const id = cuisineSlug(label);
    if (!id) return c.json({ error: "Cuisine name needs letters or numbers" }, 400);
    const sb = deps.getServiceSupabase();
    const cuisines = await loadCuisines(sb);
    const clash = cuisines.find((r) => r.id === id || r.label.toLowerCase() === label.toLowerCase()
      || (r.aliases || []).some((a) => a.toLowerCase() === label.toLowerCase()));
    if (clash) {
      return c.json({ error: `"${label}" already exists as "${clash.label}"${clash.archived_at ? " (archived — restore it instead)" : ""}` }, 409);
    }
    const sort = Number.isFinite(Number(b.sort)) ? Math.trunc(Number(b.sort)) : (Math.max(0, ...cuisines.filter((r) => r.id !== "other").map((r) => r.sort)) + 10);
    const { error } = await sb.from("cuisines").insert({ id, label, sort, icon_url: b.iconUrl ? String(b.iconUrl) : null });
    if (error) return c.json({ error: error.message }, 500);
    await audit(c.req.raw, admin, "menu_library.cuisine_create", "cuisine", id, { label });
    return c.json({ ok: true, id });
  });

  app.patch("/admin/menu-library/cuisines/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const b = await body(c);
    const sb = deps.getServiceSupabase();
    const cuisines = await loadCuisines(sb);
    const row = cuisines.find((r) => r.id === id);
    if (!row) return c.json({ error: "Cuisine not found" }, 404);

    // Check every field before writing anything, so a refused field never leaves a half-saved edit.
    let newLabel: string | null = null;
    if ("label" in b) {
      const label = cleanLabel(b.label);
      if (!label) return c.json({ error: "Enter a cuisine name (max 60 characters, no •)" }, 400);
      const clash = cuisines.find((r) => r.id !== id && (r.label.toLowerCase() === label.toLowerCase()
        || (r.aliases || []).some((a) => a.toLowerCase() === label.toLowerCase())));
      if (clash) return c.json({ error: `"${label}" already belongs to ${clash.label}. Use Merge instead.` }, 409);
      if (label !== row.label) newLabel = label;
    }
    const patch: Record<string, unknown> = {};
    if ("sort" in b && Number.isFinite(Number(b.sort))) patch.sort = Math.trunc(Number(b.sort));
    if ("iconUrl" in b) {
      const icon = String(b.iconUrl ?? "").trim();
      if (icon && !/^https:\/\//i.test(icon)) return c.json({ error: "Icon must be an https:// image link" }, 400);
      patch.icon_url = icon || null;
    }
    if ("aliases" in b) {
      const checked = cleanAliases(b.aliases, id, cuisines);
      if (!checked.ok) return c.json({ error: checked.error }, 400);
      const aliases = checked.aliases.filter((a) => a.toLowerCase() !== newLabel?.toLowerCase());
      // A rename keeps the old name as a spelling, so search and kits still match it.
      if (newLabel && !aliases.some((a) => a.toLowerCase() === row.label.toLowerCase())) aliases.push(row.label);
      patch.aliases = aliases;
    }
    if ("archived" in b) patch.archived_at = b.archived ? new Date().toISOString() : null;

    if (newLabel) {
      const { error } = await sb.rpc("menu_library_rename_cuisine", { p_id: id, p_label: newLabel });
      if (error) return c.json({ error: error.message }, 500);
      await audit(c.req.raw, admin, "menu_library.cuisine_rename", "cuisine", id, { from: row.label, to: newLabel });
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error } = await sb.from("cuisines").update(patch).eq("id", id);
      if (error) return c.json({ error: error.message }, 500);
      await audit(c.req.raw, admin, "archived" in b ? (b.archived ? "menu_library.cuisine_archive" : "menu_library.cuisine_restore") : "menu_library.cuisine_update", "cuisine", id, patch);
    }
    return c.json({ ok: true });
  });

  app.post("/admin/menu-library/cuisines/:id/merge", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const b = await body(c);
    const intoId = String(b.intoId ?? "");
    if (!intoId || intoId === id) return c.json({ error: "Pick a different cuisine to merge into" }, 400);
    const sb = deps.getServiceSupabase();
    const { error } = await sb.rpc("menu_library_merge_cuisine", { p_from: id, p_into: intoId });
    if (error) return c.json({ error: /cuisine_not_found/.test(error.message) ? "Cuisine not found" : error.message }, error.message.includes("not_found") ? 404 : 500);
    await audit(c.req.raw, admin, "menu_library.cuisine_merge", "cuisine", id, { into: intoId });
    return c.json({ ok: true });
  });

  app.delete("/admin/menu-library/cuisines/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const sb = deps.getServiceSupabase();
    const cuisines = await loadCuisines(sb);
    const row = cuisines.find((r) => r.id === id);
    if (!row) return c.json({ error: "Cuisine not found" }, 404);
    const usage = (await cuisineUsage(sb, cuisines)).get(id)!;
    // Archived kits/templates can still reference it; count those too before a hard delete.
    const [{ count: kitRefs }, { count: tplRefs }] = await Promise.all([
      sb.from("menu_kits").select("id", { count: "exact", head: true }).contains("cuisine_ids", [id]),
      sb.from("menu_product_templates").select("id", { count: "exact", head: true }).contains("cuisine_ids", [id]),
    ]);
    if (usage.restaurants || kitRefs || tplRefs) {
      return c.json({
        error: `In use by ${usage.restaurants} restaurant(s), ${kitRefs ?? 0} kit(s), ${tplRefs ?? 0} template(s). Archive or merge it instead.`,
        usage,
      }, 409);
    }
    const { error } = await sb.from("cuisines").delete().eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    await audit(c.req.raw, admin, "menu_library.cuisine_delete", "cuisine", id, { label: row.label });
    return c.json({ ok: true });
  });

  // ---- Starter kits ---------------------------------------------------------

  async function kitContext(sb: SupabaseClient) {
    const [cuisines, { data: templates }] = await Promise.all([
      loadCuisines(sb),
      sb.from("menu_product_templates").select("id"),
    ]);
    return {
      cuisines,
      cuisineIds: new Set(cuisines.map((r) => r.id)),
      templateIds: new Set((templates || []).map((t: { id: string }) => t.id)),
    };
  }

  app.post("/admin/menu-library/kits", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const ctx = await kitContext(sb);
    const parsed = parseKitBody(await body(c), ctx.cuisineIds, ctx.templateIds);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const kit = parsed.kit;
    const id = `kit-${cuisineSlug(kit.name) || "custom"}-${crypto.randomUUID().slice(0, 6)}`;
    const firstLabel = ctx.cuisines.find((r) => r.id === kit.cuisineIds[0])?.label || "";
    const { error } = await sb.from("menu_kits").insert({
      id, name: kit.name, cuisine: firstLabel, cuisine_ids: kit.cuisineIds, payload: kit.payload, sort: kit.sort,
    });
    if (error) return c.json({ error: error.message }, 500);
    await audit(c.req.raw, admin, "menu_library.kit_create", "menu_kit", id, { name: kit.name });
    return c.json({ ok: true, id });
  });

  app.put("/admin/menu-library/kits/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const sb = deps.getServiceSupabase();
    const ctx = await kitContext(sb);
    const parsed = parseKitBody(await body(c), ctx.cuisineIds, ctx.templateIds);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const kit = parsed.kit;
    const firstLabel = ctx.cuisines.find((r) => r.id === kit.cuisineIds[0])?.label || "";
    const { data, error } = await sb.from("menu_kits").update({
      name: kit.name, cuisine: firstLabel, cuisine_ids: kit.cuisineIds, payload: kit.payload, sort: kit.sort,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("id");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Kit not found" }, 404);
    await audit(c.req.raw, admin, "menu_library.kit_update", "menu_kit", id, { name: kit.name });
    return c.json({ ok: true });
  });

  app.patch("/admin/menu-library/kits/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const b = await body(c);
    if (!("archived" in b)) return c.json({ error: "Nothing to change" }, 400);
    const sb = deps.getServiceSupabase();
    const { data, error } = await sb.from("menu_kits").update({
      archived_at: b.archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("id");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Kit not found" }, 404);
    await audit(c.req.raw, admin, b.archived ? "menu_library.kit_archive" : "menu_library.kit_restore", "menu_kit", id);
    return c.json({ ok: true });
  });

  app.delete("/admin/menu-library/kits/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const sb = deps.getServiceSupabase();
    // Kits are copied into a menu when applied, so deleting one never changes a menu.
    const { data, error } = await sb.from("menu_kits").delete().eq("id", id).select("id, name");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Kit not found" }, 404);
    await audit(c.req.raw, admin, "menu_library.kit_delete", "menu_kit", id, { name: data[0].name });
    return c.json({ ok: true });
  });

  // ---- Dish templates ---------------------------------------------------------

  app.post("/admin/menu-library/templates", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const sb = deps.getServiceSupabase();
    const cuisines = await loadCuisines(sb);
    const parsed = parseTemplateBody(await body(c), new Set(cuisines.map((r) => r.id)));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const t = parsed.template;
    const { data, error } = await sb.from("menu_product_templates").insert({
      name: t.name, description: t.description, product_type: t.productType, cuisine_ids: t.cuisineIds,
      payload: t.payload, sort: t.sort, updated_by: admin.email || admin.id,
    }).select("id").single();
    if (error) return c.json({ error: error.message }, 500);
    await audit(c.req.raw, admin, "menu_library.template_create", "menu_template", data.id, { name: t.name, type: t.productType });
    return c.json({ ok: true, id: data.id });
  });

  app.put("/admin/menu-library/templates/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const sb = deps.getServiceSupabase();
    const cuisines = await loadCuisines(sb);
    const parsed = parseTemplateBody(await body(c), new Set(cuisines.map((r) => r.id)));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const t = parsed.template;
    const { data, error } = await sb.from("menu_product_templates").update({
      name: t.name, description: t.description, product_type: t.productType, cuisine_ids: t.cuisineIds,
      payload: t.payload, sort: t.sort, updated_by: admin.email || admin.id, updated_at: new Date().toISOString(),
    }).eq("id", id).select("id");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Template not found" }, 404);
    await audit(c.req.raw, admin, "menu_library.template_update", "menu_template", id, { name: t.name });
    return c.json({ ok: true });
  });

  app.patch("/admin/menu-library/templates/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const b = await body(c);
    if (!("archived" in b)) return c.json({ error: "Nothing to change" }, 400);
    const sb = deps.getServiceSupabase();
    const { data, error } = await sb.from("menu_product_templates").update({
      archived_at: b.archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      updated_by: admin.email || admin.id,
    }).eq("id", id).select("id");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Template not found" }, 404);
    await audit(c.req.raw, admin, b.archived ? "menu_library.template_archive" : "menu_library.template_restore", "menu_template", id);
    return c.json({ ok: true });
  });

  app.delete("/admin/menu-library/templates/:id", async (c) => {
    const admin = await requireRoleSet(c, ADMIN_ROLES);
    if (admin instanceof Response) return admin;
    const id = c.req.param("id");
    const sb = deps.getServiceSupabase();
    const { data: kits } = await sb.from("menu_kits").select("id, name, payload");
    const usedBy = ((kits || []) as KitRow[]).filter((k) =>
      (k.payload?.sections || []).some((s) => (s.products || []).some((p) => p.templateId === id)));
    if (usedBy.length) {
      return c.json({ error: `Used by kit(s): ${usedBy.map((k) => k.name).join(", ")}. Remove it there or archive it instead.` }, 409);
    }
    // Templates are copied into menus, so deleting one never changes a live menu.
    const { data, error } = await sb.from("menu_product_templates").delete().eq("id", id).select("id, name");
    if (error) return c.json({ error: error.message }, 500);
    if (!data?.length) return c.json({ error: "Template not found" }, 404);
    await audit(c.req.raw, admin, "menu_library.template_delete", "menu_template", id, { name: data[0].name });
    return c.json({ ok: true });
  });
}
