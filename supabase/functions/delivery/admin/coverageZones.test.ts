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

const ST_PARISH = "parish-st-catherine";
const ST_FOUNDATION: CoverageZone["polygon"] = [
  { lat: 17.98, lng: -77.05 },
  { lat: 17.98, lng: -76.85 },
  { lat: 18.08, lng: -76.85 },
  { lat: 18.08, lng: -77.05 },
];

function mockSb(opts: {
  markets: Array<Record<string, unknown>>;
  zonesByMarket: Record<string, Record<string, unknown>[]>;
  versions?: Record<string, { zones_json: unknown }>;
  parishes?: Array<Record<string, unknown>>;
  marketById?: Record<string, Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      if (table === "service_markets") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: unknown) {
                if (col === "is_active") {
                  return Promise.resolve({
                    data: opts.markets.filter((m) => m.is_active === val),
                  });
                }
                if (col === "id") {
                  const id = String(val);
                  const row = opts.marketById?.[id] ??
                    opts.markets.find((m) => String(m.id) === id) ??
                    null;
                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: row });
                    },
                  };
                }
                return Promise.resolve({ data: [] });
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({ data: opts.markets }).then(resolve);
              },
            };
          },
        };
      }
      if (table === "service_parishes") {
        return {
          select() {
            return Promise.resolve({ data: opts.parishes ?? [] });
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
    rpc(_fn: string, _args?: Record<string, unknown>) {
      return Promise.resolve({ data: null, error: null });
    },
  };
}

Deno.test("resolveMarketForPoint — covered returns market, never invents first market", async () => {
  const sb = mockSb({
    markets: [
      { id: ST_MARKET, slug: "spanish-town", is_active: true, published_version_id: null, parish_id: null },
      { id: KINGSTON_MARKET, slug: "kingston", is_active: false, published_version_id: null, parish_id: null },
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
    markets: [{ id: ST_MARKET, slug: "spanish-town", is_active: true, published_version_id: null, parish_id: ST_PARISH }],
    zonesByMarket: {
      [ST_MARKET]: [{
        id: "z-st",
        name: "Spanish Town",
        market_id: ST_MARKET,
        kind: "include",
        polygon: ST_INCLUDE.polygon,
      }],
    },
    parishes: [{
      id: ST_PARISH,
      name: "St Catherine",
      coverage_mode: "town_zones",
      foundation_polygon: ST_FOUNDATION,
    }],
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

Deno.test("assertSameMarketCoverage — outside parish foundation rejects", async () => {
  const sb = mockSb({
    markets: [{ id: ST_MARKET, slug: "spanish-town", is_active: true, published_version_id: null, parish_id: ST_PARISH }],
    zonesByMarket: {
      [ST_MARKET]: [{
        id: "z-st-wide",
        name: "Spanish Town wide",
        market_id: ST_MARKET,
        kind: "include",
        polygon: [
          { lat: 17.99, lng: -77.04 },
          { lat: 17.99, lng: -76.80 },
          { lat: 18.07, lng: -76.80 },
          { lat: 18.07, lng: -77.04 },
        ],
      }],
    },
    parishes: [{
      id: ST_PARISH,
      name: "St Catherine",
      coverage_mode: "town_zones",
      foundation_polygon: ST_FOUNDATION,
    }],
  });

  const outsideParish = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.02,
    dropoffLng: -76.82,
    merchantMarketId: ST_MARKET,
  });
  assertEquals(outsideParish.ok, false);
  if (!outsideParish.ok) assertEquals(outsideParish.code, "outside_parish");
});

Deno.test("assertSameMarketCoverage — parish_boundary same parish ok", async () => {
  const townB = "market-town-b";
  const sb = mockSb({
    markets: [
      { id: ST_MARKET, slug: "a-town", is_active: true, published_version_id: null, parish_id: ST_PARISH },
      { id: townB, slug: "b-town", is_active: true, published_version_id: null, parish_id: ST_PARISH },
    ],
    zonesByMarket: {},
    parishes: [{
      id: ST_PARISH,
      name: "St Catherine",
      coverage_mode: "parish_boundary",
      foundation_polygon: ST_FOUNDATION,
    }],
    marketById: {
      [townB]: { id: townB, parish_id: ST_PARISH },
    },
  });

  const ok = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.015,
    dropoffLng: -76.955,
    merchantMarketId: townB,
  });
  assertEquals(ok.ok, true);
});

Deno.test("assertSameMarketCoverage — parish_boundary different parish fails", async () => {
  const otherParish = "parish-other";
  const sb = mockSb({
    markets: [
      { id: ST_MARKET, slug: "a-town", is_active: true, published_version_id: null, parish_id: ST_PARISH },
      { id: KINGSTON_MARKET, slug: "kingston", is_active: true, published_version_id: null, parish_id: otherParish },
    ],
    zonesByMarket: {},
    parishes: [
      {
        id: ST_PARISH,
        name: "St Catherine",
        coverage_mode: "parish_boundary",
        foundation_polygon: ST_FOUNDATION,
      },
      {
        id: otherParish,
        name: "Kingston",
        coverage_mode: "town_zones",
        foundation_polygon: null,
      },
    ],
    marketById: {
      [KINGSTON_MARKET]: { id: KINGSTON_MARKET, parish_id: otherParish },
    },
  });

  const fail = await assertSameMarketCoverage(sb, {
    dropoffLat: 18.015,
    dropoffLng: -76.955,
    merchantMarketId: KINGSTON_MARKET,
  });
  assertEquals(fail.ok, false);
  if (!fail.ok) assertEquals(fail.code, "merchant_out_of_parish");
});

Deno.test("recomputeMerchantMarkets — unlockAfter clears lock on forced update", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from(table: string) {
      if (table === "merchants") {
        return {
          select() {
            return Promise.resolve({
              data: [{
                id: "m1",
                lat: 18.015,
                lng: -76.955,
                market_id: "old-town",
                market_id_locked: true,
                market_id_lock_source: 'manual',
              }],
            });
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "service_markets") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: unknown) {
                if (col === "is_active") {
                  return Promise.resolve({
                    data: [{
                      id: ST_MARKET,
                      slug: "spanish-town",
                      is_active: true,
                      published_version_id: null,
                      parish_id: null,
                    }],
                  });
                }
                return { maybeSingle: () => Promise.resolve({ data: null }) };
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({
                  data: [{
                    id: ST_MARKET,
                    slug: "spanish-town",
                    parish_id: null,
                    published_version_id: null,
                  }],
                }).then(resolve);
              },
            };
          },
        };
      }
      if (table === "service_parishes") {
        return { select: () => Promise.resolve({ data: [] }) };
      }
      if (table === "service_zone_polygons") {
        return {
          select() {
            return {
              eq(_col: string, marketId: string) {
                return {
                  order() {
                    return Promise.resolve({
                      data: [{
                        id: "z-st",
                        name: "Spanish Town",
                        market_id: marketId,
                        kind: "include",
                        polygon: ST_INCLUDE.polygon,
                      }],
                    });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  };

  const { recomputeMerchantMarkets } = await import("./coverageZones.ts");
  const result = await recomputeMerchantMarkets(sb, {
    includeLocked: true,
    unlockAfter: true,
  });
  assertEquals(result.unlocked, 1);
  assertEquals(updates[0]?.market_id_locked, false);
  assertEquals(updates[0]?.market_id_lock_source, null);
});

Deno.test("recomputeMerchantMarkets — pin lock skipped unless includeLocked", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const sb = {
    from(table: string) {
      if (table === "merchants") {
        return {
          select() {
            return Promise.resolve({
              data: [{
                id: "m-pin",
                lat: 18.015,
                lng: -76.955,
                market_id: "old-town",
                market_id_locked: true,
                market_id_lock_source: "pin",
              }],
            });
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "service_markets") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: unknown) {
                if (col === "is_active") {
                  return Promise.resolve({
                    data: [{
                      id: ST_MARKET,
                      slug: "spanish-town",
                      is_active: true,
                      published_version_id: null,
                      parish_id: null,
                    }],
                  });
                }
                return { maybeSingle: () => Promise.resolve({ data: null }) };
              },
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve({
                  data: [{
                    id: ST_MARKET,
                    slug: "spanish-town",
                    parish_id: null,
                    published_version_id: null,
                  }],
                }).then(resolve);
              },
            };
          },
        };
      }
      if (table === "service_parishes") {
        return { select: () => Promise.resolve({ data: [] }) };
      }
      if (table === "service_zone_polygons") {
        return {
          select() {
            return {
              eq(_col: string, marketId: string) {
                return {
                  order() {
                    return Promise.resolve({
                      data: [{
                        id: "z-st",
                        name: "Spanish Town",
                        market_id: marketId,
                        kind: "include",
                        polygon: ST_INCLUDE.polygon,
                      }],
                    });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  };

  const { recomputeMerchantMarkets } = await import("./coverageZones.ts");
  const result = await recomputeMerchantMarkets(sb, { includeLocked: false });
  assertEquals(result.skippedLocked, 1);
  assertEquals(updates.length, 0);
});
