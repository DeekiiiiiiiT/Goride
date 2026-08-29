/**
 * Shared published-zone loading for coverage checks (orders, pricing, admin test pin).
 */
import {
  buildParishSyntheticZone,
  COVERAGE_CUSTOMER_COPY,
  evaluateCoverage,
  evaluateHexCoverage,
  evaluateLiveCoverage,
  filterLiveCoverageZones,
  isInsideParishFoundation,
  parseFoundationGeometry,
  parseFoundationPolygon,
  type CoverageEvalResult,
  type CoverageMultiPolygon,
  type CoverageVertex,
  type CoverageZone,
  type ParishCoverageMode,
} from "./coverageEval.ts";
import { normalizeKind } from "./coveragePlatform.ts";
import {
  enrichMarketZonesWithSchedules,
  loadScopedExclusionsForPoint,
} from "../coverageLayers.ts";
import {
  DEFAULT_H3_RESOLUTION,
  isRushHexCoverageEnabled,
  latLngToH3,
} from "../../_shared/h3/geoIndex.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = {
  from: (t: string) => any;
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type MerchantMarketLockSource = "manual" | "pin" | null;

export function resolveMarketLockSource(row: Record<string, unknown>): MerchantMarketLockSource {
  const src = row.market_id_lock_source;
  if (src === "manual" || src === "pin") return src;
  if (row.market_id_locked === true) return "manual";
  return null;
}

export function isMerchantMarketLockedForRecompute(row: Record<string, unknown>): boolean {
  const src = resolveMarketLockSource(row);
  return src === "manual" || src === "pin";
}

export type ParishContext = {
  id: string;
  name: string;
  coverage_mode: ParishCoverageMode;
  foundation_polygon: CoverageVertex[] | null;
  /** Full MultiPolygon parts from foundation_geom (OPEN-11). */
  foundation_multi: CoverageMultiPolygon | null;
  /** When true, prefer PostGIS ST_Covers via point_covers_geom RPC. */
  has_foundation_geom?: boolean;
};

function asCoverageMulti(raw: unknown): CoverageMultiPolygon | null {
  return parseFoundationGeometry(raw);
}

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

/** Attach multiPolygon from live geom when present (OPEN-11). */
export async function enrichZonesWithGeomParts(
  sb: ServiceSb,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const z of rows) {
    if (Array.isArray(z.multiPolygon) && (z.multiPolygon as unknown[]).length > 0) {
      out.push(z);
      continue;
    }
    const id = z.id != null ? String(z.id) : "";
    const hasGeom = z.geom != null;
    if (!hasGeom || !id || id.startsWith("parish-") || typeof sb.rpc !== "function") {
      out.push(z);
      continue;
    }
    const { data, error } = await sb.rpc("zone_geom_parts", { p_zone_id: id });
    if (error || data == null) {
      out.push(z);
      continue;
    }
    const multi = asCoverageMulti(data);
    out.push(multi ? { ...z, multiPolygon: multi } : z);
  }
  return out;
}

export function asCoverageZones(rows: Record<string, unknown>[]): CoverageZone[] {
  return rows.map((z) => {
    const multi =
      asCoverageMulti(z.multiPolygon) ??
      null;
    const polygon = Array.isArray(z.polygon) ? (z.polygon as CoverageVertex[]) : [];
    return {
      id: String(z.id),
      name: String(z.name ?? ""),
      market_id: z.market_id != null ? String(z.market_id) : undefined,
      kind: normalizeKind(z.kind),
      polygon: multi?.[0]?.outer?.length ? multi[0].outer : polygon,
      multiPolygon: multi ?? undefined,
      source: z.source != null ? String(z.source) : "manual",
      priority: z.priority != null ? Number(z.priority) : 0,
      is_active: z.is_active !== false,
      effective_from: z.effective_from != null ? String(z.effective_from) : null,
      effective_to: z.effective_to != null ? String(z.effective_to) : null,
      category: z.category != null ? String(z.category) : null,
      reason: z.reason != null ? String(z.reason) : null,
      schedules: Array.isArray(z.schedules) ? z.schedules as CoverageZone["schedules"] : undefined,
      zone_policy: z.zone_policy && typeof z.zone_policy === "object"
        ? z.zone_policy as CoverageZone["zone_policy"]
        : { action: "block" },
    };
  });
}

