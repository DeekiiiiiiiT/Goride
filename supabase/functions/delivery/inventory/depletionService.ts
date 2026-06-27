import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appendLedgerEntry } from "./ledgerService.ts";

export async function depleteForPosSale(
  sb: SupabaseClient,
  input: {
    nodeId: string;
    orderId: string;
    items: Array<{ menuItemId: string; quantity: number }>;
    idempotencyPrefix: string;
  },
): Promise<void> {
  for (const sold of input.items) {
    const { data: recipe } = await sb
      .from("recipes")
      .select(`
        id, yield_pct,
        recipe_ingredients (
          item_id, qty_required, uom_id, yield_pct
        )
      `)
      .eq("menu_item_id", sold.menuItemId)
      .maybeSingle();

    if (!recipe) {
      const { data: legacyRecipes } = await sb
        .from("menu_item_recipes")
        .select("ingredient_id, quantity_per_serving")
        .eq("menu_item_id", sold.menuItemId);

      for (const legacy of legacyRecipes ?? []) {
        const row = legacy as Record<string, unknown>;
        const { data: item } = await sb
          .from("item_master")
          .select("id, recipe_uom_id")
          .eq("legacy_ingredient_id", String(row.ingredient_id))
          .maybeSingle();
        if (!item) continue;
        const itemRow = item as Record<string, unknown>;
        const delta = -Number(row.quantity_per_serving) * sold.quantity;
        await appendLedgerEntry(sb, {
          nodeId: input.nodeId,
          itemId: String(itemRow.id),
          qty: delta,
          uomId: String(itemRow.recipe_uom_id),
          transactionType: "pos_depletion",
          referenceType: "order",
          referenceId: input.orderId,
          idempotencyKey: `${input.idempotencyPrefix}:${sold.menuItemId}:${String(row.ingredient_id)}`,
        });
      }
      continue;
    }

    const recipeRow = recipe as Record<string, unknown>;
    const recipeYield = Number(recipeRow.yield_pct) / 100;
    const ingredients = recipeRow.recipe_ingredients as Record<string, unknown>[] | null;

    for (const ing of ingredients ?? []) {
      const lineYield = Number(ing.yield_pct) / 100;
      const grossQty = Number(ing.qty_required) * sold.quantity;
      const netQty = grossQty / (recipeYield * lineYield);

      await appendLedgerEntry(sb, {
        nodeId: input.nodeId,
        itemId: String(ing.item_id),
        qty: -netQty,
        uomId: String(ing.uom_id),
        transactionType: "pos_depletion",
        referenceType: "order",
        referenceId: input.orderId,
        idempotencyKey: `${input.idempotencyPrefix}:${sold.menuItemId}:${String(ing.item_id)}`,
      });
    }
  }
}

export async function resolveNodeIdForMerchant(
  sb: SupabaseClient,
  merchantId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("inventory_nodes")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return data ? String((data as Record<string, unknown>).id) : null;
}

export function merchantUsesEnterpriseInventory(merchant: Record<string, unknown>): boolean {
  return String(merchant.inventory_mode ?? "legacy") === "enterprise";
}

export function merchantShadowInventory(merchant: Record<string, unknown>): boolean {
  return Boolean(merchant.enterprise_inventory_shadow);
}
