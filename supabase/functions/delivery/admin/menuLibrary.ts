/**
 * Menu library rules: cuisines, starter kits and dish templates.
 * Product types are fixed in code; templates are named presets of them.
 */

export const PRODUCT_TYPES = ["standard", "sized", "pizza", "wings", "combo", "build_your_own"] as const;
export type LibraryProductType = typeof PRODUCT_TYPES[number];

export type CuisineRow = {
  id: string;
  label: string;
  aliases: string[] | null;
  sort: number;
  icon_url?: string | null;
  archived_at?: string | null;
};

export type KitRow = {
  id: string;
  cuisine: string;
  cuisine_ids: string[] | null;
  name: string;
  payload: { sections?: Array<{ name: string; sectionType: string; products?: Array<{ name: string; type: string; templateId?: string }> }> };
  sort?: number;
  archived_at?: string | null;
};

const MAX_TEMPLATE_BYTES = 200_000;

export function cuisineSlug(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function cleanLabel(raw: unknown): string | null {
  const label = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!label || label.length > 60) return null;
  if (label.includes("•")) return null;
  return label;
}

/**
 * Other spellings for one cuisine ("Chicken" → Fried Chicken). Each must be a clean label,
 * not the cuisine's own name, and not claimed by another cuisine's name or spellings.
 */
export function cleanAliases(
  raw: unknown,
  selfId: string,
  cuisines: CuisineRow[],
): { ok: true; aliases: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Other spellings must be a list" };
  if (raw.length > 20) return { ok: false, error: "At most 20 other spellings" };
  const self = cuisines.find((c) => c.id === selfId);
  const taken = new Map<string, string>();
  for (const c of cuisines) {
    if (c.id === selfId) continue;
    taken.set(c.label.toLowerCase(), c.label);
    for (const a of c.aliases || []) taken.set(a.toLowerCase(), c.label);
  }
  const out: string[] = [];
  for (const value of raw) {
    const alias = cleanLabel(value);
    if (!alias) return { ok: false, error: `"${String(value ?? "")}" isn't a valid spelling (max 60 characters, no •)` };
    if (self && alias.toLowerCase() === self.label.toLowerCase()) continue;
    const owner = taken.get(alias.toLowerCase());
    if (owner) return { ok: false, error: `"${alias}" already belongs to ${owner}` };
    if (!out.some((a) => a.toLowerCase() === alias.toLowerCase())) out.push(alias);
  }
  return { ok: true, aliases: out };
}

