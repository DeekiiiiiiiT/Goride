/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeLandedCost,
  USD_TAX_FREE_THRESHOLD_MINOR,
} from "./landedCost.ts";

Deno.test("landed cost — under US$100 threshold zeros primary taxes", () => {
  const r = computeLandedCost({
    itemCostUsdMinor: 80_00,
    freightUsdMinor: 5_00,
    insuranceUsdMinor: 0,
    cetRate: 0.2,
  });
  assertEquals(r.aboveThreshold, false);
  assertEquals(r.importDutyUsdMinor, 0);
  assertEquals(r.scfUsdMinor, 0);
  assertEquals(r.envUsdMinor, 0);
  assertEquals(r.gctUsdMinor, 0);
  assertEquals(r.stampJmdMinor, 0);
  assertEquals(r.totalDutyUsdMinor, 0);
});

Deno.test("landed cost — above threshold compounds CET → SCF/ENV → GCT", () => {
  const r = computeLandedCost({
    itemCostUsdMinor: 200_00,
    freightUsdMinor: 20_00,
    insuranceUsdMinor: 2_00, // explicit (not default 1%)
    cetRate: 0.2,
    stampJmdMinor: 100_00,
    cafJmdMinor: 2500_00,
    fxUsdJmd: 155.5,
  });
  assertEquals(r.cifUsdMinor, 222_00);
  assertEquals(r.aboveThreshold, true);
  assertEquals(r.cifUsdMinor > USD_TAX_FREE_THRESHOLD_MINOR, true);
  assertEquals(r.importDutyUsdMinor, 4440); // 22200 * 0.2
  assertEquals(r.scfUsdMinor, 67); // round(22200 * 0.003)
  assertEquals(r.envUsdMinor, 111); // round(22200 * 0.005)
  // GCT base = 22200+4440+67+111 = 26818 → *0.15 = 4023
  assertEquals(r.gctUsdMinor, 4023);
  assertEquals(r.stampJmdMinor, 100_00);
  assertEquals(r.cafJmdMinor, 2500_00);
  assertEquals(r.totalDutyUsdMinor > 0, true);
});

Deno.test("landed cost — default insurance is 1% of item cost", () => {
  const r = computeLandedCost({
    itemCostUsdMinor: 100_00,
    freightUsdMinor: 0,
    cetRate: 0,
  });
  assertEquals(r.insuranceUsdMinor, 100);
  assertEquals(r.cifUsdMinor, 101_00);
  assertEquals(r.aboveThreshold, true);
});
