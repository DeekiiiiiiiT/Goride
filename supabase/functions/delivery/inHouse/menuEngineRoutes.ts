/**
 * Publish / migrate / kit helpers for the menu engine.
 * Customer + checkout read published menu_versions snapshots only.
 * Admin edits persist in menus.draft_snapshot until publish.
 */
import {
  applyLocationOverrides,
  convertMerchantMenu,
  kitsForCuisines,
  parseMenuSnapshot,
  priceLine,
  type LocationOverride,
  type MenuSnapshot,
} from "../../../../packages/menu-engine/src/index.ts";
import { customerPriceFromCost } from "./pricing.ts";

type Sb = {
  from: (table: string) => {
    select: (cols: string) => any;
    insert: (row: unknown) => any;
    update: (row: unknown) => any;
    upsert: (row: unknown, opts?: unknown) => any;
    delete?: () => any;
  };
};

function snapshotHasProducts(snapshot: MenuSnapshot | null): boolean {
  return Boolean(snapshot && Array.isArray(snapshot.products) && snapshot.products.length > 0);
}

/** Load legacy categories + items and convert; throws if the query fails. */
async function convertFromLegacy(sb: Sb, merchantId: string, menuId: string, version = 0): Promise<MenuSnapshot> {
  const { data: categories, error: catErr } = await sb.from("menu_categories")
    .select("id, name, section_kind, sort_order, pizza_menu")
    .eq("merchant_id", merchantId)
    .eq("is_active", true);
  if (catErr) throw new Error(`menu_categories: ${catErr.message}`);

  const { data: items, error: itemErr } = await sb.from("menu_items")
    .select("id, category_id, name, description, image_url, in_store_price, price, options, pizza_recipe, prep_time_mins, source_price_checked_at")
    .eq("merchant_id", merchantId)
    .eq("is_available", true);
  if (itemErr) throw new Error(`menu_items: ${itemErr.message}`);

  return convertMerchantMenu({
    menuId,
    version,
    categories: categories || [],
    items: (items || []).map((row: Record<string, unknown>) => ({
      ...row,
      prep_time_mins: row.prep_time_mins,
      source_price_checked_at: row.source_price_checked_at,
    })),
  });
}

async function saveDraftSnapshot(sb: Sb, menuId: string, snapshot: MenuSnapshot) {
  const { error } = await sb.from("menus").update({
    draft_snapshot: snapshot,
    updated_at: new Date().toISOString(),
  }).eq("id", menuId);
  if (error) throw new Error(error.message);
}

/** Ensure a draft menu exists for a merchant; migrate legacy JSON when empty. */
export async function ensureMerchantEngineMenu(
  sb: Sb,
  merchantId: string,
): Promise<{ menuId: string; snapshot: MenuSnapshot | null }> {
  const { data: merchant } = await sb.from("merchants")
    .select("id, engine_menu_id, cuisine_type, cuisines")
    .eq("id", merchantId)
    .maybeSingle();

  if (merchant?.engine_menu_id) {
    const { data: menu } = await sb.from("menus")
      .select("id, version, status, draft_snapshot")
      .eq("id", merchant.engine_menu_id)
      .maybeSingle();
    if (menu) {
      const draft = parseMenuSnapshot(menu.draft_snapshot);
      if (snapshotHasProducts(draft)) {
        return { menuId: String(menu.id), snapshot: draft };
      }
      const { data: ver } = await sb.from("menu_versions")
        .select("snapshot")
        .eq("menu_id", menu.id)
        .eq("version", menu.version)
        .maybeSingle();
      const published = parseMenuSnapshot(ver?.snapshot);
      if (snapshotHasProducts(published)) {
        // Prefer editable draft; seed from published when draft is empty.
        if (!draft) {
          await saveDraftSnapshot(sb, String(menu.id), published!);
        }
        return { menuId: String(menu.id), snapshot: draft || published };
      }
      // Stuck empty convert (wrong columns / no version row) — re-run migration.
      const snapshot = await convertFromLegacy(sb, merchantId, String(menu.id), Number(menu.version) || 0);
      await saveDraftSnapshot(sb, String(menu.id), snapshot);
      return { menuId: String(menu.id), snapshot };
    }
  }

  const { data: created, error } = await sb.from("menus").insert({
    owner_kind: "merchant",
    owner_id: merchantId,
    status: "draft",
    version: 0,
  }).select("id").single();
  if (error || !created) throw new Error(error?.message || "Failed to create menu");

  const menuId = String(created.id);
  const snapshot = await convertFromLegacy(sb, merchantId, menuId, 0);
  await saveDraftSnapshot(sb, menuId, snapshot);
  await sb.from("merchants").update({ engine_menu_id: menuId }).eq("id", merchantId);
  return { menuId, snapshot };
}

