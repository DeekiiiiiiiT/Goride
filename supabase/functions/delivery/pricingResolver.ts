/**
 * Server-side pricing resolver for Rush Model B.
 * Loads merchant tier + market profile, computes distance, returns breakdown.
 */
import {
  buildOrderPricing,
  haversineKm,
  parsePricingRules,
  parseServiceFeeOverride,
  roundDistanceKm,
  type MerchantTier,
  type PaymentMethod,
  type PricingBreakdown,
  type PricingRules,
} from "../_shared/dashPricing.ts";
import { evaluateCoverage, type CoverageZone } from "./admin/coverageEval.ts";
import { resolveMerchantFoodGctRate } from "../_shared/gctRate.ts";

export type PricingResolverInput = {
  merchantId: string;
  subtotal: number;
  discount?: number;
  tip?: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  customerId?: string | null;
  freeDelivery?: boolean;
  paymentMethod?: PaymentMethod;
  serviceFeeWaived?: boolean;
  /** Admin simulator: force a market instead of geo-resolving from dropoff */
  marketIdOverride?: string | null;
};

export type ResolvedPricing = PricingBreakdown & {
  pricingProfileVersion: number;
  marketId: string | null;
  rules: PricingRules;
  pricingV2Enabled: boolean;
  taxRatePercent?: number;
  gctRegistered?: boolean;
};

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

