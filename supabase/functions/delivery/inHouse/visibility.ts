import { getSetting } from "../../_shared/rushSettings/getSetting.ts";
import { audienceAllows } from "./deskRules.ts";
import { DESK_FRESH_MS, storeOpenNow, type WeekHourRow } from "./pricing.ts";

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
  return await getSetting<boolean>("customer.in_house.enabled");
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

/** Hide an In-House store unless the switch, the desk, and today's hours all say yes. */
export async function inHouseStoreIsVisible(
  sb: Sb,
  merchant: { id?: string; procurement_mode?: string | null; in_house_live?: boolean | null },
): Promise<boolean> {
  if (String(merchant.procurement_mode || "partner") !== "in_house") return true;
  if (!merchant.in_house_live) return false;
  if (!(await inHouseGloballyEnabled())) return false;
  const store = await loadInHouseStore(sb, String(merchant.id));
  if (!store) return false;
  const { data: hours } = await sb.from("merchant_hours")
    .select("day_of_week, open_time, close_time, is_closed")
    .eq("merchant_id", String(merchant.id));
  if (!storeOpenNow((hours || []) as WeekHourRow[])) return false;
  return await deskIsStaffed(sb);
}

export async function customerIdFromAuth(userSb: {
  auth: { getUser: () => Promise<{ data: { user: { id?: string } | null } }> };
}, serviceSb: Sb): Promise<string | null> {
  const { data: auth } = await userSb.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;
  const { data } = await serviceSb.from("customers").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function customerOnBetaList(sb: Sb, customerId: string | null): Promise<boolean> {
  if (!customerId) return false;
  const { data } = await sb.from("in_house_beta_customers").select("customer_id").eq("customer_id", customerId).maybeSingle();
  return Boolean(data?.customer_id);
}

/** False only when this person must not know the store exists. A public store still returns true. */
export async function inHouseAudienceAllows(
  sb: Sb,
  merchant: { id?: string; procurement_mode?: string | null },
  customerId: string | null,
): Promise<boolean> {
  if (String(merchant.procurement_mode || "partner") !== "in_house") return true;
  const store = await loadInHouseStore(sb, String(merchant.id || ""));
  const audience = String((store as { audience?: string } | null)?.audience || "public");
  return audienceAllows(audience, await customerOnBetaList(sb, customerId));
}

export async function filterDiscoveryMerchants<T extends { id?: string; procurement_mode?: string | null; in_house_live?: boolean | null }>(
  sb: Sb,
  rows: T[],
  customerId: string | null = null,
): Promise<T[]> {
  const inHouse = rows.filter((row) => String(row.procurement_mode || "") === "in_house");
  if (!inHouse.length) return rows;
  const enabled = await inHouseGloballyEnabled();
  const ids = inHouse.map((row) => String(row.id || "")).filter(Boolean);
  const { data: stores } = ids.length
    ? await sb.from("in_house_stores").select("merchant_id, audience").in("merchant_id", ids)
    : { data: [] };
  const audienceByMerchant = new Map((stores || []).map((row: { merchant_id: string; audience?: string }) => [
    String(row.merchant_id),
    String(row.audience || "public"),
  ]));
  const onList = await customerOnBetaList(sb, customerId);
  return rows.filter((row) => {
    if (String(row.procurement_mode || "") !== "in_house") return true;
    if (!enabled || !row.in_house_live) return false;
    return audienceAllows(audienceByMerchant.get(String(row.id)), onList);
  });
}