async function loadParishMap(sb: ServiceSb): Promise<Map<string, ParishContext>> {
  const { data: parishes } = await sb
    .from("service_parishes")
    .select("id, name, coverage_mode, foundation_polygon, foundation_geom");
  const map = new Map<string, ParishContext>();
  for (const row of parishes ?? []) {
    const p = row as Record<string, unknown>;
    const mode = p.coverage_mode === "parish_boundary" ? "parish_boundary" : "town_zones";
    const id = String(p.id);
    const hasGeom = p.foundation_geom != null;
    let foundation_multi: CoverageMultiPolygon | null = null;
    if (hasGeom && typeof sb.rpc === "function") {
      const { data } = await sb.rpc("parish_foundation_parts", { p_parish_id: id });
      foundation_multi = asCoverageMulti(data);
    }
    const foundation_polygon =
      (foundation_multi?.[0]?.outer?.length ? foundation_multi[0].outer : null) ??
      parseFoundationPolygon(p.foundation_polygon);
    map.set(id, {
      id,
      name: String(p.name ?? "Parish"),
      coverage_mode: mode,
      foundation_polygon,
      foundation_multi,
      has_foundation_geom: hasGeom,
    });
  }
  return map;
}

/** PostGIS PIP when geom present; falls back to JS ray-cast on jsonb ring. */
export async function isInsideParishFoundationResolved(
  sb: ServiceSb,
  lat: number,
  lng: number,
  parish: ParishContext | null | undefined,
): Promise<boolean> {
  if (!parish) return true;
  if (parish.has_foundation_geom) {
    const { data, error } = await sb.rpc("point_in_parish_foundation", {
      p_parish_id: parish.id,
      p_lat: lat,
      p_lng: lng,
    });
    if (!error && typeof data === "boolean") return data;
  }
  return isInsideParishFoundation(lat, lng, parish.foundation_multi ?? parish.foundation_polygon);
}

export async function loadParishCoverageContext(
  sb: ServiceSb,
  parishId: string,
): Promise<ParishContext | null> {
  const map = await loadParishMap(sb);
  return map.get(parishId) ?? null;
}

type ActiveMarketRow = {
  id: string;
  slug: string;
  parish_id: string | null;
  is_active: boolean;
  published_version_id: string | null;
};

async function loadActiveMarkets(sb: ServiceSb): Promise<ActiveMarketRow[]> {
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, slug, parish_id, is_active, published_version_id")
    .eq("is_active", true);
  return ((markets ?? []) as Record<string, unknown>[]).map((m) => {
    const row = m;
    return {
      id: String(row.id),
      slug: String(row.slug ?? row.id),
      parish_id: row.parish_id != null ? String(row.parish_id) : null,
      is_active: row.is_active !== false,
      published_version_id: row.published_version_id != null
        ? String(row.published_version_id)
        : null,
    };
  });
}