function asCoord(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadCustomerOrderCount(
  sb: ServiceSb,
  customerId: string | null | undefined,
): Promise<number> {
  if (!customerId) return 0;
  const { count } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .not("status", "in", '("cancelled")');
  return count ?? 0;
}

async function resolveMarketForPoint(
  sb: ServiceSb,
  lat: number,
  lng: number,
): Promise<{ marketId: string | null; zones: CoverageZone[] }> {
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, slug, is_active")
    .eq("is_active", true);

  if (!markets?.length) return { marketId: null, zones: [] };

  const marketIds = markets.map((m: { id: string }) => m.id);
  const { data: zoneRows } = await sb
    .from("service_zone_polygons")
    .select("id, name, market_id, kind, polygon")
    .in("market_id", marketIds);

  const zones: CoverageZone[] = (zoneRows ?? []).map((z: Record<string, unknown>) => ({
    id: String(z.id),
    name: String(z.name),
    market_id: z.market_id ? String(z.market_id) : undefined,
    kind: z.kind ? String(z.kind) : "include",
    polygon: Array.isArray(z.polygon) ? z.polygon as { lat: number; lng: number }[] : [],
  }));

  const evalResult = evaluateCoverage(lat, lng, zones);
  if (evalResult.inZone && evalResult.matchedInclude?.market_id) {
    return { marketId: evalResult.matchedInclude.market_id, zones };
  }

  // Fallback: first active market (soft launch)
  const first = markets[0] as { id: string };
  return { marketId: first.id, zones };
}

async function loadActiveProfile(
  sb: ServiceSb,
  marketId: string,
): Promise<{ rules: PricingRules; version: number } | null> {
  const { data } = await sb
    .from("market_pricing_profiles")
    .select("version, rules")
    .eq("market_id", marketId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    rules: parsePricingRules(data.rules as Record<string, unknown>),
    version: Number(data.version ?? 1),
  };
}

async function loadMerchantPricingContext(
  sb: ServiceSb,
  merchantId: string,
): Promise<{
  found: boolean;
  lat: number | null;
  lng: number | null;
  tier: MerchantTier | null;
  merchantCommissionRateOverride: number | null;
  serviceFeeOverride: ReturnType<typeof parseServiceFeeOverride>;
  error?: string;
}> {
  // Minimal select first — optional Model B columns may be missing on older DBs
  const { data: merchant, error } = await sb
    .from("merchants")
    .select("id, lat, lng")
    .eq("id", merchantId)
    .maybeSingle();

  if (error) {
    console.error("[pricingResolver] merchant load failed:", error.message);
    return {
      found: false,
      lat: null,
      lng: null,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: error.message,
    };
  }

  if (!merchant) {
    return {
      found: false,
      lat: null,
      lng: null,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: "Merchant not found",
    };
  }

  const base = merchant as Record<string, unknown>;
  let tier: MerchantTier | null = null;
  let merchantCommissionRateOverride: number | null = null;
  let serviceFeeOverride: ReturnType<typeof parseServiceFeeOverride> = null;

  const { data: extras } = await sb
    .from("merchants")
    .select("merchant_commission_rate, service_fee_override, pricing_tier_id")
    .eq("id", merchantId)
    .maybeSingle();

  if (extras) {
    const row = extras as Record<string, unknown>;
    merchantCommissionRateOverride = row.merchant_commission_rate != null
      ? Number(row.merchant_commission_rate)
      : null;
    serviceFeeOverride = parseServiceFeeOverride(
      row.service_fee_override as Record<string, unknown> | null,
    );
    const tierId = row.pricing_tier_id ? String(row.pricing_tier_id) : null;
    if (tierId) {
      const { data: tierRow } = await sb
        .from("merchant_tiers")
        .select("slug, name, commission_rate")
        .eq("id", tierId)
        .maybeSingle();
      if (tierRow) {
        const t = tierRow as Record<string, unknown>;
        tier = {
          slug: String(t.slug),
          name: String(t.name),
          commissionRate: Number(t.commission_rate),
        };
      }
    }
  }

  return {
    found: true,
    lat: asCoord(base.lat),
    lng: asCoord(base.lng),
    tier,
    merchantCommissionRateOverride,
    serviceFeeOverride,
  };
}

/** Resolve full pricing for a merchant order quote or placement. */
export async function resolveDashOrderPricing(
  sb: ServiceSb,
  input: PricingResolverInput,
): Promise<ResolvedPricing | null> {
  const ctx = await loadMerchantPricingContext(sb, input.merchantId);
  if (!ctx.found) {
    console.error("[pricingResolver] cannot resolve:", ctx.error, input.merchantId);
    return null;
  }

  // Missing store pin → still quote (base delivery fee); distance stays null
  const dropLat = asCoord(input.dropoffLat);
  const dropLng = asCoord(input.dropoffLng);

  let marketId: string | null =
    input.marketIdOverride && String(input.marketIdOverride).trim()
      ? String(input.marketIdOverride).trim()
      : null;
  let rules = parsePricingRules(null);
  let version = 1;

  if (!marketId && dropLat != null && dropLng != null) {
    const market = await resolveMarketForPoint(sb, dropLat, dropLng);
    marketId = market.marketId;
  }

  if (!marketId) {
    const { data: fallbackMarket } = await sb
      .from("service_markets")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    marketId = fallbackMarket?.id ? String(fallbackMarket.id) : null;
  }

  if (marketId) {
    const profile = await loadActiveProfile(sb, marketId);
    if (profile) {
      rules = profile.rules;
      version = profile.version;
    }
  }

  let distanceKm: number | null = null;
  if (dropLat != null && dropLng != null && ctx.lat != null && ctx.lng != null) {
    distanceKm = roundDistanceKm(haversineKm(ctx.lat, ctx.lng, dropLat, dropLng));
  }

  const customerOrderCount = await loadCustomerOrderCount(sb, input.customerId);

  const gct = await resolveMerchantFoodGctRate(sb, input.merchantId);

  const breakdown = buildOrderPricing({
    subtotal: input.subtotal,
    discount: input.discount,
    tip: input.tip,
    distanceKm,
    rules,
    tier: ctx.tier,
    merchantCommissionRateOverride: ctx.merchantCommissionRateOverride,
    serviceFeeOverride: ctx.serviceFeeOverride,
    customerOrderCount,
    freeDelivery: input.freeDelivery,
    paymentMethod: input.paymentMethod,
    serviceFeeWaived: input.serviceFeeWaived,
    taxRatePercent: gct.ratePercent,
  });

  return {
    ...breakdown,
    taxRatePercent: gct.ratePercent,
    gctRegistered: gct.gctRegistered,
    pricingProfileVersion: version,
    marketId,
    rules,
    pricingV2Enabled: rules.pricingV2Enabled === true,
  };
}

/** Check if Model B pricing is enabled for a market. */
export async function isPricingV2EnabledForMarket(
  sb: ServiceSb,
  marketId: string | null,
): Promise<boolean> {
  if (!marketId) return false;
  const profile = await loadActiveProfile(sb, marketId);
  return profile?.rules.pricingV2Enabled === true;
}
