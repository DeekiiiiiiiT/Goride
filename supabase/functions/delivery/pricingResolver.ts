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
import type { CoverageEvalResult } from "./admin/coverageEval.ts";
import {
  resolveMarketForPoint,
  type MarketPointResolve,
} from "./admin/coverageZones.ts";
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
  /** Admin simulator: override order count (skip DB lookup) for launch free-delivery promo */
  customerOrderCount?: number | null;
  /**
   * When true (default for customer paths), refuse to invent a market if dropoff is uncovered.
   * Admin preview with override can still price without coverage.
   */
  requireCoverage?: boolean;
};

export type ResolvedPricing = PricingBreakdown & {
  pricingProfileVersion: number;
  marketId: string | null;
  rules: PricingRules;
  pricingV2Enabled: boolean;
  taxRatePercent?: number;
  gctRegistered?: boolean;
  /** Geo resolution from dropoff (independent of marketIdOverride) */
  resolvedMarketId?: string | null;
  covered?: boolean;
  coverage?: CoverageEvalResult | null;
  marketOverrideApplied?: boolean;
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

export { resolveMarketForPoint, assertSameMarketCoverage } from "./admin/coverageZones.ts";

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

  const overrideRaw = input.marketIdOverride && String(input.marketIdOverride).trim()
    ? String(input.marketIdOverride).trim()
    : null;
  const marketOverrideApplied = Boolean(overrideRaw);

  let geo: MarketPointResolve | null = null;
  if (dropLat != null && dropLng != null) {
    geo = await resolveMarketForPoint(sb, dropLat, dropLng);
  }

  const resolvedMarketId = geo?.covered ? geo.marketId : null;
  const covered = geo?.covered === true;
  const coverage = geo?.eval ?? null;

  // Pricing market: override (admin) wins; else geo only — never invent first active market
  let marketId: string | null = overrideRaw ?? resolvedMarketId;

  const requireCoverage = input.requireCoverage !== false && !overrideRaw;
  if (requireCoverage && dropLat != null && dropLng != null && !covered) {
    return {
      ...buildOrderPricing({
        subtotal: input.subtotal,
        discount: input.discount,
        tip: input.tip,
        distanceKm: null,
        rules: parsePricingRules(null),
        paymentMethod: input.paymentMethod,
      }),
      pricingProfileVersion: 0,
      marketId: null,
      rules: parsePricingRules(null),
      pricingV2Enabled: false,
      resolvedMarketId: null,
      covered: false,
      coverage,
      marketOverrideApplied,
    };
  }

  let rules = parsePricingRules(null);
  let version = 1;

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

  const customerOrderCount = input.customerOrderCount != null &&
      Number.isFinite(Number(input.customerOrderCount))
    ? Math.max(0, Math.floor(Number(input.customerOrderCount)))
    : await loadCustomerOrderCount(sb, input.customerId);

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
    resolvedMarketId,
    covered,
    coverage,
    marketOverrideApplied,
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