/** Persist admin draft without publishing. */
export async function saveMenuDraft(
  sb: Sb,
  menuId: string,
  snapshot: MenuSnapshot,
): Promise<void> {
  const frozen = { ...snapshot, menuId };
  await saveDraftSnapshot(sb, menuId, frozen);
}

/** Freeze snapshot as the next published version. Prefers server draft when body omitted. */
export async function publishMenu(
  sb: Sb,
  menuId: string,
  snapshot: MenuSnapshot,
  publishedBy: string,
): Promise<{ version: number }> {
  const { data: menu } = await sb.from("menus").select("version, draft_snapshot").eq("id", menuId).maybeSingle();
  const fromDraft = parseMenuSnapshot(menu?.draft_snapshot);
  const source = snapshotHasProducts(snapshot) ? snapshot : (fromDraft || snapshot);
  const version = (Number(menu?.version) || 0) + 1;
  const frozen = { ...source, menuId, version };
  const { error: vErr } = await sb.from("menu_versions").insert({
    menu_id: menuId,
    version,
    snapshot: frozen,
    published_by: publishedBy,
  });
  if (vErr) throw new Error(vErr.message);
  const { error: mErr } = await sb.from("menus").update({
    status: "published",
    version,
    published_at: new Date().toISOString(),
    published_by: publishedBy,
    draft_snapshot: frozen,
    updated_at: new Date().toISOString(),
  }).eq("id", menuId);
  if (mErr) throw new Error(mErr.message);
  return { version };
}

/**
 * Upsert menu_items shadow rows (id = product.id) so live sold-out toggles,
 * customer catalog joins, and loadCheckoutSnapshot overlays work for engine dishes.
 */
