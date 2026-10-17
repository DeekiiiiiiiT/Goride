import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertInHouseCheckout, evaluateInHousePricedLines, type InHousePricedLine } from "./checkout.ts";

const fresh = new Date().toISOString();
const stale = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

Deno.test("engine-only sold-out line is refused", () => {
  const result = evaluateInHousePricedLines([{
    lineId: "engine-only",
    restaurantMinor: 200000,
    priceCheckedAt: fresh,
    available: false,
  }]);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "unavailable_menu_item");
    assertEquals(result.status, 400);
  }
});

Deno.test("engine-only line with stale or missing priceCheckedAt is refused", () => {
  const staleResult = evaluateInHousePricedLines([{
    lineId: "engine-only",
    restaurantMinor: 200000,
    priceCheckedAt: stale,
    available: true,
  }]);
  assertEquals(staleResult.ok, false);
  if (!staleResult.ok) assertEquals(staleResult.status, 409);

  const missing = evaluateInHousePricedLines([{
    lineId: "engine-only",
    restaurantMinor: 200000,
    priceCheckedAt: null,
    available: true,
  }]);
  assertEquals(missing.ok, false);
  if (!missing.ok) assertEquals(missing.status, 409);
});

Deno.test("fresh available engine line passes and sums restaurant cost", () => {
  const lines: InHousePricedLine[] = [
    { lineId: "a", restaurantMinor: 200000, priceCheckedAt: fresh, available: true },
    { lineId: "b", restaurantMinor: 50000, priceCheckedAt: fresh, available: true },
  ];
  const result = evaluateInHousePricedLines(lines);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.expectedCostMinor, 250000);
});

Deno.test("cash payment refused for In-House before pricing rules", async () => {
  const result = await assertInHouseCheckout({ from: () => ({}) } as never, {
    merchant: { id: "m1", procurement_mode: "in_house", in_house_live: true },
    paymentMethod: "cash",
    customerId: "c1",
    pricedLines: [{
      lineId: "p1",
      restaurantMinor: 1000,
      priceCheckedAt: fresh,
      available: true,
    }],
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.code, "cash_not_available");
    assertEquals(result.status, 400);
  }
});

Deno.test("partner stores skip the In-House priced-line gate", async () => {
  const result = await assertInHouseCheckout({ from: () => ({}) } as never, {
    merchant: { id: "m1", procurement_mode: "partner" },
    paymentMethod: "wipay",
    customerId: "c1",
    pricedLines: [{
      lineId: "stale",
      restaurantMinor: 1000,
      priceCheckedAt: stale,
      available: false,
    }],
  });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.expectedCostMinor, 0);
});
