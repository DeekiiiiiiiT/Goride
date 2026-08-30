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
  resolveRushPassFreeDelivery,
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
import { loadActiveRushPassMembership } from "./rushPassMembership.ts";
import { loadRushPassSubsidyUsed } from "../_shared/rushPassSubsidyUsed.ts";

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
  /** Admin simulator: force Rush Pass benefits without a real membership */
  simulateRushPass?: boolean;
  /** Admin simulator: force road distance km */
  distanceKmOverride?: number | null;
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
      "slug, name, commission_rate, search_boost, default_delivery_radius_km, promo_eligible, auto_ads",
    )
    .eq("id", String(tierId).trim())
    .maybeSingle();
  if (!tierRow) return null;
  const t = tierRow as Record<string, unknown>;
  const commissionRate = Number(t.commission_rate);
  if (!Number.isFinite(commissionRate)) {
    console.error("[pricingResolver] tier missing commission_rate:", tierId);
    return null;
  }
  return {
    slug: String(t.slug),
    name: String(t.name),
    commissionRate,
    searchBoost: t.search_boost != null ? Number(t.search_boost) : undefined,
    defaultDeliveryRadiusKm: t.default_delivery_radius_km != null
      ? Number(t.default_delivery_radius_km)
      : undefined,
    promoEligible: t.promo_eligible != null ? Boolean(t.promo_eligible) : undefined,
    autoAds: t.auto_ads != null ? Boolean(t.auto_ads) : undefined,
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
  if (!tier) {
    return {
      found: false,
      lat: asCoord(base.lat),
      lng: asCoord(base.lng),
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
      error: tierId
        ? "Merchant pricing tier missing or invalid"
        : "Merchant has no pricing_tier_id — assign a merchant tier",
    };
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
    if (!ctx.tier) {
      console.error("[pricingResolver] uncovered quote missing tier");
      return null;
    }
    const gctConfig = await loadGlobalGctConfig(sb as Parameters<typeof loadGlobalGctConfig>[0]);
    return {
      ...buildOrderPricing({
        subtotal: input.subtotal,
        discount: input.discount,
        tip: input.tip,
        distanceKm: null,
        rules: parsePricingRules(null),
        tier: ctx.tier,
        paymentMethod: input.paymentMethod,
        taxRatePercent: gctConfig.ratePercent,
        platformTaxRatePercent: effectivePlatformGctRatePercent(gctConfig),
      }),
      pricingProfileVersion: 0,
      marketId: null,
      rules: parsePricingRules(null),
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
  if (
    input.distanceKmOverride != null &&
    Number.isFinite(Number(input.distanceKmOverride)) &&
    Number(input.distanceKmOverride) >= 0
  ) {
    distanceKm = roundDistanceKm(Number(input.distanceKmOverride));
    distanceKmRaw = distanceKm;
  } else if (dropLat != null && dropLng != null && ctx.lat != null && ctx.lng != null) {
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

  // Phase 3 Rush Pass — fee cut always when eligible; free delivery only within caps
  let freeDelivery = input.freeDelivery === true;
  let serviceFeeMultiplier: number | undefined;
  let rushPassApplied = false;
  let rushPassMembershipId: string | null = null;
  let rushPassFreeDeliveryDeniedReason: "distance" | "budget" | null = null;
  let rushPassSubsidyBudgetJmd: number | undefined;
  let rushPassSubsidyUsedJmd: number | undefined;
  let rushPassSubsidyRemainingJmd: number | undefined;

  const passDefaults = rules.rushPass ?? {
    maxFreeDeliveryKm: 8,
    monthlySubsidyBudgetJmd: 1500,
  };

  if (input.simulateRushPass === true && ctx.tier) {
    const eligible = ["growth", "dominant"];
    if (eligible.includes(String(ctx.tier.slug).toLowerCase())) {
      rushPassApplied = true;
      serviceFeeMultiplier = 0.5;
      const maxKm = passDefaults.maxFreeDeliveryKm;
      const budget = passDefaults.monthlySubsidyBudgetJmd;
      rushPassSubsidyBudgetJmd = budget;
      rushPassSubsidyUsedJmd = 0;
      const fd = resolveRushPassFreeDelivery({
        planAllowsFreeDelivery: true,
        distanceKm,
        maxFreeDeliveryKm: maxKm,
        subsidyUsedJmd: 0,
        monthlyBudgetJmd: budget,
      });
      rushPassSubsidyRemainingJmd = fd.remainingBudgetJmd;
      if (fd.apply) {
        freeDelivery = true;
      } else if (fd.reason === "distance" || fd.reason === "budget") {
        rushPassFreeDeliveryDeniedReason = fd.reason;
      }
    }
  } else if (input.customerId && ctx.tier) {
    try {
      const pass = await loadActiveRushPassMembership(
        sb as Parameters<typeof loadActiveRushPassMembership>[0],
        String(input.customerId),
      );
      if (pass) {
        const eligible = Array.isArray(pass.plan.eligible_tier_slugs)
          ? (pass.plan.eligible_tier_slugs as string[]).map((s) => String(s).toLowerCase())
          : ["growth", "dominant"];
        if (eligible.includes(String(ctx.tier.slug).toLowerCase())) {
          rushPassApplied = true;
          rushPassMembershipId = String(pass.membership.id);
          const mult = Number(pass.plan.service_fee_multiplier);
          if (Number.isFinite(mult)) serviceFeeMultiplier = mult;

          const maxKm = Number(
            pass.plan.max_free_delivery_km ?? passDefaults.maxFreeDeliveryKm,
          );
          const budget = Number(
            pass.plan.monthly_subsidy_budget_jmd ??
              pass.plan.price_jmd ??
              passDefaults.monthlySubsidyBudgetJmd,
          );
          const periodStart = String(pass.membership.current_period_start ?? "");
          const spend = await loadRushPassSubsidyUsed(
            sb,
            rushPassMembershipId,
            periodStart,
          );
          rushPassSubsidyBudgetJmd = budget;
          // Fail closed: cannot load spend ⇒ treat budget as exhausted (deny free delivery)
          const usedForGate = spend.ok ? spend.usedJmd : budget;
          rushPassSubsidyUsedJmd = usedForGate;
          if (!spend.ok) {
            console.error(
              "[pricingResolver] rush pass subsidy load failed — denying free delivery",
              spend.error,
            );
          }
          const fd = resolveRushPassFreeDelivery({
            planAllowsFreeDelivery: pass.plan.free_delivery !== false,
            distanceKm,
            maxFreeDeliveryKm: maxKm,
            subsidyUsedJmd: usedForGate,
            monthlyBudgetJmd: budget,
          });
          rushPassSubsidyRemainingJmd = fd.remainingBudgetJmd;
          if (fd.apply) {
            freeDelivery = true;
          } else if (fd.reason === "distance" || fd.reason === "budget") {
            rushPassFreeDeliveryDeniedReason = fd.reason;
          }
        }
      }
    } catch (e) {
      console.error("[pricingResolver] rush pass load failed:", e);
    }
  }

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
    freeDelivery,
    paymentMethod: input.paymentMethod,
    serviceFeeWaived: input.serviceFeeWaived,
    serviceFeeMultiplier,
    rushPassApplied,
    rushPassMembershipId,
    rushPassFreeDeliveryDeniedReason,
    rushPassSubsidyBudgetJmd,
    rushPassSubsidyUsedJmd,
    rushPassSubsidyRemainingJmd,
    taxRatePercent: gct.ratePercent,
    platformTaxRatePercent: gct.platformRatePercent,
    platformGctEnabled: gct.gctEnabled,
    zoneSurchargeJmd,
  });

  // Reject quote that would overspend remaining Pass budget on this order's subsidy
  if (
    rushPassApplied &&
    breakdown.freeDeliveryApplied &&
    rushPassSubsidyRemainingJmd != null &&
    (breakdown.platformDeliverySubsidyJmd ?? 0) > rushPassSubsidyRemainingJmd + 0.01
  ) {
    const recalced = buildOrderPricing({
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
      freeDelivery: false,
      paymentMethod: input.paymentMethod,
      serviceFeeWaived: input.serviceFeeWaived,
      serviceFeeMultiplier,
      rushPassApplied,
      rushPassMembershipId,
      rushPassFreeDeliveryDeniedReason: "budget",
      rushPassSubsidyBudgetJmd,
      rushPassSubsidyUsedJmd,
      rushPassSubsidyRemainingJmd: 0,
      taxRatePercent: gct.ratePercent,
      platformTaxRatePercent: gct.platformRatePercent,
      platformGctEnabled: gct.gctEnabled,
      zoneSurchargeJmd,
    });
    return {
      ...recalced,
      taxRatePercent: gct.ratePercent,
      platformTaxRatePercent: gct.platformRatePercent,
      gctRegistered: gct.gctRegistered,
      pricingProfileVersion: version,
      marketId,
      rules,
      resolvedMarketId,
      covered,
      coverage,
      marketOverrideApplied,
    };
  }

  return {
    ...breakdown,
    taxRatePercent: gct.ratePercent,
    platformTaxRatePercent: gct.platformRatePercent,
    gctRegistered: gct.gctRegistered,
    pricingProfileVersion: version,
    marketId,
    rules,
    resolvedMarketId,
    covered,
    coverage,
    marketOverrideApplied,
  };
}
