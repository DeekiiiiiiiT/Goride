/**
 * Load haulage catalog from DB (public views or rides schema).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type HaulageVariantRow = {
  item_id: string;
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  weight_kg: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  min_body_type_slug: string | null;
  upright_only: boolean;
  fragile_default: boolean;
  requires_disassembly_default: boolean;
  gear_tags: string[] | null;
};

export type HaulageItemRow = {
  id: string;
  category_id: string;
  subgroup_id: string | null;
  title: string;
  subtitle: string;
  icon: string;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
  requires_manual_specs: boolean;
};

export type HaulageCategoryRow = {
  id: string;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

export type HaulageSubgroupRow = {
  id: string;
  category_id: string;
  title: string;
  sort_order: number;
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; data: Awaited<ReturnType<typeof loadHaulageCatalogUncached>> } | null = null;

function tables(db: SupabaseClient) {
  return {
    categories: "rides_haulage_categories",
    subgroups: "rides_haulage_item_subgroups",
    items: "rides_haulage_items",
    variants: "rides_haulage_item_variants",
  };
}

export function invalidateHaulageCatalogCache(): void {
  cache = null;
}

export async function loadHaulageCatalogUncached(db: SupabaseClient) {
  const t = tables(db);
  const [catRes, subRes, itemRes, varRes] = await Promise.all([
    db.from(t.categories).select("*").eq("is_active", true).order("sort_order"),
    db.from(t.subgroups).select("*").order("sort_order"),
    db.from(t.items).select("*").eq("is_active", true).order("sort_order"),
    db.from(t.variants).select("*").eq("is_active", true).order("sort_order"),
  ]);

  if (catRes.error) throw new Error(catRes.error.message);
  if (subRes.error) throw new Error(subRes.error.message);
  if (itemRes.error) throw new Error(itemRes.error.message);
  if (varRes.error) throw new Error(varRes.error.message);

  const categories = (catRes.data ?? []) as HaulageCategoryRow[];
  const subgroups = (subRes.data ?? []) as HaulageSubgroupRow[];
  const items = (itemRes.data ?? []) as HaulageItemRow[];
  const variants = (varRes.data ?? []) as HaulageVariantRow[];

  const variantsByItem = new Map<string, HaulageVariantRow[]>();
  for (const v of variants) {
    const list = variantsByItem.get(v.item_id) ?? [];
    list.push(v);
    variantsByItem.set(v.item_id, list);
  }

  return {
    categories: categories.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      icon: c.icon,
      sort_order: c.sort_order,
      is_active: c.is_active,
    })),
    subgroups: subgroups.map((s) => ({
      id: s.id,
      category_id: s.category_id,
      title: s.title,
      sort_order: s.sort_order,
    })),
    items: items.map((item) => ({
      id: item.id,
      category_id: item.category_id,
      subgroup_id: item.subgroup_id,
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      emoji: item.emoji,
      sort_order: item.sort_order,
      is_active: item.is_active,
      requires_manual_specs: item.requires_manual_specs,
      variants: (variantsByItem.get(item.id) ?? []).map((v) => ({
        id: v.id,
        item_id: v.item_id,
        label: v.label,
        sort_order: v.sort_order,
        is_active: v.is_active,
        weight_kg: Number(v.weight_kg),
        length_cm: v.length_cm != null ? Number(v.length_cm) : null,
        width_cm: v.width_cm != null ? Number(v.width_cm) : null,
        height_cm: v.height_cm != null ? Number(v.height_cm) : null,
        min_body_type_slug: v.min_body_type_slug,
        upright_only: v.upright_only,
        fragile_default: v.fragile_default,
        requires_disassembly_default: v.requires_disassembly_default,
        gear_tags: v.gear_tags ?? [],
      })),
    })),
  };
}

export async function loadHaulageCatalog(db: SupabaseClient) {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await loadHaulageCatalogUncached(db);
  cache = { at: now, data };
  return data;
}

export async function loadVariantSpecs(
  db: SupabaseClient,
  itemId: string,
  variantId: string,
): Promise<HaulageVariantRow & { item_title: string; requires_manual_specs: boolean } | null> {
  const t = tables(db);
  const { data: item } = await db.from(t.items).select("title, requires_manual_specs").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const { data: variant } = await db.from(t.variants).select("*").eq("item_id", itemId).eq("id", variantId).maybeSingle();
  if (!variant) return null;
  const row = variant as HaulageVariantRow;
  return {
    ...row,
    weight_kg: Number(row.weight_kg),
    item_title: (item as { title: string }).title,
    requires_manual_specs: (item as { requires_manual_specs: boolean }).requires_manual_specs,
  };
}

export type HaulageLineInput = { item_id: string; variant_id: string; qty?: number };

export async function resolveHaulageLines(
  db: SupabaseClient,
  lines: HaulageLineInput[],
) {
  const resolved = [];
  for (const line of lines) {
    const qty = Math.max(1, Math.min(99, Math.round(line.qty ?? 1)));
    const spec = await loadVariantSpecs(db, line.item_id, line.variant_id);
    if (!spec) return { ok: false as const, error: "invalid_items" as const };
    resolved.push({ ...spec, qty, line_key: `${line.item_id}:${line.variant_id}` });
  }
  if (!resolved.length) return { ok: false as const, error: "invalid_items" as const };
  return { ok: true as const, lines: resolved };
}
