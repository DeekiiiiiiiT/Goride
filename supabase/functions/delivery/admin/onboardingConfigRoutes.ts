/**
 * Dash admin + partner — merchant business type taxonomy.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb } from "./merchantAdminShared.ts";
import { defaultBusinessTypeMetadata } from "../verticalMetadata.ts";

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
  vertical_type: string;
  fulfillment_type: string;
  required_document_types: string[];
  category_taxonomy_key: string;
  default_prep_time_mins: number;
  max_delivery_radius_km: number;
  compliance_tier: string;
  go_live_rule: string;
}

const TYPE_SELECT =
  "id, section_id, label, sort_order, is_active, vertical_type, fulfillment_type, required_document_types, category_taxonomy_key, default_prep_time_mins, max_delivery_radius_km, compliance_tier, go_live_rule";

function normalizeTypeRow(row: Record<string, unknown>): BusinessTypeDto {
  const defaults = defaultBusinessTypeMetadata(String(row.id || "restaurant"));
  return {
    id: String(row.id),
    section_id: String(row.section_id),
    label: String(row.label),
    sort_order: Number(row.sort_order) || 0,
    is_active: Boolean(row.is_active),
    vertical_type: String(row.vertical_type || defaults.vertical_type),
    fulfillment_type: String(row.fulfillment_type || defaults.fulfillment_type),
    required_document_types: Array.isArray(row.required_document_types)
      ? (row.required_document_types as string[])
      : defaults.required_document_types,
    category_taxonomy_key: String(row.category_taxonomy_key || defaults.category_taxonomy_key),
    default_prep_time_mins: Number(row.default_prep_time_mins) || defaults.default_prep_time_mins,
    max_delivery_radius_km: Number(row.max_delivery_radius_km) || defaults.max_delivery_radius_km,
    compliance_tier: String(row.compliance_tier || defaults.compliance_tier),
    go_live_rule: String(row.go_live_rule || defaults.go_live_rule),
  };
}

function parseMetadataPatch(body: Record<string, unknown>): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  const verticals = new Set([
    "restaurant", "grocery", "pharmacy", "alcohol", "convenience", "retail",
  ]);
  const fulfillments = new Set(["cook_to_order", "pick_and_pack"]);
  const taxonomies = new Set(["cuisine", "inventory_category", "none"]);
  const compliance = new Set(["standard", "regulated"]);
  const goLive = new Set(["menu_min_5", "catalog_imported", "pos_connected"]);

  if (body.vertical_type != null) {
    const v = String(body.vertical_type);
    if (!verticals.has(v)) return null;
    patch.vertical_type = v;
  }
  if (body.fulfillment_type != null) {
    const f = String(body.fulfillment_type);
    if (!fulfillments.has(f)) return null;
    patch.fulfillment_type = f;
  }
  if (body.category_taxonomy_key != null) {
    const k = String(body.category_taxonomy_key);
    if (!taxonomies.has(k)) return null;
    patch.category_taxonomy_key = k;
  }
  if (body.compliance_tier != null) {
    const c = String(body.compliance_tier);
    if (!compliance.has(c)) return null;
    if (c === "regulated") return null;
    patch.compliance_tier = c;
  }
  if (body.go_live_rule != null) {
    const g = String(body.go_live_rule);
    if (!goLive.has(g)) return null;
    patch.go_live_rule = g;
  }
  if (body.required_document_types != null) {
    if (!Array.isArray(body.required_document_types)) return null;
    patch.required_document_types = (body.required_document_types as unknown[])
      .map(String)
      .filter(Boolean);
  }
  if (body.default_prep_time_mins != null) {
    patch.default_prep_time_mins = Number(body.default_prep_time_mins);
  }
  if (body.max_delivery_radius_km != null) {
    patch.max_delivery_radius_km = Number(body.max_delivery_radius_km);
  }
  return patch;
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
    .select(TYPE_SELECT)
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
    const t = normalizeTypeRow(row as Record<string, unknown>);
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

export async function fetchBusinessTypeMetadataById(
  businessTypeId: string,
): Promise<BusinessTypeDto | null> {
  if (!businessTypeId) return null;
  const sb = getDb();
  const { data, error } = await sb
    .from("merchant_business_types")
    .select(TYPE_SELECT)
    .eq("id", businessTypeId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeTypeRow(data as Record<string, unknown>);
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
    const metaPatch = parseMetadataPatch(body);
    if (metaPatch === null) return c.json({ error: "Invalid metadata field" }, 400);

    const sb = getDb();
    const { data: section } = await sb
      .from("merchant_business_type_sections")
      .select("id")
      .eq("id", sectionId)
      .maybeSingle();
    if (!section) return c.json({ error: "Section not found" }, 404);

    const { data, error } = await sb
      .from("merchant_business_types")
      .insert({ id, section_id: sectionId, label, sort_order: sortOrder, is_active: true, ...metaPatch })
      .select(TYPE_SELECT)
      .single();
    if (error) return c.json({ error: error.message }, error.code === "23505" ? 409 : 500);
    return c.json({ type: normalizeTypeRow(data as Record<string, unknown>) });
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
    const metaPatch = parseMetadataPatch(body);
    if (metaPatch === null) return c.json({ error: "Invalid metadata field" }, 400);
    Object.assign(patch, metaPatch);
    if (!Object.keys(patch).length) return c.json({ error: "No fields to update" }, 400);

    const sb = getDb();
    const { data, error } = await sb
      .from("merchant_business_types")
      .update(patch)
      .eq("id", id)
      .select(TYPE_SELECT)
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Business type not found" }, 404);
    return c.json({ type: normalizeTypeRow(data as Record<string, unknown>) });
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
