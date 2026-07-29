/**
 * Dash platform fee rate resolution.
 * Merchant override (commission_rate) → global platformFeeRate → 0.05
 */

export const DASH_PLATFORM_FEE_FALLBACK = 0.05;
export const DASH_PLATFORM_SETTINGS_KV_KEY = "platform:settings:dash";

export function isValidFeeRate(rate: unknown): rate is number {
  if (rate == null || typeof rate === "boolean" || (typeof rate === "string" && rate.trim() === "")) {
    return false;
  }
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

/** First valid rate among merchant → global → fallback. */
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

/** Load global platformFeeRate from platform settings KV (service role). */
export async function loadDashGlobalPlatformFeeRate(
  // deno-lint-ignore no-explicit-any
  sb: { schema: (s: string) => { from: (t: string) => any }; from: (t: string) => any },
): Promise<number | null> {
  // KV lives in public schema; delivery service client is schema-scoped to delivery
  const client = typeof sb.schema === "function" ? sb.schema("public") : sb;
  const { data, error } = await client
    .from("kv_store_37f42386")
    .select("value")
    .eq("key", DASH_PLATFORM_SETTINGS_KV_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { value?: Record<string, unknown> }).value;
  if (!value || typeof value !== "object") return null;
  const rate = value.platformFeeRate;
  return isValidFeeRate(rate) ? Number(rate) : null;
}

export async function resolveFeeRateForMerchant(
  // deno-lint-ignore no-explicit-any
  sb: { from: (t: string) => any },
  merchantId: string,
): Promise<{ rate: number; merchantOverride: number | null; globalRate: number | null }> {
  const [{ data: merchant }, globalRate] = await Promise.all([
    sb.from("merchants").select("commission_rate").eq("id", merchantId).maybeSingle(),
    loadDashGlobalPlatformFeeRate(sb),
  ]);
  const merchantOverride = merchant?.commission_rate != null && isValidFeeRate(merchant.commission_rate)
    ? Number(merchant.commission_rate)
    : null;
  return {
    rate: resolveDashPlatformFeeRate(merchantOverride, globalRate),
    merchantOverride,
    globalRate,
  };
}
