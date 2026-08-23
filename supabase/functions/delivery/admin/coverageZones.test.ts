/// <reference lib="deno.ns" />
/**
 * Coverage resolve + same-town assert — no soft-launch fallback.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateCoverage, type CoverageZone } from "./coverageEval.ts";
import {
  asCoverageZones,
  assertSameMarketCoverage,
  resolveMarketForPoint,
} from "./coverageZones.ts";

const ST_MARKET = "market-spanish-town";
const KINGSTON_MARKET = "market-kingston";

/** Rough Spanish Town box */
const ST_INCLUDE: CoverageZone = {
  id: "z-st",
  name: "Spanish Town",
  market_id: ST_MARKET,
  kind: "include",
  polygon: [
    { lat: 17.99, lng: -77.0 },
    { lat: 17.99, lng: -76.9 },
    { lat: 18.05, lng: -76.9 },
    { lat: 18.05, lng: -77.0 },
  ],
};

const KINGSTON_INCLUDE: CoverageZone = {
  id: "z-kin",
  name: "Kingston",
  market_id: KINGSTON_MARKET,
  kind: "include",
  polygon: [
    { lat: 17.95, lng: -76.85 },
    { lat: 17.95, lng: -76.75 },
    { lat: 18.05, lng: -76.75 },
    { lat: 18.05, lng: -76.85 },
  ],
};

Deno.test("evaluateCoverage — in Spanish Town include", () => {
  const r = evaluateCoverage(18.015, -76.955, [ST_INCLUDE, KINGSTON_INCLUDE]);
  assertEquals(r.inZone, true);
  assertEquals(r.matchedInclude?.market_id, ST_MARKET);
});

Deno.test("evaluateCoverage — Kingston pin not in ST-only zones", () => {
  const r = evaluateCoverage(18.0, -76.8, [ST_INCLUDE]);
  assertEquals(r.inZone, false);
});

Deno.test("asCoverageZones preserves market_id and kind", () => {
  const zones = asCoverageZones([
    {
      id: "1",
      name: "Cutout",
      market_id: ST_MARKET,
      kind: "exclude",
      polygon: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
    },
  ]);
  assertEquals(zones[0].kind, "exclude");
  assertEquals(zones[0].market_id, ST_MARKET);
});

function mockSb(opts: {
  markets: Array<Record<string, unknown>>;
  zonesByMarket: Record<string, Record<string, unknown>[]>;
  versions?: Record<string, { zones_json: unknown }>;
}) {
  return {
    from(table: string) {
      if (table === "service_markets") {
        return {
          select() {
            return {
              eq(_col: string, val: unknown) {
                const rows = opts.markets.filter((m) => m.is_active === val || val === true);
                return Promise.resolve({
                  data: val === true ? opts.markets.filter((m) => m.is_active) : rows,
                });
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({ data: opts.markets }).then(resolve);
              },
            };
          },
        };
      }
      if (table === "service_coverage_versions") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: opts.versions?.[id] ?? null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "service_zone_polygons") {
        return {
          select() {
            return {
              eq(_col: string, marketId: string) {
                return {
                  order() {
                    return Promise.resolve({
                      data: opts.zonesByMarket[marketId] ?? [],
                    });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

Deno.test("resolveMarketForPoint — covered returns market, never invents first market", async () => {
  const sb = mockSb({
    markets: [
      { id: ST_MARKET, is_active: true, published_version_id: null },
      { id: KINGSTON_MARKET, is_active: false, published_version_id: null },
    ],
    zonesByMarket: {
      [ST_MARKET]: [{
        id: "z-st",
        name: "Spanish Town",
        market_id: ST_MARKET,
        kind: "include",
        polygon: ST_INCLUDE.polygon,
      }],
    },
  });

  const hit = await resolveMarketForPoint(sb, 18.015, -76.955);
  assertEquals(hit.covered, true);
  assertEquals(hit.marketId, ST_MARKET);

  const miss = await resolveMarketForPoint(sb, 18.0, -76.8);
  assertEquals(miss.covered, false);
  assertEquals(miss.marketId, null);
});

Deno.test("assertSameMarketCoverage — same town ok; mismatch and miss reject", async () => {
  const sb = mockSb({
    markets: [{ id: ST_MARKET, is_active: true, published_version_id: null }],
    zonesByMarket: {
      [ST_MARKET]: [{
        id: "z-st",
        name: "Spanish Town",
        market_id: ST_MARKET,
        kind: "include",
        polygon: ST_INCLUDE.polygon,
      }],
    },
  });

  const ok = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.015,
    dropoffLng: -76.955,
    merchantMarketId: ST_MARKET,
  });
  assertEquals(ok.ok, true);

  const mismatch = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.015,
    dropoffLng: -76.955,
    merchantMarketId: KINGSTON_MARKET,
  });
  assertEquals(mismatch.ok, false);
  if (!mismatch.ok) assertEquals(mismatch.code, "merchant_out_of_market");

  const unassigned = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.015,
    dropoffLng: -76.955,
    merchantMarketId: null,
  });
  assertEquals(unassigned.ok, false);
  if (!unassigned.ok) assertEquals(unassigned.code, "merchant_out_of_market");

  const outside = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.0,
    dropoffLng: -76.8,
    merchantMarketId: ST_MARKET,
  });
  assertEquals(outside.ok, false);
  if (!outside.ok) assertEquals(outside.code, "out_of_coverage");

  const noPin = await assertSameMarketCoverage(sb, {
    dropoffLat: null,
    dropoffLng: null,
    merchantMarketId: ST_MARKET,
  });
  assertEquals(noPin.ok, false);
  if (!noPin.ok) assertEquals(noPin.code, "dropoff_required");
});
