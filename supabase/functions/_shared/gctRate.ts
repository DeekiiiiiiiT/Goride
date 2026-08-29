/**
 * Jamaica GCT rate resolution — Accounting `gct_rates` is the sole live source.
 * Legacy Global Settings / KV tax is not used for charging.
 */

import {
  resolveRatePercentAsOf,
  type GctRateRow,
  SEED_STANDARD_RATE_PERCENT,
} from './gctCore.ts';

/** Last-resort only when DB unavailable — seeded statutory rate. */
export const GCT_STANDARD_RATE_FALLBACK = SEED_STANDARD_RATE_PERCENT;

export type GctConfig = {
  ratePercent: number;
  enabled: boolean;
  /** True when rate came from accounting.gct_rates */
  fromDb?: boolean;
};

export function isValidGctRate(rate: unknown): rate is number {
  if (rate == null || typeof rate === 'boolean') return false;
  if (typeof rate === 'string' && rate.trim() === '') return false;
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

type Sb = {
  schema?: (s: string) => { from: (t: string) => any };
  from: (t: string) => any;
};

/**
 * GCT tables live in accounting.*; public.* views mirror them for PostgREST
 * until `accounting` is on the project's Exposed schemas list.
 */
function gctClient(sb: Sb) {
  return sb;
}

async function loadResolverFlags(sb: Sb): Promise<{
  preferDb: boolean;
  gctEnabled: boolean;
}> {
  try {
    const { data, error } = await gctClient(sb)
      .from('gct_engine_flags')
      .select('value')
      .eq('key', 'resolver')
      .maybeSingle();
    if (error || !data) {
      return { preferDb: true, gctEnabled: true };
    }
    const v = (data as { value?: Record<string, unknown> }).value ?? {};
    return {
      preferDb: v.prefer_db !== false,
      gctEnabled: v.gct_enabled !== false,
    };
  } catch {
    return { preferDb: true, gctEnabled: true };
  }
}

async function loadStandardRateFromDb(sb: Sb, asOf = new Date()): Promise<number | null> {
  try {
    const { data, error } = await gctClient(sb)
      .from('gct_rates')
      .select('supply_class, rate_percent, effective_from, effective_to')
      .eq('supply_class', 'standard');
    if (error || !data?.length) return null;
    const rows: GctRateRow[] = (data as Array<{
      supply_class: string;
      rate_percent: number;
      effective_from: string;
      effective_to: string | null;
    }>).map((r) => ({
      supplyClass: r.supply_class as GctRateRow['supplyClass'],
      ratePercent: Number(r.rate_percent),
      effectiveFrom: String(r.effective_from).slice(0, 10),
      effectiveTo: r.effective_to ? String(r.effective_to).slice(0, 10) : null,
    }));
    return resolveRatePercentAsOf(rows, 'standard', asOf);
  } catch {
    return null;
  }
}

/** Load GCT config from Accounting engine only. */
export async function loadGlobalGctConfig(sb: Sb): Promise<GctConfig> {
  const flags = await loadResolverFlags(sb);
  const dbRate = flags.preferDb ? await loadStandardRateFromDb(sb) : null;

  if (dbRate != null) {
    return {
      ratePercent: dbRate,
      enabled: flags.gctEnabled,
      fromDb: true,
    };
  }

  console.warn(
    JSON.stringify({
      event: 'gct_rate_db_unavailable',
      fallbackPercent: GCT_STANDARD_RATE_FALLBACK,
    }),
  );

  return {
    ratePercent: GCT_STANDARD_RATE_FALLBACK,
    enabled: flags.gctEnabled,
    fromDb: false,
  };
}

/** Food-portion GCT for delivery orders — zero when unregistered or globally disabled. */
export function effectiveFoodGctRatePercent(
  config: GctConfig,
  gctRegistered: boolean,
  posTaxRatePercent?: number | null,
): number {
  if (!config.enabled || !gctRegistered) return 0;
  if (
    posTaxRatePercent != null &&
    isValidGctRate(posTaxRatePercent) &&
    Number(posTaxRatePercent) > 0
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
  sb: Sb,
  merchantId: string,
): Promise<MerchantGctResolution> {
  const [config, merchantResult] = await Promise.all([
    loadGlobalGctConfig(sb),
    sb
      .from('merchants')
      .select('gct_registered, pos_tax_rate_percent')
      .eq('id', merchantId)
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

/** Platform GCT rate — Roam service fee + delivery platform share. */
export function effectivePlatformGctRatePercent(config: GctConfig): number {
  if (!config.enabled) return 0;
  return config.ratePercent;
}

/** Resolve food + platform GCT rates for Model B pricing. */
export async function resolveOrderGctRates(
  sb: Sb,
  merchantId: string,
): Promise<MerchantGctResolution & { platformRatePercent: number }> {
  const food = await resolveMerchantFoodGctRate(sb, merchantId);
  const platformRatePercent = food.gctEnabled
    ? effectivePlatformGctRatePercent({ ratePercent: food.globalRatePercent, enabled: true })
    : 0;
  return { ...food, platformRatePercent };
}

/** POS in-store rate — uses merchant pos_tax_rate_percent when set, else global. */
export async function resolvePosGctRate(
  sb: Sb,
  merchant: {
    gct_registered?: boolean;
    pos_tax_rate_percent?: number | null;
  },
): Promise<number> {
  const config = await loadGlobalGctConfig(sb);
  const gctRegistered = Boolean(merchant.gct_registered);
  return effectiveFoodGctRatePercent(config, gctRegistered, merchant.pos_tax_rate_percent);
}
