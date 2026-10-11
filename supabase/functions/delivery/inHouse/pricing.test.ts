import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { customerPriceFromCost, jamaicaDayStartIso, priceWithinTolerance, withinAbsorbCap } from "./pricing.ts";

Deno.test("markup rounds the customer price up to the next ten dollars", () => {
  assertEquals(customerPriceFromCost(2000, 1500), 2300);
  assertEquals(priceWithinTolerance(200000, 208000, 300), false);
  assertEquals(priceWithinTolerance(200000, 206000, 300), true);
});

Deno.test("Roam absorbs the lesser of the percent and the dollar cap", () => {
  assertEquals(withinAbsorbCap(200000, 210000, 1000, 50000), true);
  assertEquals(withinAbsorbCap(200000, 260000, 1000, 50000), false);
  assertEquals(withinAbsorbCap(1000000, 1090000, 1000, 50000), false);
});

Deno.test("the card day starts at Jamaica midnight", () => {
  const evening = new Date("2026-10-11T23:30:00.000Z");
  assertEquals(jamaicaDayStartIso(evening), "2026-10-11T05:00:00.000Z");
  const morning = new Date("2026-10-11T04:30:00.000Z");
  assertEquals(jamaicaDayStartIso(morning), "2026-10-10T05:00:00.000Z");
});

