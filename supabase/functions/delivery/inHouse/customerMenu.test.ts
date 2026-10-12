import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { customerMenuItem } from "./customerMenu.ts";

Deno.test("an In-House dish does not reveal the restaurant price", () => {
  const item = customerMenuItem({
    id: "dish",
    name: "Jerk chicken",
    price: 1400,
    marketplace_price: 1400,
    in_store_price: 1200,
    source_sku: "jk-1",
    source_url: "https://store.example/jk",
    source_price_checked_at: "2026-10-11T12:00:00.000Z",
    options: [{
      name: "Add-ons",
      options: [{ name: "Extra cheese", priceAdjustment: 200, marketplaceAdjustment: 230 }],
    }],
  });
  assertEquals(item.in_store_price, undefined);
  assertEquals(item.source_sku, undefined);
  assertEquals(item.source_url, undefined);
  assertEquals(item.source_price_checked_at, undefined);
  assertEquals(item.marketplace_price, 1400);
  const option = (item.options as Array<{ options: Array<Record<string, unknown>> }>)[0].options[0];
  assertEquals(option.priceAdjustment, undefined);
  assertEquals(option.marketplaceAdjustment, 230);
});
