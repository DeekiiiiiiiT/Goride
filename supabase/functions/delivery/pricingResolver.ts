/**
 * Server-side pricing resolver for Rush Model B.
 * Loads merchant tier + market profile, computes distance, returns breakdown.
 * Admin simulator can run standalone (no merchant row) with pickup pin + tier + GCT.
 */
import {
  applyRoadDistanceMultiplier,
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
import {
  effectiveFoodGctRatePercent,
  effectivePlatformGctRatePercent,
  isValidGctRate,
  loadGlobalGctConfig,
  resolveOrderGctRates,
} from "../_shared/gctRate.ts";
import { resolvePricingLayers } from "./pricingLayers.ts";

export type PricingResolverInput = {
  /** Real order / merchant preview. Omit for admin standalone calculator. */
  merchantId?: string | null;
  subtotal: number;
  discount?: number;
  tip?: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  /** Standalone calculator: store pin (required when no merchantId) */
  pickupLat?: number | null;
  pickupLng?: number | null;
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
  /** Admin simulator: force a merchant tier instead of the merchant's assigned tier */
  tierIdOverride?: string | null;
  /** Standalone calculator: treat restaurant as GCT-registered (default true) */
  gctRegistered?: boolean | null;
  /** Standalone calculator: optional food GCT % override */
  taxRatePercent?: number | null;
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

type PricingContext = {
  found: boolean;
  lat: number | null;
  lng: number | null;
  tier: MerchantTier | null;
  merchantCommissionRateOverride: number | null;
  serviceFeeOverride: ReturnType<typeof parseServiceFeeOverride>;
  error?: string;
};

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

async function loadTierById(
  sb: ServiceSb,
  tierId: string | null | undefined,
): Promise<MerchantTier | null> {
  if (!tierId || !String(tierId).trim()) return null;
  const { data: tierRow } = await sb
    .from("merchant_tiers")
    .select(
      "slug, name, commission_rate, base_delivery_fee_jmd, menu_inflation_percent, search_boost, default_delivery_radius_km, promo_eligible",
    )
    .eq("id", String(tierId).trim())
    .maybeSingle();
  if (!tierRow) return null;
  const t = tierRow as Record<string, unknown>;
  return {
    slug: String(t.slug),
    name: String(t.name),
    commissionRate: Number(t.commission_rate),
    baseDeliveryFeeJmd: t.base_delivery_fee_jmd != null
      ? Number(t.base_delivery_fee_jmd)
      : null,
    menuInflationPercent: t.menu_inflation_percent != null
      ? Number(t.menu_inflation_percent)
      : null,
    searchBoost: t.search_boost != null ? Number(t.search_boost) : undefined,
    defaultDeliveryRadiusKm: t.default_delivery_radius_km != null
      ? Number(t.default_delivery_radius_km)
      : undefined,
    promoEligible: t.promo_eligible != null ? Boolean(t.promo_eligible) : undefined,
  };
}

async function loadMerchantPricingContext(
  sb: ServiceSb,
  merchantId: string,
  tierIdOverride?: string | null,
): Promise<PricingContext> {
  // Single fetch — Model B columns exist on all current DBs
  const { data: merchant, error } = await sb
    .from("merchants")
    .select("id, lat, lng, merchant_commission_rate, service_fee_override, pricing_tier_id")
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
  const merchantCommissionRateOverride = base.merchant_commission_rate != null
    ? Number(base.merchant_commission_rate)
    : null;
  const serviceFeeOverride = parseServiceFeeOverride(
    base.service_fee_override as Record<string, unknown> | null,
  );
  const tierId = (tierIdOverride && String(tierIdOverride).trim())
    || (base.pricing_tier_id ? String(base.pricing_tier_id) : null);
  const tier = await loadTierById(sb, tierId);

  return {
    found: true,
    lat: asCoord(base.lat),
    lng: asCoord(base.lng),
    tier,
    merchantCommissionRateOverride,
    serviceFeeOverride,
  };
}

/** Admin calculator: no merchant row — pin + tier + GCT from request. */
async function loadStandalonePricingContext(
  sb: ServiceSb,
  input: PricingResolverInput,
): Promise<PricingContext> {
  const lat = asCoord(input.pickupLat);
  const lng = asCoord(input.pickupLng);
  if (lat == null || lng == null) {
    return {
      found: false,
      lat: null,
      lng: null,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: "pickup_lat and pickup_lng required for standalone preview",
    };
  }
  const tierId = input.tierIdOverride && String(input.tierIdOverride).trim()
    ? String(input.tierIdOverride).trim()
    : null;
  if (!tierId) {
    return {
      found: false,
      lat,
      lng,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: "tier_id required for standalone preview",
    };
  }
  const tier = await loadTierById(sb, tierId);
  if (!tier) {
    return {
      found: false,
      lat,
      lng,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: "Tier not found",
    };
  }
  return {
    found: true,
    lat,
    lng,
    tier,
    merchantCommissionRateOverride: null,
    serviceFeeOverride: null,
  };
}

async function resolveStandaloneGct(
  sb: ServiceSb,
  input: PricingResolverInput,
): Promise<{
  ratePercent: number;
  gctRegistered: boolean;
  platformRatePercent: number;
  gctEnabled: boolean;
}> {
  const config = await loadGlobalGctConfig(sb as Parameters<typeof loadGlobalGctConfig>[0]);
  const gctRegistered = input.gctRegistered === false ? false : true;
  const ratePercent = isValidGctRate(input.taxRatePercent)
    ? Number(input.taxRatePercent)
    : effectiveFoodGctRatePercent(config, gctRegistered);
  const platformRatePercent = config.enabled
    ? effectivePlatformGctRatePercent(config)
    : 0;
  return {
    ratePercent,
    gctRegistered,
    platformRatePercent,
    gctEnabled: config.enabled,
  };
}

export { resolveMarketForPoint, assertSameMarketCoverage } from "./admin/coverageZones.ts";

/** Resolve full pricing for a merchant order quote or placement. */
export async function resolveDashOrderPricing(
  sb: ServiceSb,
  input: PricingResolverInput,
): Promise<ResolvedPricing | null> {
  const merchantId = input.merchantId && String(input.merchantId).trim()
    ? String(input.merchantId).trim()
    : null;

  const ctx = merchantId
    ? await loadMerchantPricingContext(sb, merchantId, input.tierIdOverride)
    : await loadStandalonePricingContext(sb, input);

  if (!ctx.found) {
    console.error(
      "[pricingResolver] cannot resolve:",
      ctx.error,
      merchantId ?? "standalone",
    );
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
  const marketId: string | null = overrideRaw ?? resolvedMarketId;

  const requireCoverage = input.requireCoverage !== false && !overrideRaw;
  if (requireCoverage && dropLat != null && dropLng != null && !covered) {
    const gctConfig = await loadGlobalGctConfig(sb as Parameters<typeof loadGlobalGctConfig>[0]);
    return {
      ...buildOrderPricing({
        subtotal: input.subtotal,
        discount: input.discount,
        tip: input.tip,
        distanceKm: null,
        rules: parsePricingRules(null),
        paymentMethod: input.paymentMethod,
        taxRatePercent: gctConfig.ratePercent,
        platformTaxRatePercent: effectivePlatformGctRatePercent(gctConfig),
      }),
      pricingProfileVersion: 0,
      marketId: null,
      rules: parsePricingRules(null),
      pricingV2Enabled: true,
      resolvedMarketId: null,
      covered: false,
      coverage,
      marketOverrideApplied,
    };
  }

  let rules = parsePricingRules(null);
  let version = 1;

  const layered = await resolvePricingLayers(sb, { marketId });
  rules = layered.rules;
  version = layered.version;

  let distanceKmRaw: number | null = null;
  let distanceKm: number | null = null;
  if (dropLat != null && dropLng != null && ctx.lat != null && ctx.lng != null) {
    distanceKmRaw = roundDistanceKm(haversineKm(ctx.lat, ctx.lng, dropLat, dropLng));
    distanceKm = applyRoadDistanceMultiplier(
      distanceKmRaw,
      rules.roadDistanceMultiplier,
    );
  }

  const customerOrderCount = input.customerOrderCount != null &&
      Number.isFinite(Number(input.customerOrderCount))
    ? Math.max(0, Math.floor(Number(input.customerOrderCount)))
    : await loadCustomerOrderCount(sb, input.customerId);

  const gct = merchantId
    ? await resolveOrderGctRates(sb, merchantId)
    : await resolveStandaloneGct(sb, input);

  // Fold into buildOrderPricing so split / GCT / processing fee see the surcharge.
  const zoneSurchargeJmd =
    coverage?.policy?.action === "surcharge"
      ? Math.max(0, Math.trunc(Number(coverage.policy.params?.amount_jmd ?? 200)))
      : 0;

  const breakdown = buildOrderPricing({
    subtotal: input.subtotal,
    discount: input.discount,
    tip: input.tip,
    distanceKm,
    distanceKmRaw,
    rules,
    tier: ctx.tier,
    merchantCommissionRateOverride: ctx.merchantCommissionRateOverride,
    serviceFeeOverride: ctx.serviceFeeOverride,
    customerOrderCount,
    freeDelivery: input.freeDelivery,
    paymentMethod: input.paymentMethod,
    serviceFeeWaived: input.serviceFeeWaived,
    taxRatePercent: gct.ratePercent,
    platformTaxRatePercent: gct.platformRatePercent,
    platformGctEnabled: gct.gctEnabled,
    zoneSurchargeJmd,
  });

  return {
    ...breakdown,
    taxRatePercent: gct.ratePercent,
    platformTaxRatePercent: gct.platformRatePercent,
    gctRegistered: gct.gctRegistered,
    pricingProfileVersion: version,
    marketId,
    rules,
    pricingV2Enabled: true,
    resolvedMarketId,
    covered,
    coverage,
    marketOverrideApplied,
  };
}

/** Check if Model B pricing is enabled for a market (after Default→Parish→Town merge). */
export async function isPricingV2EnabledForMarket(
  sb: ServiceSb,
  marketId: string | null,
): Promise<boolean> {
  if (!marketId) return false;
  const layered = await resolvePricingLayers(sb, { marketId });
  return layered.rules.pricingV2Enabled === true;
}
