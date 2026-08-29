/**
 * Jamaica GCT rate resolution — dual-read: prefer accounting.gct_rates, fall back to KV.
 * Public API unchanged for Rush callers. Customer cutover: set db_authoritative when accountant signs off.
 */

import {
  resolveRatePercentAsOf,
  type GctRateRow,
  SEED_STANDARD_RATE_PERCENT,
} from './gctCore.ts';

/** Fallback only when both DB and KV unavailable — seeded statutory rate. */
export const GCT_STANDARD_RATE_FALLBACK = SEED_STANDARD_RATE_PERCENT;
export const GLOBAL_SETTINGS_KV_KEY = 'platform:settings:global';

export type GctConfig = {
  ratePercent: number;
  enabled: boolean;
  /** True when rate came from accounting.gct_rates */
  fromDb?: boolean;
  /** True when KV and DB disagreed during dual-read */
  sourceDisagreement?: boolean;
  kvRatePercent?: number | null;
};

export function isValidGctRate(rate: unknown): rate is number {
  if (rate == null || typeof rate === 'boolean') return false;
  if (typeof rate === 'string' && rate.trim() === '') return false;
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
    fromDb: false,
  };
}

type Sb = {
  schema?: (s: string) => { from: (t: string) => any };
  from: (t: string) => any;
};

function publicClient(sb: Sb) {
  return typeof sb.schema === 'function' ? sb.schema('public') : sb;
}

function accountingClient(sb: Sb) {
  if (typeof sb.schema === 'function') return sb.schema('accounting');
  return null;
}

async function loadResolverFlags(sb: Sb): Promise<{
  preferDb: boolean;
  kvFallback: boolean;
  dbAuthoritative: boolean;
}> {
  const acct = accountingClient(sb);
  if (!acct) {
    return { preferDb: true, kvFallback: true, dbAuthoritative: false };
  }
  try {
    const { data, error } = await acct
      .from('gct_engine_flags')
      .select('value')
      .eq('key', 'resolver')
      .maybeSingle();
    if (error || !data) {
      return { preferDb: true, kvFallback: true, dbAuthoritative: false };
    }
    const v = (data as { value?: Record<string, unknown> }).value ?? {};
    return {
      preferDb: v.prefer_db !== false,
      kvFallback: v.kv_fallback !== false,
      dbAuthoritative: v.db_authoritative === true,
    };
  } catch {
    return { preferDb: true, kvFallback: true, dbAuthoritative: false };
  }
}

async function loadStandardRateFromDb(sb: Sb, asOf = new Date()): Promise<number | null> {
  const acct = accountingClient(sb);
  if (!acct) return null;
  try {
    const { data, error } = await acct
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

async function loadKvGctConfig(sb: Sb): Promise<GctConfig> {
  const client = publicClient(sb);
  const { data, error } = await client
    .from('kv_store_37f42386')
    .select('value')
    .eq('key', GLOBAL_SETTINGS_KV_KEY)
    .maybeSingle();
  if (error || !data) {
    return { ratePercent: GCT_STANDARD_RATE_FALLBACK, enabled: true, fromDb: false };
  }
  const value = (data as { value?: Record<string, unknown> }).value;
  if (!value || typeof value !== 'object') {
    return { ratePercent: GCT_STANDARD_RATE_FALLBACK, enabled: true, fromDb: false };
  }
  return parseGctConfigFromSettings(value);
}

/** Load GCT config — prefer DB rate, dual-read KV until db_authoritative. */
export async function loadGlobalGctConfig(sb: Sb): Promise<GctConfig> {
  const flags = await loadResolverFlags(sb);
  const [dbRate, kvConfig] = await Promise.all([
    flags.preferDb ? loadStandardRateFromDb(sb) : Promise.resolve(null),
    flags.kvFallback || !flags.dbAuthoritative
      ? loadKvGctConfig(sb)
      : Promise.resolve(null as GctConfig | null),
  ]);

  const kv = kvConfig ?? { ratePercent: GCT_STANDARD_RATE_FALLBACK, enabled: true, fromDb: false };
  const disagreement =
    dbRate != null &&
    Math.abs(dbRate - kv.ratePercent) > 0.001;

  if (disagreement) {
    console.warn(
      JSON.stringify({
        event: 'gct_rate_source_disagreement',
        dbRatePercent: dbRate,
        kvRatePercent: kv.ratePercent,
        dbAuthoritative: flags.dbAuthoritative,
      }),
    );
  }

  if (flags.dbAuthoritative && dbRate != null) {
    return {
      ratePercent: dbRate,
      enabled: kv.enabled,
      fromDb: true,
      sourceDisagreement: disagreement,
      kvRatePercent: kv.ratePercent,
    };
  }

  if (dbRate != null && flags.preferDb) {
    // Dual-read window: prefer DB for health, but keep charging KV until cutover
    // so customer prices stay unchanged until accountant sign-off.
    return {
      ratePercent: kv.ratePercent,
      enabled: kv.enabled,
      fromDb: false,
      sourceDisagreement: disagreement,
      kvRatePercent: kv.ratePercent,
    };
  }

  return {
    ...kv,
    fromDb: false,
    sourceDisagreement: disagreement,
    kvRatePercent: kv.ratePercent,
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
  // Callers pass delivery-scoped or public-view clients; keep merchants read as before.
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
