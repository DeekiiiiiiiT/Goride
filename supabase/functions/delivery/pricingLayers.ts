/**
 * Load and merge pricing layers: Default → Parish → Town.
 */
import {
  mergePricingRuleLayers,
  parsePricingRules,
  type PricingRules,
} from "../_shared/dashPricing.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export type PricingLayerSource = {
  scope: "global" | "parish" | "market";
  id: string | null;
  version: number;
  hasOverride: boolean;
  /** Soft on/off — false means layer exists but is skipped in merge. */
  overrideEnabled: boolean;
};

export type ResolvedPricingLayers = {
  rules: PricingRules;
  /** Highest town version when present, else parish, else global. */
  version: number;
  layers: {
    global: PricingLayerSource | null;
    parish: PricingLayerSource | null;
    market: PricingLayerSource | null;
  };
  parishId: string | null;
  raw: {
    global: Record<string, unknown> | null;
    parish: Record<string, unknown> | null;
    market: Record<string, unknown> | null;
    merged: Record<string, unknown>;
  };
};

async function loadGlobalRaw(
  sb: ServiceSb,
): Promise<{ id: string; version: number; rules: Record<string, unknown> } | null> {
  const { data } = await sb
    .from("global_pricing_profiles")
    .select("id, version, rules")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    version: Number(data.version ?? 1),
    rules: (data.rules ?? {}) as Record<string, unknown>,
  };
}

async function loadParishRaw(
  sb: ServiceSb,
  parishId: string,
): Promise<
  | {
    id: string;
    version: number;
    rules: Record<string, unknown>;
    overrideEnabled: boolean;
  }
  | null
> {
  const { data } = await sb
    .from("parish_pricing_profiles")
    .select("id, version, rules, override_enabled")
    .eq("parish_id", parishId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    version: Number(data.version ?? 1),
    rules: (data.rules ?? {}) as Record<string, unknown>,
    overrideEnabled: data.override_enabled !== false,
  };
}

async function loadMarketRaw(
  sb: ServiceSb,
  marketId: string,
): Promise<
  | {
    id: string;
    version: number;
    rules: Record<string, unknown>;
    overrideEnabled: boolean;
  }
  | null
> {
  const { data } = await sb
    .from("market_pricing_profiles")
    .select("id, version, rules, override_enabled")
    .eq("market_id", marketId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    version: Number(data.version ?? 1),
    rules: (data.rules ?? {}) as Record<string, unknown>,
    overrideEnabled: data.override_enabled !== false,
  };
}

export async function resolveParishIdForMarket(
  sb: ServiceSb,
  marketId: string | null | undefined,
): Promise<string | null> {
  if (!marketId) return null;
  const { data } = await sb
    .from("service_markets")
    .select("parish_id")
    .eq("id", marketId)
    .maybeSingle();
  return data?.parish_id != null ? String(data.parish_id) : null;
}

/** Resolve effective rules for a market (or defaults only when marketId is null). */
export async function resolvePricingLayers(
  sb: ServiceSb,
  opts: { marketId?: string | null; parishId?: string | null } = {},
): Promise<ResolvedPricingLayers> {
  const marketId = opts.marketId ? String(opts.marketId) : null;
  const parishId = opts.parishId
    ? String(opts.parishId)
    : await resolveParishIdForMarket(sb, marketId);

  const [globalRow, parishRow, marketRow] = await Promise.all([
    loadGlobalRaw(sb),
    parishId ? loadParishRaw(sb, parishId) : Promise.resolve(null),
    marketId ? loadMarketRaw(sb, marketId) : Promise.resolve(null),
  ]);

  const merged = mergePricingRuleLayers(
    globalRow?.rules ?? null,
    parishRow?.overrideEnabled ? parishRow.rules : null,
    marketRow?.overrideEnabled ? marketRow.rules : null,
  );
  const rules = parsePricingRules(
    Object.keys(merged).length > 0 ? merged : null,
  );

  const version = marketRow?.version ?? parishRow?.version ?? globalRow?.version ?? 1;

  return {
    rules,
    version,
    parishId,
    layers: {
      global: globalRow
        ? {
          scope: "global",
          id: globalRow.id,
          version: globalRow.version,
          hasOverride: true,
          overrideEnabled: true,
        }
        : null,
      parish: {
        scope: "parish",
        id: parishRow?.id ?? null,
        version: parishRow?.version ?? 0,
        hasOverride: Boolean(parishRow),
        overrideEnabled: parishRow?.overrideEnabled ?? false,
      },
      market: {
        scope: "market",
        id: marketRow?.id ?? null,
        version: marketRow?.version ?? 0,
        hasOverride: Boolean(marketRow),
        overrideEnabled: marketRow?.overrideEnabled ?? false,
      },
    },
    raw: {
      global: globalRow?.rules ?? null,
      parish: parishRow?.overrideEnabled ? parishRow.rules : null,
      market: marketRow?.overrideEnabled ? marketRow.rules : null,
      merged,
    },
  };
}
