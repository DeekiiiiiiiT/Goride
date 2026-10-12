import { FIRST_ORDER_CAP_MINOR, optionExtras, pickedOptions, priceIsFresh } from "./pricing.ts";
import { inHouseAudienceAllows, inHouseStoreIsVisible, loadInHouseStore } from "./visibility.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

type MenuRow = {
  id: string;
  in_store_price?: number | null;
  source_price_checked_at?: string | null;
  is_available?: boolean;
  options?: unknown;
};

const CASH = "Cash on delivery is not available yet. Please pay with card via WiPay.";
const UNAVAILABLE = "Unavailable menu item";
const CLOSED = "This store is not accepting orders right now";
const OVER_LIMIT = "This order is over the store limit";

/** Refuse an In-House checkout that would spend Roam's money before the rules are met. */
export async function assertInHouseCheckout(
  sb: Sb,
  input: {
    merchant: { id: string; procurement_mode?: string | null; in_house_live?: boolean | null };
    paymentMethod: string;
    customerId: string;
    menuRows: MenuRow[];
    quantities: Map<string, number>;
    rawItems?: unknown[];
  },
): Promise<{ ok: true; expectedCostMinor: number } | { ok: false; status: number; error: string; code: string }> {
  if (String(input.merchant.procurement_mode || "partner") !== "in_house") {
    return { ok: true, expectedCostMinor: 0 };
  }
  if (input.paymentMethod !== "wipay") {
    return { ok: false, status: 400, error: CASH, code: "cash_not_available" };
  }
  const allowed = await inHouseAudienceAllows(sb, input.merchant, input.customerId);
  if (!allowed) {
    return { ok: false, status: 404, error: "Merchant not found", code: "not_found" };
  }
  const visible = await inHouseStoreIsVisible(sb, input.merchant);
  if (!visible) {
    return { ok: false, status: 409, error: CLOSED, code: "not_accepting" };
  }
  const store = await loadInHouseStore(sb, input.merchant.id);
  let expected = 0;
  for (const row of input.menuRows) {
    if (row.in_store_price == null || !Number.isFinite(Number(row.in_store_price))) {
      return { ok: false, status: 400, error: UNAVAILABLE, code: "unavailable_menu_item" };
    }
    if (!priceIsFresh(row.source_price_checked_at)) {
      return { ok: false, status: 409, error: UNAVAILABLE, code: "unavailable_menu_item" };
    }
    const qty = input.quantities.get(String(row.id)) || 0;
    expected += Math.round(Number(row.in_store_price) * 100) * qty;
    for (const item of input.rawItems || []) {
      const raw = item as { menuItemId?: string; id?: string; item_id?: string; quantity?: number };
      if (String(raw.menuItemId || raw.id || raw.item_id || "") !== String(row.id)) continue;
      const lineQty = Math.max(1, Math.floor(Number(raw.quantity) || 1));
      expected += Math.round(optionExtras(row.options, pickedOptions(item)).restaurant * 100) * lineQty;
    }
  }
  if (store?.max_order_minor != null && expected > Number(store.max_order_minor)) {
    return { ok: false, status: 400, error: OVER_LIMIT, code: "over_store_limit" };
  }
  const { count } = await sb.from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", input.customerId)
    .eq("payment_status", "paid");
  if ((count || 0) < 1 && expected > FIRST_ORDER_CAP_MINOR) {
    return { ok: false, status: 400, error: OVER_LIMIT, code: "over_store_limit" };
  }
  return { ok: true, expectedCostMinor: expected };
}