async function buildCoverageZonesForMarkets(
  sb: ServiceSb,
  markets: ActiveMarketRow[],
  parishMap: Map<string, ParishContext>,
): Promise<CoverageZone[]> {
  const parishBoundaryMarkets = new Map<string, ActiveMarketRow[]>();
  const townZoneMarkets: ActiveMarketRow[] = [];

  for (const market of markets) {
    const parish = market.parish_id ? parishMap.get(market.parish_id) : null;
    const hasFoundation = Boolean(parish?.foundation_multi?.length || parish?.foundation_polygon);
    if (parish?.coverage_mode === "parish_boundary" && hasFoundation) {
      const list = parishBoundaryMarkets.get(parish.id) ?? [];
      list.push(market);
      parishBoundaryMarkets.set(parish.id, list);
    } else {
      townZoneMarkets.push(market);
    }
  }

  const allZones: CoverageZone[] = [];

  for (const [parishId, parishMarkets] of parishBoundaryMarkets) {
    const parish = parishMap.get(parishId);
    const multi = parish?.foundation_multi;
    const flat = parish?.foundation_polygon;
    if (!multi?.length && !flat) continue;
    const sorted = [...parishMarkets].sort((a, b) => a.slug.localeCompare(b.slug));
    for (const market of sorted) {
      allZones.push(
        buildParishSyntheticZone(
          parishId,
          market.id,
          parish!.name,
          multi?.length ? multi : flat!,
          multi,
        ) as CoverageZone,
      );
    }
  }

  for (const market of townZoneMarkets) {
    const published = await loadPublishedZonesForMarket(sb, market);
    const enriched = await enrichZonesWithGeomParts(sb, published);
    const withSchedules = await enrichMarketZonesWithSchedules(sb, enriched);
    allZones.push(
      ...asCoverageZones(withSchedules).map((z) => ({
        ...z,
        market_id: z.market_id ?? market.id,
      })),
    );
  }

  return allZones;
}

async function loadAllScopedExclusions(sb: ServiceSb): Promise<CoverageZone[]> {
  const { data } = await sb
    .from("scoped_exclusion_zones")
    .select("*")
    .eq("is_active", true);
  const rows = (data ?? []) as Record<string, unknown>[];
  return asCoverageZones(rows.map((r) => ({ ...r, kind: "exclude" })));
}

/** Merge market zones with applicable scoped exclusions for evaluation. */
export async function buildCoverageZonesForEvaluation(
  sb: ServiceSb,
  markets: ActiveMarketRow[],
  parishMap: Map<string, ParishContext>,
  lat?: number,
  lng?: number,
): Promise<CoverageZone[]> {
  const base = await buildCoverageZonesForMarkets(sb, markets, parishMap);
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [...base, ...(await loadAllScopedExclusions(sb))];
  }

  let parishId: string | null = null;
  let marketId: string | null = null;
  const probe = evaluateLiveCoverage(lat, lng, base);
  if (probe.matchedInclude?.market_id) {
    marketId = probe.matchedInclude.market_id;
    const m = markets.find((x) => x.id === marketId);
    parishId = m?.parish_id ?? null;
  }

  const scoped = await loadScopedExclusionsForPoint(sb, parishId, marketId);
  const scopedZones = asCoverageZones(
    scoped.map((r) => ({ ...r, kind: "exclude" })),
  );
  return [...base, ...scopedZones];
}

