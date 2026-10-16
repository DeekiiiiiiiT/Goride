/**
 * Merchant commission for display / legacy fee fields.
 * Source of truth: Pricing → merchant_tiers (+ optional merchant.commission_rate override).
 * KV platformFeeRate is no longer used (conflicts with tier commission).
 */

import { resolveMerchantCommissionRate } from "../_shared/dashPricing.ts";

export const DASH_PLATFORM_FEE_FALLBACK = 0.20;
export const DASH_PLATFORM_SETTINGS_KV_KEY = "platform:settings:dash";

export function isValidFeeRate(rate: unknown): rate is number {
  if (rate == null || typeof rate === "boolean" || (typeof rate === "string" && rate.trim() === "")) {
    return false;
  }
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/** @deprecated Prefer resolveFeeRateForMerchant (tier-based). Kept for tests. */
export function resolveDashPlatformFeeRate(
  merchantRate: number | null | undefined,
  globalRate: number | null | undefined,
): number {
  if (isValidFeeRate(merchantRate)) return Number(merchantRate);
  if (isValidFeeRate(globalRate)) return Number(globalRate);
  return DASH_PLATFORM_FEE_FALLBACK;
}

export function feeRateToPercent(rate: number): number {
  return Math.round(rate * 10000) / 100;
}

export function percentToFeeRate(percent: number): number {
  return Math.round(percent * 100) / 10000;
}

/** Always null — global KV fee retired in favour of Pricing tiers. */
export async function loadDashGlobalPlatformFeeRate(
  // deno-lint-ignore no-explicit-any
  _sb: { schema: (s: string) => { from: (t: string) => any }; from: (t: string) => any },
): Promise<number | null> {
  return null;
}

export async function resolveFeeRateForMerchant(
  // deno-lint-ignore no-explicit-any
  sb: { from: (t: string) => any },
  merchantId: string,
): Promise<{ rate: number; merchantOverride: number | null; globalRate: number | null; tierRate: number | null }> {
  const { data: merchant } = await sb
    .from("merchants")
    .select("commission_rate, pricing_tier_id, pricing_tier:merchant_tiers(commission_rate)")
    .eq("id", merchantId)
    .maybeSingle();

  const merchantOverride = merchant?.commission_rate != null && isValidFeeRate(merchant.commission_rate)
    ? Number(merchant.commission_rate)
    : null;

  const tierRow = merchant?.pricing_tier as { commission_rate?: number } | null | undefined;
  const tierRate = tierRow?.commission_rate != null && isValidFeeRate(tierRow.commission_rate)
    ? Number(tierRow.commission_rate)
    : null;

  const rate = resolveMerchantCommissionRate(
    tierRate != null
      ? { slug: "tier", name: "Tier", commissionRate: tierRate }
      : null,
    merchantOverride,
  );

  return {
    rate,
    merchantOverride,
    globalRate: null,
    tierRate,
  };
}