export async function syncShadowMenuItems(
  sb: Sb,
  merchantId: string,
  snapshot: MenuSnapshot,
  markupBps = 1500,
): Promise<void> {
  const products = snapshot.products || [];
  if (!products.length) return;

  // Ensure one category for engine-synced dishes (reuse by name).
  let categoryId: string | null = null;
  const { data: existingCat } = await sb.from("menu_categories")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("name", "Engine menu")
    .maybeSingle();
  if (existingCat?.id) {
    categoryId = String(existingCat.id);
  } else {
    const { data: created, error: catErr } = await sb.from("menu_categories").insert({
      merchant_id: merchantId,
      name: "Engine menu",
      is_active: true,
      sort_order: 0,
    }).select("id").single();
    if (catErr || !created) throw new Error(catErr?.message || "Failed to create engine category");
    categoryId = String(created.id);
  }

  for (const product of products) {
    const restaurant = Math.max(0, Number(product.basePrice) || 0);
    const customer = customerPriceFromCost(restaurant, markupBps);
    const available = !product.archivedAt;
    const row = {
      id: product.id,
      merchant_id: merchantId,
      category_id: categoryId,
      name: product.name,
      description: product.description || null,
      image_url: product.imageUrl || null,
      price: restaurant,
      in_store_price: restaurant,
      marketplace_price: customer,
      is_available: available,
      prep_time_mins: product.prepMinutes ?? null,
      source_price_checked_at: product.priceCheckedAt || null,
      options: [],
    };
    const { error } = await sb.from("menu_items").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
}

/** Publish + sync shadow menu_items for the merchant (admin + partner publish). */
export async function publishMenuForMerchant(
  sb: Sb,
  merchantId: string,
  menuId: string,
  snapshot: MenuSnapshot,
  publishedBy: string,
): Promise<{ version: number }> {
  const published = await publishMenu(sb, menuId, snapshot, publishedBy);
  const { data: store } = await sb.from("in_house_stores").select("markup_bps").eq("merchant_id", merchantId).maybeSingle();
  const markupBps = Number(store?.markup_bps ?? 1500);
  const frozen = { ...snapshot, menuId, version: published.version };
  await syncShadowMenuItems(sb, merchantId, frozen, markupBps);
  return published;
}

export async function loadPublishedSnapshot(sb: Sb, merchantId: string): Promise<MenuSnapshot | null> {
  const { data: merchant } = await sb.from("merchants").select("engine_menu_id").eq("id", merchantId).maybeSingle();
  if (!merchant?.engine_menu_id) return null;
  const { data: menu } = await sb.from("menus").select("id, version, status").eq("id", merchant.engine_menu_id).maybeSingle();
  if (!menu || menu.status !== "published" || !menu.version) return null;
  const { data: ver } = await sb.from("menu_versions").select("snapshot").eq("menu_id", menu.id).eq("version", menu.version).maybeSingle();
  return parseMenuSnapshot(ver?.snapshot);
}

/** Published snapshot with location_overrides + live menu_items availability applied. */
export async function loadCheckoutSnapshot(sb: Sb, merchantId: string): Promise<MenuSnapshot | null> {
  const base = await loadPublishedSnapshot(sb, merchantId);
  if (!base) return null;

  const { data: overrideRows } = await sb.from("location_overrides")
    .select("target_kind, target_id, price, is_available")
    .eq("merchant_id", merchantId);
  const overrides: LocationOverride[] = (overrideRows || []).map((row: {
    target_kind: string;
    target_id: string;
    price?: number | null;
    is_available?: boolean | null;
  }) => ({
    targetKind: row.target_kind as LocationOverride["targetKind"],
    targetId: String(row.target_id),
    price: row.price,
    isAvailable: row.is_available,
  }));
  let snapshot = overrides.length ? applyLocationOverrides(base, overrides) : base;

  // Live product availability from menu_items (sold-out after publish).
  const productIds = snapshot.products.map((p) => p.id);
  if (productIds.length) {
    const { data: liveRows } = await sb.from("menu_items")
      .select("id, is_available")
      .eq("merchant_id", merchantId)
      .in("id", productIds);
    const live = new Map((liveRows || []).map((r: { id: string; is_available: boolean }) => [String(r.id), r.is_available !== false]));
    const now = new Date().toISOString();
    snapshot = {
      ...snapshot,
      products: snapshot.products.map((p) => {
        if (live.has(p.id) && live.get(p.id) === false) {
          return { ...p, archivedAt: p.archivedAt || now };
        }
        return p;
      }),
    };
  }
  return snapshot;
}

export function markupFromBps(markupBps: number) {
  return (restaurant: number) => customerPriceFromCost(restaurant, markupBps);
}

/** Price a cart line via engine when snapshot + engine fields present; else null (use legacy). */
export function tryEnginePriceLine(
  snapshot: MenuSnapshot | null,
  item: Record<string, unknown>,
  markupBps: number,
) {
  if (!snapshot) return null;
  const productId = String(item.engineProductId || item.productId || "");
  const menuVersion = Number(item.menuVersion);
  if (!productId || !Number.isFinite(menuVersion)) return null;
  const selections = Array.isArray(item.selections)
    ? item.selections
    : Array.isArray(item.engineSelections)
    ? item.engineSelections
    : null;
  if (!selections) return null;
  return priceLine(
    snapshot,
    {
      productId,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      menuVersion,
      selections: selections as any,
      slots: Array.isArray(item.slots) ? item.slots as any : undefined,
    },
    markupFromBps(markupBps),
  );
}

export async function listKitsForMerchant(sb: Sb, merchantId: string) {
  const { data: merchant } = await sb.from("merchants").select("cuisine_type, cuisines").eq("id", merchantId).maybeSingle();
  const cuisines = Array.isArray(merchant?.cuisines) && merchant.cuisines.length
    ? merchant.cuisines as string[]
    : merchant?.cuisine_type
    ? [String(merchant.cuisine_type)]
    : [];
  const { data: rows } = await sb.from("menu_kits").select("id, cuisine, name, payload");
  if (rows?.length) {
    const set = new Set(cuisines.map((c) => c.toLowerCase()));
    return rows.filter((r: { cuisine: string }) => set.has(String(r.cuisine).toLowerCase()) || set.size === 0);
  }
  return kitsForCuisines(cuisines);
}