export type MarketPointResolve = {
  covered: boolean;
  marketId: string | null;
  parishId: string | null;
  parishBoundaryMode: boolean;
  marketIds: string[];
  outsideParish: boolean;
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
  const markets = await loadActiveMarkets(sb);
  if (!markets.length) {
    return {
      covered: false,
      marketId: null,
      parishId: null,
      parishBoundaryMode: false,
      marketIds: [],
      outsideParish: false,
      zones: [],
      eval: emptyEval,
    };
  }

  const parishMap = await loadParishMap(sb);
  const allZones = await buildCoverageZonesForEvaluation(sb, markets, parishMap, lat, lng);

  // ADR 0013 hex gate (on by default). Polygon only if no compiled cells / kill-switch.
  if (isRushHexCoverageEnabled()) {
    try {
      const customerCell = latLngToH3(lat, lng, DEFAULT_H3_RESOLUTION);
      const { data: cellRows, error: cellErr } = await sb
        .from("coverage_cells")
        .select("market_id, kind")
        .eq("h3_res", DEFAULT_H3_RESOLUTION)
        .eq("h3_cell", customerCell);

      if (!cellErr && Array.isArray(cellRows) && cellRows.length > 0) {
        const byMarket = new Map<string, { include: string[]; exclude: string[] }>();
        for (const row of cellRows as Array<{ market_id: string; kind: string }>) {
          const mid = String(row.market_id);
          let bucket = byMarket.get(mid);
          if (!bucket) {
            bucket = { include: [], exclude: [] };
            byMarket.set(mid, bucket);
          }
          if (row.kind === "exclude") bucket.exclude.push(customerCell);
          else bucket.include.push(customerCell);
        }

        let hexEval: CoverageEvalResult = {
          inZone: false,
          reasonCode: "out_of_coverage",
          reason: COVERAGE_CUSTOMER_COPY.out_of_coverage,
        };
        let matchedMarketId: string | null = null;

        for (const m of markets) {
          const bucket = byMarket.get(m.id);
          if (!bucket) continue;
          const result = evaluateHexCoverage({
            customerCell,
            includeCells: bucket.include.length ? bucket.include : [],
            excludeCells: bucket.exclude,
          });
          // Markets with only exclude hit → excluded; with include → covered
          if (bucket.exclude.includes(customerCell) && !bucket.include.includes(customerCell)) {
            hexEval = {
              inZone: false,
              reasonCode: "excluded_zone",
              reason: COVERAGE_CUSTOMER_COPY.excluded_zone,
              matchedExclude: { id: m.id, name: m.slug ?? m.id, market_id: m.id },
            };
            continue;
          }
          if (result.inZone) {
            matchedMarketId = m.id;
            hexEval = {
              inZone: true,
              matchedInclude: { id: m.id, name: m.slug ?? m.id, market_id: m.id },
            };
            break;
          }
          if (result.reasonCode === "excluded_zone") {
            hexEval = {
              inZone: false,
              reasonCode: "excluded_zone",
              reason: COVERAGE_CUSTOMER_COPY.excluded_zone,
              matchedExclude: { id: m.id, name: m.slug ?? m.id, market_id: m.id },
            };
          }
        }

        if (!matchedMarketId) {
          return {
            covered: false,
            marketId: null,
            parishId: null,
            parishBoundaryMode: false,
            marketIds: [],
            outsideParish: false,
            zones: allZones,
            eval: hexEval,
          };
        }

        const matchedMarket = markets.find((m) => m.id === matchedMarketId);
        const parish = matchedMarket?.parish_id ? parishMap.get(matchedMarket.parish_id) : null;
        const parishBoundaryMode = parish?.coverage_mode === "parish_boundary";

        if (!parishBoundaryMode && (parish?.foundation_polygon || parish?.has_foundation_geom)) {
          if (!(await isInsideParishFoundationResolved(sb, lat, lng, parish))) {
            return {
              covered: false,
              marketId: null,
              parishId: parish!.id,
              parishBoundaryMode: false,
              marketIds: [],
              outsideParish: true,
              zones: allZones,
              eval: {
                ...hexEval,
                inZone: false,
                reasonCode: "outside_parish",
                reason: COVERAGE_CUSTOMER_COPY.outside_parish,
              },
            };
          }
        }

        const parishId = matchedMarket?.parish_id ?? null;
        const marketIds = parishBoundaryMode && parishId
          ? markets.filter((m) => m.parish_id === parishId).map((m) => m.id)
          : [matchedMarketId];

        return {
          covered: true,
          marketId: matchedMarketId,
          parishId,
          parishBoundaryMode,
          marketIds,
          outsideParish: false,
          zones: allZones,
          eval: hexEval,
        };
      }
      // No compiled cells for this point → fall through to polygon path
    } catch (e) {
      console.warn(JSON.stringify({
        svc: "delivery",
        event: "hex_coverage_resolve_failed",
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  const runJsEval = (zones: CoverageZone[]) => evaluateLiveCoverage(lat, lng, zones);

  let evalResult = runJsEval(allZones);
  const postgisPrimary = Deno.env.get("COVERAGE_POSTGIS_PRIMARY") === "1";
  const postgisShadow = Deno.env.get("COVERAGE_POSTGIS_EVAL") === "1";

  // Primary path: GiST candidates → same JS winner/schedule/ADR-0018 logic on the subset.
  if (postgisPrimary && typeof sb.rpc === "function") {
    const { data: pgRows, error } = await sb.rpc("resolve_containing_zones", {
      p_lat: lat,
      p_lng: lng,
      p_market_id: null,
      p_parish_id: null,
    });
    if (!error && Array.isArray(pgRows) && pgRows.length > 0) {
      const ids = new Set(
        (pgRows as Record<string, unknown>[]).map((r) => String(r.zone_id)),
      );
      const subset = allZones.filter((z) => ids.has(z.id));
      if (subset.length > 0) {
        evalResult = runJsEval(subset);
      }
      // else: empty geom match vs JS payload → keep full JS fallback
    }
    // RPC error / empty → keep full JS fallback
  }

  // Shadow dual-run (staging parity). Uses full-candidate RPC when JS has no market match.
  if (postgisShadow && typeof sb.rpc === "function") {
    const jsFull = postgisPrimary ? runJsEval(allZones) : evalResult;
    const probeMarket = jsFull.matchedInclude?.market_id ?? null;
    const probeParish = probeMarket
      ? markets.find((m) => m.id === probeMarket)?.parish_id ?? null
      : null;
    const { data: pgRows, error } = await sb.rpc("resolve_containing_zones", {
      p_lat: lat,
      p_lng: lng,
      // Full candidate set when uncovered — avoids empty parish/market scoped miss.
      p_market_id: probeMarket,
      p_parish_id: probeParish,
    });
    if (!error && Array.isArray(pgRows)) {
      const rows = pgRows as Record<string, unknown>[];
      const ids = new Set(rows.map((r) => String(r.zone_id)));
      const pgZones = allZones.filter((z) => ids.has(z.id));
      // Only compare when PostGIS returned candidates (empty often means missing geom).
      if (rows.length > 0) {
        const pgEval = runJsEval(pgZones.length ? pgZones : allZones);
        if (
          pgEval.inZone !== jsFull.inZone ||
          (pgEval.matchedInclude?.id ?? null) !== (jsFull.matchedInclude?.id ?? null) ||
          (pgEval.matchedExclude?.id ?? null) !== (jsFull.matchedExclude?.id ?? null)
        ) {
          console.warn("[coverage] PostGIS parity mismatch", {
            lat,
            lng,
            js: {
              inZone: jsFull.inZone,
              include: jsFull.matchedInclude?.id ?? null,
              exclude: jsFull.matchedExclude?.id ?? null,
            },
            pg: {
              inZone: pgEval.inZone,
              include: pgEval.matchedInclude?.id ?? null,
              exclude: pgEval.matchedExclude?.id ?? null,
              candidateIds: [...ids],
            },
            primary: postgisPrimary,
            decisionInZone: evalResult.inZone,
          });
        }
      }
    } else if (error) {
      console.warn("[coverage] PostGIS shadow RPC error", { lat, lng, error: error.message });
    }
  }

  if (!evalResult.inZone || !evalResult.matchedInclude?.market_id) {
    return {
      covered: false,
      marketId: null,
      parishId: null,
      parishBoundaryMode: false,
      marketIds: [],
      outsideParish: false,
      zones: allZones,
      eval: evalResult,
    };
  }

  const matchedMarketId = evalResult.matchedInclude.market_id;
  const matchedMarket = markets.find((m) => m.id === matchedMarketId);
  const parish = matchedMarket?.parish_id ? parishMap.get(matchedMarket.parish_id) : null;
  const parishBoundaryMode = parish?.coverage_mode === "parish_boundary";

  if (!parishBoundaryMode && (parish?.foundation_polygon || parish?.has_foundation_geom)) {
    if (!(await isInsideParishFoundationResolved(sb, lat, lng, parish))) {
      return {
        covered: false,
        marketId: null,
        parishId: parish!.id,
        parishBoundaryMode: false,
        marketIds: [],
        outsideParish: true,
        zones: allZones,
        eval: {
          ...evalResult,
          inZone: false,
          reason: "Outside parish boundary",
        },
      };
    }
  }

  const parishId = matchedMarket?.parish_id ?? null;
  const marketIds = parishBoundaryMode && parishId
    ? markets.filter((m) => m.parish_id === parishId).map((m) => m.id)
    : [matchedMarketId];

  return {
    covered: true,
    marketId: matchedMarketId,
    parishId,
    parishBoundaryMode,
    marketIds,
    outsideParish: false,
    zones: allZones,
    eval: evalResult,
  };
}

export type SameMarketAssert =
  | { ok: true; marketId: string; eval: CoverageEvalResult }
  | {
    ok: false;
    code:
      | "dropoff_required"
      | "out_of_coverage"
      | "outside_parish"
      | "merchant_out_of_market"
      | "merchant_out_of_parish"
      | "too_far_from_store";
    error: string;
    eval?: CoverageEvalResult;
  };

/**
 * Same-town rule (town_zones) or same-parish rule (parish_boundary).
 * When hex coverage is on (default) + merchantId: also enforce merchant reach hex set.
 */
export async function assertSameMarketCoverage(
  sb: ServiceSb,
  opts: {
    dropoffLat: number | null | undefined;
    dropoffLng: number | null | undefined;
    merchantMarketId: string | null | undefined;
    merchantId?: string | null | undefined;
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
    if (resolved.outsideParish) {
      return {
        ok: false,
        code: "outside_parish",
        error: COVERAGE_CUSTOMER_COPY.outside_parish,
        eval: resolved.eval,
      };
    }
    return {
      ok: false,
      code: "out_of_coverage",
      error: resolved.eval.reason ?? COVERAGE_CUSTOMER_COPY.out_of_coverage,
      eval: resolved.eval,
    };
  }

  const merchantMarketId = opts.merchantMarketId != null && String(opts.merchantMarketId).trim()
    ? String(opts.merchantMarketId).trim()
    : null;

  if (!merchantMarketId) {
    return {
      ok: false,
      code: "merchant_out_of_market",
      error: "This store doesn’t deliver to your area",
      eval: resolved.eval,
    };
  }

  if (resolved.parishBoundaryMode) {
    const { data: merchantMarket } = await sb
      .from("service_markets")
      .select("parish_id")
      .eq("id", merchantMarketId)
      .maybeSingle();
    const merchantParishId = merchantMarket?.parish_id != null
      ? String(merchantMarket.parish_id)
      : null;
    if (!merchantParishId || merchantParishId !== resolved.parishId) {
      return {
        ok: false,
        code: "merchant_out_of_parish",
        error: "This store doesn’t deliver to your parish",
        eval: resolved.eval,
      };
    }
  } else if (merchantMarketId !== resolved.marketId) {
    return {
      ok: false,
      code: "merchant_out_of_market",
      error: "This store doesn’t deliver to your area",
      eval: resolved.eval,
    };
  }

  // ADR 0013 Rule 4 — merchant hex reach (default on; kill with RUSH_HEX_COVERAGE_ENABLED=0)
  if (isRushHexCoverageEnabled() && opts.merchantId) {
    try {
      const customerCell = latLngToH3(lat, lng, DEFAULT_H3_RESOLUTION);
      const { data: reach, error } = await sb
        .from("merchant_coverage_cells")
        .select("h3_cell")
        .eq("merchant_id", String(opts.merchantId))
        .eq("h3_res", DEFAULT_H3_RESOLUTION)
        .eq("h3_cell", customerCell)
        .maybeSingle();
      // Only enforce when merchant has compiled reach cells (avoid blocking pre-compile)
      const { count: reachCount } = await sb
        .from("merchant_coverage_cells")
        .select("h3_cell", { count: "exact", head: true })
        .eq("merchant_id", String(opts.merchantId))
        .eq("h3_res", DEFAULT_H3_RESOLUTION);
      if (!error && (reachCount ?? 0) > 0 && !reach) {
        return {
          ok: false,
          code: "too_far_from_store",
          error: COVERAGE_CUSTOMER_COPY.too_far_from_store,
          eval: {
            ...resolved.eval,
            inZone: false,
            reasonCode: "too_far_from_store",
            reason: COVERAGE_CUSTOMER_COPY.too_far_from_store,
          },
        };
      }
    } catch (e) {
      console.warn(JSON.stringify({
        svc: "delivery",
        event: "merchant_hex_reach_check_failed",
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  return {
    ok: true,
    marketId: resolved.parishBoundaryMode ? merchantMarketId : resolved.marketId,
    eval: resolved.eval,
  };
}

/** Suggest market_id from lat/lng across all markets (active or not) for admin assignment. */
export async function suggestMarketIdForMerchantPin(
  sb: ServiceSb,
  lat: number,
  lng: number,
): Promise<string | null> {
  const { data: markets } = await sb
    .from("service_markets")
    .select("id, slug, parish_id, published_version_id, is_active");

  if (!markets?.length) return null;

  const parishMap = await loadParishMap(sb);
  const rows = (markets as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    slug: String(m.slug ?? m.id),
    parish_id: m.parish_id != null ? String(m.parish_id) : null,
    is_active: m.is_active !== false,
    published_version_id: m.published_version_id != null ? String(m.published_version_id) : null,
  }));

  const allZones = await buildCoverageZonesForMarkets(sb, rows, parishMap);
  const evalResult = evaluateLiveCoverage(lat, lng, allZones);
  if (!evalResult.inZone || !evalResult.matchedInclude?.market_id) return null;

  const matchedId = evalResult.matchedInclude.market_id;
  const matched = rows.find((m) => m.id === matchedId);
  const parish = matched?.parish_id ? parishMap.get(matched.parish_id) : null;

  if (
    parish?.coverage_mode === "town_zones" &&
    (parish.foundation_polygon || parish.has_foundation_geom)
  ) {
    if (!(await isInsideParishFoundationResolved(sb, lat, lng, parish))) return null;
  }

  if (parish?.coverage_mode === "parish_boundary" && matched?.parish_id) {
    const inParish = rows
      .filter((m) => m.parish_id === matched.parish_id)
      .sort((a, b) => a.slug.localeCompare(b.slug));
    return inParish[0]?.id ?? matchedId;
  }

  return matchedId;
}

export type MerchantMarketRecomputeResult = {
  updated: number;
  cleared: number;
  skippedLocked: number;
  skippedNoPin: number;
  unchanged: number;
  updatedLocked: number;
  unlocked: number;
};

export type RecomputeMerchantMarketsOpts = {
  includeLocked?: boolean;
  unlockAfter?: boolean;
};

/**
 * Reassign merchants from published coverage.
 * Locked rows skipped unless includeLocked is true.
 */
export async function recomputeMerchantMarkets(
  sb: ServiceSb,
  opts: RecomputeMerchantMarketsOpts = {},
): Promise<MerchantMarketRecomputeResult> {
  const includeLocked = opts.includeLocked === true;
  const unlockAfter = opts.unlockAfter === true;
  const result: MerchantMarketRecomputeResult = {
    updated: 0,
    cleared: 0,
    skippedLocked: 0,
    skippedNoPin: 0,
    unchanged: 0,
    updatedLocked: 0,
    unlocked: 0,
  };

  const { data: merchants, error } = await sb
    .from("merchants")
    .select("id, lat, lng, market_id, market_id_locked, market_id_lock_source");
  if (error || !merchants?.length) return result;

  for (const row of merchants) {
    const m = row as Record<string, unknown>;
    const lockSource = resolveMarketLockSource(m);
    const wasLocked = lockSource != null;
    if (wasLocked && !includeLocked) {
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

    const updatePayload: Record<string, unknown> = { market_id: suggested };
    if (unlockAfter && wasLocked) {
      updatePayload.market_id_locked = false;
      updatePayload.market_id_lock_source = null;
    }

    const { error: upErr } = await sb
      .from("merchants")
      .update(updatePayload)
      .eq("id", String(m.id));
    if (upErr) continue;

    if (wasLocked) result.updatedLocked += 1;
    if (unlockAfter && wasLocked) result.unlocked += 1;
    if (suggested == null) result.cleared += 1;
    else result.updated += 1;
  }

  return result;
}

/** @deprecated Use recomputeMerchantMarkets */
export async function recomputeUnlockedMerchantMarkets(
  sb: ServiceSb,
): Promise<MerchantMarketRecomputeResult> {
  return recomputeMerchantMarkets(sb, { includeLocked: false });
}
