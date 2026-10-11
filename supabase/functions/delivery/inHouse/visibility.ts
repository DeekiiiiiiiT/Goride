import { getFlag } from "../../_shared/featureFlags.ts";
import { DESK_FRESH_MS, withinOfferWindow } from "./pricing.ts";

// deno-lint-ignore no-explicit-any
type Sb = { from: (table: string) => any };

export type InHouseStoreRow = {
  merchant_id: string;
  order_url?: string | null;
  order_phone?: string | null;
  pickup_instructions?: string | null;
  default_prep_minutes?: number | null;
  markup_bps?: number | null;
  price_tolerance_bps?: number | null;
  absorb_cap_minor?: number | null;
  max_order_minor?: number | null;
  legal_disclaimer?: string | null;
  offer_start_minute?: number | null;
  offer_end_minute?: number | null;
  source_brand?: string | null;
  automation_level?: string | null;
  adapter_key?: string | null;
  tos_allows_automation?: boolean | null;
};

export async function inHouseGloballyEnabled(): Promise<boolean> {
  return await getFlag("IN_HOUSE_ENABLED", false);
}

export async function deskIsStaffed(sb: Sb, now = Date.now()): Promise<boolean> {
  const since = new Date(now - DESK_FRESH_MS).toISOString();
  const { count } = await sb.from("in_house_desk_presence")
    .select("user_id", { count: "exact", head: true })
    .gte("last_seen_at", since);
  return (count || 0) > 0;
}

export async function loadInHouseStore(sb: Sb, merchantId: string): Promise<InHouseStoreRow | null> {
  const { data } = await sb.from("in_house_stores").select("*").eq("merchant_id", merchantId).maybeSingle();
  return data as InHouseStoreRow | null;
}

export function storeOpenNow(store: InHouseStoreRow, now = new Date()): boolean {
  return withinOfferWindow(
    Number(store.offer_start_minute ?? 0),
    Number(store.offer_end_minute ?? 24 * 60),
    now,
  );
}

/** Hide an In-House store unless the switch, the desk, and the hours all say yes. */
export async function inHouseStoreIsVisible(
  sb: Sb,
  merchant: { id?: string; procurement_mode?: string | null; in_house_live?: boolean | null },
): Promise<boolean> {
  if (String(merchant.procurement_mode || "partner") !== "in_house") return true;
  if (!merchant.in_house_live) return false;
  if (!(await inHouseGloballyEnabled())) return false;
  const store = await loadInHouseStore(sb, String(merchant.id));
  if (!store || !storeOpenNow(store)) return false;
  return await deskIsStaffed(sb);
}

export async function filterDiscoveryMerchants<T extends { id?: string; procurement_mode?: string | null; in_house_live?: boolean | null }>(
  sb: Sb,
  rows: T[],
): Promise<T[]> {
  const inHouse = rows.filter((row) => String(row.procurement_mode || "") === "in_house");
  if (!inHouse.length) return rows;
  const enabled = await inHouseGloballyEnabled();
  return rows.filter((row) => {
    if (String(row.procurement_mode || "") !== "in_house") return true;
    return enabled && Boolean(row.in_house_live);
  });
}