/** Map restaurant cuisine labels (or old spellings) to cuisine ids. */
export function cuisineIdsForLabels(labels: string[], cuisines: CuisineRow[]): string[] {
  const byName = new Map<string, string>();
  for (const c of cuisines) {
    byName.set(c.label.toLowerCase(), c.id);
    for (const alias of c.aliases || []) {
      if (!byName.has(alias.toLowerCase())) byName.set(alias.toLowerCase(), c.id);
    }
  }
  const out: string[] = [];
  for (const label of labels) {
    for (const part of String(label).split("•")) {
      const id = byName.get(part.trim().toLowerCase());
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Kits offered to a restaurant: active kits sharing a cuisine. No cuisine → no kits. */
export function kitsForMerchant(kits: KitRow[], merchantCuisineIds: string[], cuisines: CuisineRow[]) {
  if (!merchantCuisineIds.length) return [];
  const wanted = new Set(merchantCuisineIds);
  const labelOf = new Map(cuisines.map((c) => [c.id, c.label]));
  return kits
    .filter((k) => !k.archived_at && (k.cuisine_ids || []).some((id) => wanted.has(id)))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
    .map((k) => ({
      id: k.id,
      name: k.name,
      cuisine: (k.cuisine_ids || []).map((id) => labelOf.get(id) || id).join(", "),
      cuisineIds: k.cuisine_ids || [],
      payload: k.payload,
    }));
}

/**
 * Restaurant cuisines must come from the active list.
 * Returns the cleaned list, or the labels that are not recognised.
 */
export function validateMerchantCuisines(
  labels: unknown[],
  cuisines: CuisineRow[],
): { ok: true; labels: string[] } | { ok: false; unknown: string[] } {
  const active = new Map(cuisines.filter((c) => !c.archived_at).map((c) => [c.label.toLowerCase(), c.label]));
  const all = new Map(cuisines.map((c) => [c.label.toLowerCase(), c.label]));
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of labels) {
    const label = String(raw ?? "").trim();
    if (!label) continue;
    // Archived cuisines a restaurant already has are kept; new picks must be active.
    const match = active.get(label.toLowerCase()) ?? all.get(label.toLowerCase());
    if (!match) unknown.push(label);
    else if (!out.includes(match)) out.push(match);
  }
  return unknown.length ? { ok: false, unknown } : { ok: true, labels: out };
}

function cleanIds(raw: unknown, valid: Set<string>): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    const id = String(v ?? "").trim();
    if (!valid.has(id)) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export type KitInput = {
  name: string;
  cuisineIds: string[];
  sort: number;
  payload: NonNullable<KitRow["payload"]>;
};

export function parseKitBody(
  body: Record<string, unknown>,
  cuisineIds: Set<string>,
  templateIds: Set<string>,
): { ok: true; kit: KitInput } | { ok: false; error: string } {
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 80) return { ok: false, error: "Kit name is required (max 80 characters)" };
  const ids = cleanIds(body.cuisineIds, cuisineIds);
  if (!ids) return { ok: false, error: "Unknown cuisine on kit" };
  if (!ids.length) return { ok: false, error: "Pick at least one cuisine for the kit" };
  const rawSections = (body.payload as { sections?: unknown })?.sections;
  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return { ok: false, error: "A kit needs at least one section" };
  }
  if (rawSections.length > 30) return { ok: false, error: "A kit can have at most 30 sections" };
  const sections = [];
  for (const raw of rawSections as Array<Record<string, unknown>>) {
    const sectionName = String(raw?.name ?? "").trim();
    const sectionType = String(raw?.sectionType ?? "");
    if (!sectionName) return { ok: false, error: "Every kit section needs a name" };
    if (!(PRODUCT_TYPES as readonly string[]).includes(sectionType)) {
      return { ok: false, error: `Unknown section type "${sectionType}"` };
    }
    const products = [];
    for (const p of Array.isArray(raw.products) ? raw.products as Array<Record<string, unknown>> : []) {
      const templateId = p?.templateId ? String(p.templateId) : undefined;
      if (templateId && !templateIds.has(templateId)) return { ok: false, error: "Kit uses a dish template that doesn't exist" };
      const productName = String(p?.name ?? "").trim();
      if (!productName) return { ok: false, error: "Every starter dish needs a name" };
      products.push({ name: productName, type: sectionType, ...(templateId ? { templateId } : {}) });
    }
    sections.push({ name: sectionName, sectionType, ...(products.length ? { products } : {}) });
  }
  const sort = Number.isFinite(Number(body.sort)) ? Math.trunc(Number(body.sort)) : 0;
  return { ok: true, kit: { name, cuisineIds: ids, sort, payload: { sections } } };
}

export type TemplateInput = {
  name: string;
  description: string | null;
  productType: LibraryProductType;
  cuisineIds: string[];
  sort: number;
  payload: { product: Record<string, unknown>; groups: unknown[]; priceMatrix: unknown[] };
};

export function parseTemplateBody(
  body: Record<string, unknown>,
  cuisineIds: Set<string>,
): { ok: true; template: TemplateInput } | { ok: false; error: string } {
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 80) return { ok: false, error: "Template name is required (max 80 characters)" };
  const productType = String(body.productType ?? "");
  if (!(PRODUCT_TYPES as readonly string[]).includes(productType)) {
    return { ok: false, error: "Pick one of the six product types" };
  }
  const ids = cleanIds(body.cuisineIds, cuisineIds);
  if (!ids) return { ok: false, error: "Unknown cuisine on template" };
  const payload = body.payload as Record<string, unknown> | undefined;
  const product = payload?.product as Record<string, unknown> | undefined;
  if (!product || typeof product !== "object") return { ok: false, error: "Template has no dish" };
  if (!Array.isArray(payload?.groups)) return { ok: false, error: "Template choices are invalid" };
  const priceMatrix = Array.isArray(payload?.priceMatrix) ? payload.priceMatrix : [];
  if (product.type !== productType) return { ok: false, error: "Dish type doesn't match the template type" };
  if (!Array.isArray(product.groupLinks)) return { ok: false, error: "Template choices are invalid" };
  const groupIds = new Set((payload.groups as Array<{ id?: unknown }>).map((g) => String(g?.id ?? "")));
  for (const link of product.groupLinks as Array<{ groupId?: unknown }>) {
    if (!groupIds.has(String(link?.groupId ?? ""))) return { ok: false, error: "Template links a choice group it doesn't include" };
  }
  const clean = { product, groups: payload.groups as unknown[], priceMatrix };
  if (JSON.stringify(clean).length > MAX_TEMPLATE_BYTES) return { ok: false, error: "Template is too large" };
  const description = String(body.description ?? "").trim() || null;
  const sort = Number.isFinite(Number(body.sort)) ? Math.trunc(Number(body.sort)) : 0;
  return {
    ok: true,
    template: { name, description, productType: productType as LibraryProductType, cuisineIds: ids, sort, payload: clean },
  };
}
