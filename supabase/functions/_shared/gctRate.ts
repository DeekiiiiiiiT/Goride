/**
 * Jamaica GCT rate resolution — reads Dominion Global Settings KV.
 * Keep defaults in sync with @roam/platform-settings DEFAULT_GLOBAL_SETTINGS.tax
 */

export const GCT_STANDARD_RATE_FALLBACK = 16.5;
export const GLOBAL_SETTINGS_KV_KEY = "platform:settings:global";

export type GctConfig = {
  ratePercent: number;
  enabled: boolean;
};

export function isValidGctRate(rate: unknown): rate is number {
  if (rate == null || typeof rate === "boolean") return false;
  if (typeof rate === "string" && rate.trim() === "") return false;
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export function parseGctConfigFromSettings(
  value: Record<string, unknown> | null | undefined,
): GctConfig {
  const tax = value?.tax as Record<string, unknown> | undefined;
  const rateRaw = tax?.gctStandardRatePercent;
  const enabledRaw = tax?.gctEnabled;
  return {
    ratePercent: isValidGctRate(rateRaw) ? Number(rateRaw) : GCT_STANDARD_RATE_FALLBACK,
    enabled: enabledRaw === false ? false : true,
  };
}

/** Load GCT config from platform:settings:global KV (service role). */
export async function loadGlobalGctConfig(
  // deno-lint-ignore no-explicit-any
  sb: { schema: (s: string) => { from: (t: string) => any }; from: (t: string) => any },
): Promise<GctConfig> {
  const client = typeof sb.schema === "function" ? sb.schema("public") : sb;
  const { data, error } = await client
    .from("kv_store_37f42386")
    .select("value")
    .eq("key", GLOBAL_SETTINGS_KV_KEY)
    .maybeSingle();
  if (error || !data) {
    return { ratePercent: GCT_STANDARD_RATE_FALLBACK, enabled: true };
  }
  const value = (data as { value?: Record<string, unknown> }).value;
  if (!value || typeof value !== "object") {
    return { ratePercent: GCT_STANDARD_RATE_FALLBACK, enabled: true };
  }
  return parseGctConfigFromSettings(value);
}

/** Food-portion GCT for delivery orders — zero when unregistered or globally disabled. */
export function effectiveFoodGctRatePercent(
  config: GctConfig,
  gctRegistered: boolean,
  posTaxRatePercent?: number | null,
): number {
  if (!config.enabled || !gctRegistered) return 0;
  if (
    posTaxRatePercent != null
    && isValidGctRate(posTaxRatePercent)
    && Number(posTaxRatePercent) > 0
  ) {
    return Number(posTaxRatePercent);
  }
  return config.ratePercent;
}

export type MerchantGctResolution = {
  ratePercent: number;
  gctRegistered: boolean;
  globalRatePercent: number;
  gctEnabled: boolean;
};

/** Resolve delivery/app food GCT for a merchant. */
export async function resolveMerchantFoodGctRate(
  // deno-lint-ignore no-explicit-any
  sb: { schema?: (s: string) => { from: (t: string) => any }; from: (t: string) => any },
  merchantId: string,
): Promise<MerchantGctResolution> {
  const [config, merchantResult] = await Promise.all([
    loadGlobalGctConfig(sb),
    sb.from("merchants")
      .select("gct_registered, pos_tax_rate_percent")
      .eq("id", merchantId)
      .maybeSingle(),
  ]);
  const merchant = merchantResult.data as {
    gct_registered?: boolean;
    pos_tax_rate_percent?: number | null;
  } | null;
  const gctRegistered = Boolean(merchant?.gct_registered);
  const ratePercent = effectiveFoodGctRatePercent(
    config,
    gctRegistered,
    merchant?.pos_tax_rate_percent,
  );
  return {
    ratePercent,
    gctRegistered,
    globalRatePercent: config.ratePercent,
    gctEnabled: config.enabled,
  };
}

/** POS in-store rate — uses merchant pos_tax_rate_percent when set, else global. */
export async function resolvePosGctRate(
  // deno-lint-ignore no-explicit-any
  sb: { schema?: (s: string) => { from: (t: string) => any }; from: (t: string) => any },
  merchant: {
    gct_registered?: boolean;
    pos_tax_rate_percent?: number | null;
  },
): Promise<number> {
  const config = await loadGlobalGctConfig(sb);
  const gctRegistered = Boolean(merchant.gct_registered);
  return effectiveFoodGctRatePercent(
    config,
    gctRegistered,
    merchant.pos_tax_rate_percent,
  );
}
