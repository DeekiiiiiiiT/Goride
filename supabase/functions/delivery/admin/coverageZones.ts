/**
 * Shared published-zone loading for coverage checks (orders, pricing, admin test pin).
 */
import {
  evaluateCoverage,
  type CoverageEvalResult,
  type CoverageVertex,
  type CoverageZone,
} from "./coverageEval.ts";
import { normalizeKind } from "./coveragePlatform.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export async function loadPublishedZonesForMarket(
  sb: ServiceSb,
  market: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const pubId = market.published_version_id != null ? String(market.published_version_id) : null;
  if (pubId) {
    const { data: ver } = await sb
      .from("service_coverage_versions")
      .select("zones_json")
      .eq("id", pubId)
      .maybeSingle();
    if (ver && Array.isArray(ver.zones_json)) {
      return (ver.zones_json as Record<string, unknown>[]).map((z) => ({
        ...z,
        market_id: z.market_id ?? market.id,
      }));
    }
  }
  const { data: zones } = await sb
    .from("service_zone_polygons")
    .select("*")
    .eq("market_id", String(market.id))
    .order("priority", { ascending: false });
  return (zones ?? []) as Record<string, unknown>[];
}

export function asCoverageZones(rows: Record<string, unknown>[]): CoverageZone[] {
  return rows.map((z) => ({
    id: String(z.id),
    name: String(z.name ?? ""),
    market_id: z.market_id != null ? String(z.market_id) : undefined,
    kind: normalizeKind(z.kind),
    polygon: Array.isArray(z.polygon) ? (z.polygon as CoverageVertex[]) : [],
  }));
}

export type MarketPointResolve = {
  covered: boolean;
  marketId: string | null;
  zones: CoverageZone[];
  eval: CoverageEvalResult;
};

/** Resolve active published coverage for a lat/lng. No soft-launch fallback. */
export async function resolveMarketForPoint(
  sb: ServiceSb,
  lat: number,
  lng: number,
): Promise<MarketPointResolve> {
  const emptyEval = evaluateCoverage(lat, lng, []);
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, published_version_id, is_active")
    .eq("is_active", true);

  if (!markets?.length) {
    return { covered: false, marketId: null, zones: [], eval: emptyEval };
  }

  const allZones: CoverageZone[] = [];
  for (const m of markets) {
    const market = m as Record<string, unknown>;
    const published = await loadPublishedZonesForMarket(sb, market);
    allZones.push(
      ...asCoverageZones(published).map((z) => ({
        ...z,
        market_id: z.market_id ?? String(market.id),
      })),
    );
  }

  const evalResult = evaluateCoverage(lat, lng, allZones);
  if (evalResult.inZone && evalResult.matchedInclude?.market_id) {
    return {
      covered: true,
      marketId: evalResult.matchedInclude.market_id,
      zones: allZones,
      eval: evalResult,
    };
  }

  return {
    covered: false,
    marketId: null,
    zones: allZones,
    eval: evalResult,
  };
}

export type SameMarketAssert =
  | { ok: true; marketId: string; eval: CoverageEvalResult }
  | {
    ok: false;
    code: "dropoff_required" | "out_of_coverage" | "merchant_out_of_market";
    error: string;
    eval?: CoverageEvalResult;
  };

/**
 * Same-town rule: dropoff must be in an active published zone M,
 * and merchant.market_id must equal M.
 */
export async function assertSameMarketCoverage(
  sb: ServiceSb,
  opts: {
    dropoffLat: number | null | undefined;
    dropoffLng: number | null | undefined;
    merchantMarketId: string | null | undefined;
  },
): Promise<SameMarketAssert> {
  const lat = opts.dropoffLat != null ? Number(opts.dropoffLat) : NaN;
  const lng = opts.dropoffLng != null ? Number(opts.dropoffLng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return {
      ok: false,
      code: "dropoff_required",
      error: "A delivery pin is required to place this order",
    };
  }

  const resolved = await resolveMarketForPoint(sb, lat, lng);
  if (!resolved.covered || !resolved.marketId) {
    return {
      ok: false,
      code: "out_of_coverage",
      error: "We don’t deliver to this address yet",
      eval: resolved.eval,
    };
  }

  const merchantMarketId = opts.merchantMarketId != null && String(opts.merchantMarketId).trim()
    ? String(opts.merchantMarketId).trim()
    : null;

  if (!merchantMarketId || merchantMarketId !== resolved.marketId) {
    return {
      ok: false,
      code: "merchant_out_of_market",
      error: "This store doesn’t deliver to your area",
      eval: resolved.eval,
    };
  }

  return { ok: true, marketId: resolved.marketId, eval: resolved.eval };
}

/** Suggest market_id from lat/lng across all markets (active or not) for admin assignment. */
export async function suggestMarketIdForMerchantPin(
  sb: ServiceSb,
  lat: number,
  lng: number,
): Promise<string | null> {
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, published_version_id");

  if (!markets?.length) return null;

  const allZones: CoverageZone[] = [];
  for (const m of markets) {
    const market = m as Record<string, unknown>;
    const published = await loadPublishedZonesForMarket(sb, market);
    const zones = asCoverageZones(published).map((z) => ({
      ...z,
      market_id: z.market_id ?? String(market.id),
    }));
    allZones.push(...zones);
  }

  const evalResult = evaluateCoverage(lat, lng, allZones);
  if (evalResult.inZone && evalResult.matchedInclude?.market_id) {
    return evalResult.matchedInclude.market_id;
  }
  return null;
}

export type MerchantMarketRecomputeResult = {
  updated: number;
  cleared: number;
  skippedLocked: number;
  skippedNoPin: number;
  unchanged: number;
};

/**
 * Reassign unlocked merchants from published coverage.
 * Locked rows are never touched.
 */
export async function recomputeUnlockedMerchantMarkets(
  sb: ServiceSb,
): Promise<MerchantMarketRecomputeResult> {
  const result: MerchantMarketRecomputeResult = {
    updated: 0,
    cleared: 0,
    skippedLocked: 0,
    skippedNoPin: 0,
    unchanged: 0,
  };

  const { data: merchants, error } = await sb
    .from("merchants")
    .select("id, lat, lng, market_id, market_id_locked");
  if (error || !merchants?.length) return result;

  for (const row of merchants) {
    const m = row as Record<string, unknown>;
    if (m.market_id_locked === true) {
      result.skippedLocked += 1;
      continue;
    }
    const lat = Number(m.lat);
    const lng = Number(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      result.skippedNoPin += 1;
      continue;
    }

    const suggested = await suggestMarketIdForMerchantPin(sb, lat, lng);
    const current = m.market_id != null ? String(m.market_id) : null;
    if (suggested === current) {
      result.unchanged += 1;
      continue;
    }

    const { error: upErr } = await sb
      .from("merchants")
      .update({ market_id: suggested })
      .eq("id", String(m.id))
      .eq("market_id_locked", false);
    if (upErr) continue;

    if (suggested == null) result.cleared += 1;
    else result.updated += 1;
  }

  return result;
}
