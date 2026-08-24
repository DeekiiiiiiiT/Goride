/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggestParishCoverageMode } from "./parishModeSuggest.ts";

const PARISH_ID = "parish-1";
const TOWN_A = "town-a";
const TOWN_B = "town-b";

const FOUNDATION = [
  { lat: 17.98, lng: -77.05 },
  { lat: 17.98, lng: -76.85 },
  { lat: 18.08, lng: -76.85 },
  { lat: 18.08, lng: -77.05 },
];

const VALID_INCLUDE = [
  { kind: "include", polygon: [{ lat: 1, lng: 1 }, { lat: 2, lng: 1 }, { lat: 2, lng: 2 }] },
];

function mockSb(opts: {
  parish: Record<string, unknown>;
  markets: Array<Record<string, unknown>>;
  zonesByMarket: Record<string, unknown[]>;
}) {
  return {
    from(table: string) {
      if (table === "service_parishes") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: id === PARISH_ID ? opts.parish : null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "service_markets") {
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                if (col === "parish_id") {
                  return {
                    eq(_col2: string, active: unknown) {
                      return Promise.resolve({
                        data: opts.markets.filter(
                          (m) => m.parish_id === val && m.is_active === active,
                        ),
                      });
                    },
                  };
                }
                return Promise.resolve({ data: [] });
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
                return Promise.resolve({ data: opts.zonesByMarket[marketId] ?? [] });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

Deno.test("suggestParishCoverageMode — one active town + foundation → parish_boundary", async () => {
  const sb = mockSb({
    parish: {
      id: PARISH_ID,
      name: "St Catherine",
      coverage_mode: "town_zones",
      foundation_polygon: FOUNDATION,
    },
    markets: [{ id: TOWN_A, parish_id: PARISH_ID, is_active: true }],
    zonesByMarket: { [TOWN_A]: VALID_INCLUDE },
  });
  const suggestion = await suggestParishCoverageMode(sb, PARISH_ID);
  assertEquals(suggestion?.suggested, "parish_boundary");
});

Deno.test("suggestParishCoverageMode — two active towns → town_zones", async () => {
  const sb = mockSb({
    parish: {
      id: PARISH_ID,
      name: "St Catherine",
      coverage_mode: "parish_boundary",
      foundation_polygon: FOUNDATION,
    },
    markets: [
      { id: TOWN_A, parish_id: PARISH_ID, is_active: true },
      { id: TOWN_B, parish_id: PARISH_ID, is_active: true },
    ],
    zonesByMarket: { [TOWN_A]: VALID_INCLUDE, [TOWN_B]: VALID_INCLUDE },
  });
  const suggestion = await suggestParishCoverageMode(sb, PARISH_ID);
  assertEquals(suggestion?.suggested, "town_zones");
});
