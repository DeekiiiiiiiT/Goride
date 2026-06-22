/**
 * Dash admin + partner — merchant business type taxonomy.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb } from "./merchantAdminShared.ts";

export interface BusinessTypeSectionDto {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  types: BusinessTypeDto[];
}

export interface BusinessTypeDto {
  id: string;
  section_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

function slugifyId(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug || !/^[a-z][a-z0-9_]{0,39}$/.test(slug)) {
    throw new Error("Invalid id — use letters, numbers, and underscores; must start with a letter");
  }
  return slug;
}

async function fetchBusinessTypeCatalog(activeOnly: boolean): Promise<BusinessTypeSectionDto[]> {
  const sb = getDb();
  let sectionQuery = sb
    .from("merchant_business_type_sections")
    .select("id, label, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (activeOnly) sectionQuery = sectionQuery.eq("is_active", true);

  let typeQuery = sb
    .from("merchant_business_types")
    .select("id, section_id, label, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (activeOnly) typeQuery = typeQuery.eq("is_active", true);

  const [{ data: sections, error: sectionErr }, { data: types, error: typeErr }] = await Promise.all([
    sectionQuery,
    typeQuery,
  ]);
  if (sectionErr) throw new Error(sectionErr.message);
  if (typeErr) throw new Error(typeErr.message);

  const typesBySection = new Map<string, BusinessTypeDto[]>();
  for (const row of types ?? []) {
    const t = row as BusinessTypeDto;
    if (!typesBySection.has(t.section_id)) typesBySection.set(t.section_id, []);
    typesBySection.get(t.section_id)!.push(t);
  }

  return (sections ?? []).map((row) => {
    const s = row as Omit<BusinessTypeSectionDto, "types">;
    return {
      ...s,
      types: typesBySection.get(s.id) ?? [],
    };
  });
}

function adminFromCtx(c: { get: (k: string) => unknown }): ProductAdminUser {
  return c.get("adminUser") as ProductAdminUser;
}

export function registerPartnerBusinessTypeRoutes(app: Hono) {
  app.get("/partner/business-types", async (c) => {
    try {
      const sections = await fetchBusinessTypeCatalog(true);
      return c.json({ sections });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed to load business types" }, 500);
    }
  });
}

export function mountOnboardingConfigAdminRoutes(admin: Hono) {
  admin.get("/onboarding/business-types", async (c) => {
    try {
      const sections = await fetchBusinessTypeCatalog(false);
      return c.json({ sections });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Failed to load business types" }, 500);
    }
  });

  admin.post("/onboarding/business-type-sections", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const label = String(body.label || "").trim();
    if (!label) return c.json({ error: "label is required" }, 400);
    let id = String(body.id || "").trim();
    if (!id) {
      try {
        id = slugifyId(label);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "Invalid id" }, 400);
      }
    }
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const sb = getDb();
    const { data, error } = await sb
      .from("merchant_business_type_sections")
      .insert({ id, label, sort_order: sortOrder, is_active: true })
      .select("id, label, sort_order, is_active")
      .single();
    if (error) return c.json({ error: error.message }, error.code === "23505" ? 409 : 500);
    return c.json({ section: data });
  });

  admin.patch("/onboarding/business-type-sections/:id", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.label != null) {
      const label = String(body.label).trim();
      if (!label) return c.json({ error: "label cannot be empty" }, 400);
      patch.label = label;
    }
    if (body.sort_order != null) patch.sort_order = Number(body.sort_order);
    if (body.is_active != null) patch.is_active = Boolean(body.is_active);
    if (!Object.keys(patch).length) return c.json({ error: "No fields to update" }, 400);

    const sb = getDb();
    const { data, error } = await sb
      .from("merchant_business_type_sections")
      .update(patch)
      .eq("id", id)
      .select("id, label, sort_order, is_active")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Section not found" }, 404);
    return c.json({ section: data });
  });

  admin.delete("/onboarding/business-type-sections/:id", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const { id } = c.req.param();
    const sb = getDb();
    const { count } = await sb
      .from("merchant_business_types")
      .select("id", { count: "exact", head: true })
      .eq("section_id", id)
      .eq("is_active", true);
    if ((count ?? 0) > 0) {
      return c.json({ error: "Remove or reassign active business types in this section first" }, 409);
    }
    const { data, error } = await sb
      .from("merchant_business_type_sections")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Section not found" }, 404);
    return c.json({ ok: true });
  });

  admin.post("/onboarding/business-types", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const label = String(body.label || "").trim();
    const sectionId = String(body.section_id || "").trim();
    if (!label) return c.json({ error: "label is required" }, 400);
    if (!sectionId) return c.json({ error: "section_id is required" }, 400);
    let id = String(body.id || "").trim();
    if (!id) {
      try {
        id = slugifyId(label);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "Invalid id" }, 400);
      }
    }
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const sb = getDb();
    const { data: section } = await sb
      .from("merchant_business_type_sections")
      .select("id")
      .eq("id", sectionId)
      .maybeSingle();
    if (!section) return c.json({ error: "Section not found" }, 404);

    const { data, error } = await sb
      .from("merchant_business_types")
      .insert({ id, section_id: sectionId, label, sort_order: sortOrder, is_active: true })
      .select("id, section_id, label, sort_order, is_active")
      .single();
    if (error) return c.json({ error: error.message }, error.code === "23505" ? 409 : 500);
    return c.json({ type: data });
  });

  admin.patch("/onboarding/business-types/:id", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const { id } = c.req.param();
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.label != null) {
      const label = String(body.label).trim();
      if (!label) return c.json({ error: "label cannot be empty" }, 400);
      patch.label = label;
    }
    if (body.section_id != null) patch.section_id = String(body.section_id).trim();
    if (body.sort_order != null) patch.sort_order = Number(body.sort_order);
    if (body.is_active != null) patch.is_active = Boolean(body.is_active);
    if (!Object.keys(patch).length) return c.json({ error: "No fields to update" }, 400);

    const sb = getDb();
    const { data, error } = await sb
      .from("merchant_business_types")
      .update(patch)
      .eq("id", id)
      .select("id, section_id, label, sort_order, is_active")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Business type not found" }, 404);
    return c.json({ type: data });
  });

  admin.delete("/onboarding/business-types/:id", async (c) => {
    const denied = requireDashWrite(adminFromCtx(c));
    if (denied) return denied;
    const { id } = c.req.param();
    const sb = getDb();
    const { data, error } = await sb
      .from("merchant_business_types")
      .update({ is_active: false })
      .eq("id", id)
      .select("id")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Business type not found" }, 404);
    return c.json({ ok: true });
  });
}
