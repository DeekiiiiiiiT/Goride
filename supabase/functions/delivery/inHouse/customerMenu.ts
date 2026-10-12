import type { PizzaMenu } from "../../../../packages/merchant-ops/src/pizzaMenu.ts";
import { customerPriceFromCost } from "./pricing.ts";

/** Customer store payload. Restaurant cost and source notes stay on the server. */
export function customerMenuItem(item: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "in_store_price" || key.startsWith("source_")) continue;
    next[key] = key === "options" ? customerOptions(value) : value;
  }
  return next;
}

function customerOptions(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((group) => {
    if (!group || typeof group !== "object" || !Array.isArray((group as { options?: unknown }).options)) return group;
    const row = group as Record<string, unknown>;
    return {
      ...row,
      options: (row.options as unknown[]).map((option) => {
        if (!option || typeof option !== "object") return option;
        const { priceAdjustment: _restaurantPrice, ...rest } = option as Record<string, unknown>;
        return rest;
      }),
    };
  });
}

/** Menu prices the customer sees. Checkout still recalculates from the restaurant price. */
export function pizzaMenuForCustomer(menu: PizzaMenu, markupBps: number): PizzaMenu {
  const lift = (amount: number) => customerPriceFromCost(amount, markupBps);
  const fees = (row: Record<string, number | null>) => Object.fromEntries(
    Object.entries(row).map(([id, fee]) => [id, fee == null ? null : lift(fee)]),
  );
  const prices = (row: Record<string, number>) => Object.fromEntries(
    Object.entries(row).map(([id, amount]) => [id, lift(amount)]),
  );
  return {
    sizes: menu.sizes.map((size) => ({ ...size, basePrice: lift(size.basePrice) })),
    crusts: menu.crusts.map((crust) => ({ ...crust, fees: fees(crust.fees) })),
    extraCheese: Object.fromEntries(Object.entries(menu.extraCheese).map(([id, amount]) => [id, lift(amount)])),
    sauces: menu.sauces,
    meats: menu.meats.map((topping) => ({ ...topping, prices: prices(topping.prices) })),
    nonMeats: menu.nonMeats.map((topping) => ({ ...topping, prices: prices(topping.prices) })),
  };
}
