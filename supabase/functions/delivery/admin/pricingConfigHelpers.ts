/**
 * Shared pricing-config load + validate helpers.
 * Used by pricingRoutes (profile writes) and rushPassRoutes (plan write / Finding M).
 */
import {
  parsePricingRules,
  validatePricingConfig,
  type MerchantTier,
  type PricingRules,
} from "../../_shared/dashPricing.ts";
import { getDb } from "./merchantAdminShared.ts";
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";

export function rowToMerchantTier(row: Record<string, unknown>): MerchantTier {
  return {
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    commissionRate: Number(row.commission_rate ?? 0),
    searchBoost: row.search_boost != null ? Number(row.search_boost) : undefined,
    defaultDeliveryRadiusKm: row.default_delivery_radius_km != null
      ? Number(row.default_delivery_radius_km)
      : undefined,
    promoEligible: row.promo_eligible != null ? Boolean(row.promo_eligible) : undefined,
    autoAds: row.auto_ads != null ? Boolean(row.auto_ads) : undefined,
  };
}

export async function loadActiveTiers(
  db: ReturnType<typeof getDb> = getDb(),
): Promise<MerchantTier[]> {
  const { data } = await db
    .from("merchant_tiers")
    .select(
      "slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, auto_ads",
    )
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((row) => rowToMerchantTier(row as Record<string, unknown>));
}

export async function assertValidPricingConfig(
  db: ReturnType<typeof getDb>,
  rules: PricingRules,
  tiersOverride?: MerchantTier[],
): Promise<{ error: string; code: string } | null> {
  const tiers = tiersOverride ?? await loadActiveTiers(db);
  const err = validatePricingConfig(rules, tiers);
  if (!err) return null;
  return { error: err.message, code: err.code };
}

export async function loadActiveProfileRules(opts: {
  db: ReturnType<typeof getDb>;
  table: "global_pricing_profiles" | "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn?: "parish_id" | "market_id";
  matchId?: string;
}): Promise<Record<string, unknown>> {
  const { db, table, matchColumn, matchId } = opts;
  let query = db.from(table).select("rules").eq("is_active", true);
  if (matchColumn && matchId) query = query.eq(matchColumn, matchId);
  const { data } = await query.order("version", { ascending: false }).limit(1).maybeSingle();
  return ((data?.rules ?? {}) as Record<string, unknown>);
}

/**
 * Finding M: validate plan caps against the same invariants as profile writes.
 * Overlays rushPass onto the active global profile rules before validatePricingConfig.
 */
export async function assertRushPassPlanCapsValid(opts: {
  maxFreeDeliveryKm: number;
  monthlySubsidyBudgetJmd: number;
}): Promise<{ error: string; code: string } | null> {
  const db = getDb();
  const raw = await loadActiveProfileRules({ db, table: "global_pricing_profiles" });
  const parsed = parsePricingRules({
    ...raw,
    rush_pass: {
      max_free_delivery_km: opts.maxFreeDeliveryKm,
      monthly_subsidy_budget_jmd: opts.monthlySubsidyBudgetJmd,
    },
  });
  return assertValidPricingConfig(db, parsed);
}

/**
 * Finding T: insert new active profile first, then deactivate older actives.
 * Never deactivate-then-insert (insert failure left zero active profiles).
 */
export async function insertThenActivateProfile(opts: {
  db: ReturnType<typeof getDb>;
  table: "global_pricing_profiles" | "parish_pricing_profiles" | "market_pricing_profiles";
  matchColumn?: "parish_id" | "market_id";
  matchId?: string;
  rules: Record<string, unknown>;
  adminUser: ProductAdminUser;
  /** Preserve override_enabled from prior parish/market row when set. */
  overrideEnabled?: boolean;
}): Promise<
  | { ok: true; version: number; created: Record<string, unknown> }
  | { ok: false; error: string; nextVersion: number }
> {
  const { db, table, matchColumn, matchId, rules, adminUser } = opts;
  let currentQuery = db.from(table).select("*").eq("is_active", true);
  if (matchColumn && matchId) currentQuery = currentQuery.eq(matchColumn, matchId);
  const { data: current } = await currentQuery
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = current ? Number(current.version ?? 0) + 1 : 1;
  const insertRow: Record<string, unknown> = {
    version: nextVersion,
    is_active: true,
    rules,
    created_by: adminUser.id,
  };
  if (table !== "global_pricing_profiles") {
    insertRow.override_enabled = opts.overrideEnabled ?? current?.override_enabled !== false;
  }
  if (matchColumn && matchId) insertRow[matchColumn] = matchId;

  const { data: created, error } = await db.from(table).insert(insertRow).select().single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "profile_insert_failed", nextVersion };
  }

  // Deactivate prior actives after successful insert (two actives briefly is OK —
  // readers take order by version desc limit 1).
  let deactivate = db
    .from(table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("is_active", true)
    .neq("id", created.id);
  if (matchColumn && matchId) deactivate = deactivate.eq(matchColumn, matchId);
  await deactivate;

  return { ok: true, version: nextVersion, created: created as Record<string, unknown> };
}

/** Mirror plan caps into active global profile so Simulator / CI stay aligned. */
export async function mirrorRushPassCapsToGlobalProfile(opts: {
  maxFreeDeliveryKm: number;
  monthlySubsidyBudgetJmd: number;
  adminUser: ProductAdminUser;
}): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const db = getDb();
  const { data: current } = await db
    .from("global_pricing_profiles")
    .select("*")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevRules = ((current?.rules ?? {}) as Record<string, unknown>);
  const nextRules: Record<string, unknown> = {
    ...prevRules,
    rush_pass: {
      max_free_delivery_km: opts.maxFreeDeliveryKm,
      monthly_subsidy_budget_jmd: opts.monthlySubsidyBudgetJmd,
    },
  };

  const result = await insertThenActivateProfile({
    db,
    table: "global_pricing_profiles",
    rules: nextRules,
    adminUser: opts.adminUser,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, version: result.version };
}
