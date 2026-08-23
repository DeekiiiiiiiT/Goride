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
  type PricingBreakdown,
  type PricingRules,
} from "../_shared/dashPricing.ts";
import { evaluateCoverage, type CoverageZone } from "./admin/coverageEval.ts";

export type PricingResolverInput = {
  merchantId: string;
  subtotal: number;
  discount?: number;
  tip?: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  customerId?: string | null;
  freeDelivery?: boolean;
};

export type ResolvedPricing = PricingBreakdown & {
  pricingProfileVersion: number;
  marketId: string | null;
  rules: PricingRules;
  pricingV2Enabled: boolean;
};

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

function asCoord(v: unknown): number | null {
  if (v == null) return null;
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
  lat: number | null;
  lng: number | null;
  tier: MerchantTier | null;
  merchantCommissionRateOverride: number | null;
  serviceFeeOverride: ReturnType<typeof parseServiceFeeOverride>;
}> {
  const { data: merchant } = await sb
    .from("merchants")
    .select(`
      lat, lng,
      merchant_commission_rate,
      service_fee_override,
      pricing_tier_id,
      tier:merchant_tiers(slug, name, commission_rate)
    `)
    .eq("id", merchantId)
    .maybeSingle();

  if (!merchant) {
    return {
      lat: null,
      lng: null,
      tier: null,
      merchantCommissionRateOverride: null,
      serviceFeeOverride: null,
    };
  }

  const row = merchant as Record<string, unknown>;
  const tierRow = row.tier as Record<string, unknown> | null;
  const tier: MerchantTier | null = tierRow
    ? {
        slug: String(tierRow.slug),
        name: String(tierRow.name),
        commissionRate: Number(tierRow.commission_rate),
      }
    : null;

  return {
    lat: asCoord(row.lat),
    lng: asCoord(row.lng),
    tier,
    merchantCommissionRateOverride: row.merchant_commission_rate != null
      ? Number(row.merchant_commission_rate)
      : null,
    serviceFeeOverride: parseServiceFeeOverride(
      row.service_fee_override as Record<string, unknown> | null,
    ),
  };
}

/** Resolve full pricing for a merchant order quote or placement. */
export async function resolveDashOrderPricing(
  sb: ServiceSb,
  input: PricingResolverInput,
): Promise<ResolvedPricing | null> {
  const ctx = await loadMerchantPricingContext(sb, input.merchantId);
  if (ctx.lat == null || ctx.lng == null) return null;

  const dropLat = asCoord(input.dropoffLat);
  const dropLng = asCoord(input.dropoffLng);

  let marketId: string | null = null;
  let rules = parsePricingRules(null);
  let version = 1;

  if (dropLat != null && dropLng != null) {
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
  });

  return {
    ...breakdown,
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
