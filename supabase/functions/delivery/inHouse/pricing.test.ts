import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculateOrderPricing } from "../../_shared/orderPricing.ts";
import { pizzaRestaurantPrice, type PizzaMenu, type PizzaPick } from "../../../../packages/merchant-ops/src/pizzaMenu.ts";
import { pizzaLinePrices, pizzaMenuForCustomer } from "./customerMenu.ts";
import { appliedMenuPrice, customerPriceFromCost, isOpenAt, jamaicaDayStartIso, jamaicaWeekday, kitchenModifiers, priceWithinTolerance, storeOpenNow, withinAbsorbCap } from "./pricing.ts";

function chargedSubtotal(unitPrice: number, modifiers?: Array<{ name: string; priceAdjustment: number }>) {
  return calculateOrderPricing({
    lines: [{ menuItemId: "dish", name: "Dish", unitPrice, quantity: 1, modifiers }],
    taxRatePercent: 0,
    gctRegistered: false,
  }).subtotal;
}

const pizzaMenu: PizzaMenu = {
  sizes: [{ id: "medium", name: "Medium", basePrice: 1000 }],
  crusts: [{ id: "tossed", name: "Hand Tossed", description: "", fees: { medium: 0 } }],
  extraCheese: { medium: 0 },
  sauces: [{ id: "pizza", name: "Pizza Sauce" }],
  meats: [{ id: "pepperoni", name: "Pepperoni", prices: { medium: 200 } }],
  nonMeats: [],
};

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

Deno.test("Friday night in Jamaica stays Friday and Sunday after close is shut", () => {
  const fridayNight = new Date("2026-10-10T03:30:00.000Z");
  const sundayLate = new Date("2026-10-12T02:00:00.000Z");
  assertEquals(jamaicaWeekday(fridayNight), 5);
  assertEquals(jamaicaWeekday(sundayLate), 0);
  const week = [
    { day_of_week: 0, open_time: "12:00", close_time: "20:00", is_closed: false },
    { day_of_week: 5, open_time: "11:00", close_time: "23:00", is_closed: false },
  ];
  assertEquals(isOpenAt("11:00", "23:00", false, fridayNight), true);
  assertEquals(storeOpenNow(week, fridayNight), true);
  assertEquals(isOpenAt("12:00", "20:00", false, sundayLate), false);
  assertEquals(storeOpenNow(week, sundayLate), false);
});

Deno.test("a paid add-on is charged once for a partner, an In-House store, and a pizza", () => {
  const partnerGroups = [{
    name: "Extras",
    options: [{ id: "cheese", name: "Cheese", priceAdjustment: 200, marketplaceAdjustment: 200 }],
  }];
  const partnerPick = [{ id: "cheese", name: "Cheese" }];
  const partner = appliedMenuPrice(partnerGroups, partnerPick, { restaurant: 1000, customer: 1000 });
  assertEquals(partner.customer, 1200);
  assertEquals(chargedSubtotal(partner.customer, kitchenModifiers(partnerPick)), 1200);

  const inHouseGroups = [{
    name: "Extras",
    options: [{ id: "cheese", name: "Cheese", priceAdjustment: 200, marketplaceAdjustment: 230 }],
  }];
  const inHouse = appliedMenuPrice(inHouseGroups, partnerPick, { restaurant: 1000, customer: 1150 });
  assertEquals(inHouse.customer, 1380);
  assertEquals(chargedSubtotal(inHouse.customer, kitchenModifiers(partnerPick)), 1380);

  const pizzaPick: PizzaPick = {
    sizeId: "medium",
    crustId: "tossed",
    cheese: "normal",
    sauceId: "pizza",
    toppings: [{ id: "pepperoni", portion: "normal" }],
  };
  const pizza = pizzaLinePrices(pizzaMenu, pizzaPick, 1500);
  if (!pizza.ok) throw new Error(pizza.error);
  const pizzaModifiers = [
    { name: "Medium", priceAdjustment: 0 },
    { name: "Pepperoni", priceAdjustment: 0 },
  ];
  assertEquals(pizza.restaurant, 1200);
  assertEquals(pizza.customer, 1380);
  assertEquals(chargedSubtotal(pizza.customer, pizzaModifiers), pizza.customer);
});

Deno.test("a pizza with several toppings charges the same total the item sheet shows", () => {
  const menu: PizzaMenu = {
    sizes: [{ id: "medium", name: "Medium", basePrice: 1010 }],
    crusts: [{ id: "tossed", name: "Hand Tossed", description: "", fees: { medium: 0 } }],
    extraCheese: { medium: 120 },
    sauces: [{ id: "pizza", name: "Pizza Sauce" }],
    meats: [{ id: "pepperoni", name: "Pepperoni", prices: { medium: 85 } }],
    nonMeats: [],
  };
  const pick: PizzaPick = {
    sizeId: "medium",
    crustId: "tossed",
    cheese: "extra",
    sauceId: "pizza",
    toppings: [{ id: "pepperoni", portion: "normal" }],
  };
  const sheet = pizzaRestaurantPrice(pizzaMenuForCustomer(menu, 1500), pick);
  const charged = pizzaLinePrices(menu, pick, 1500);
  const raw = pizzaRestaurantPrice(menu, pick);
  if (!sheet.ok || !charged.ok || !raw.ok) throw new Error("pizza price failed");
  const roundedOnce = customerPriceFromCost(raw.restaurant, 1500);
  assertEquals(raw.restaurant, 1215);
  assertEquals(roundedOnce, 1400);
  assertEquals(sheet.restaurant, 1410);
  assertEquals(charged.customer, sheet.restaurant);
  assertEquals(charged.restaurant, raw.restaurant);
});

Deno.test("the card day starts at Jamaica midnight", () => {
  const evening = new Date("2026-10-11T23:30:00.000Z");
  assertEquals(jamaicaDayStartIso(evening), "2026-10-11T05:00:00.000Z");
  const morning = new Date("2026-10-11T04:30:00.000Z");
  assertEquals(jamaicaDayStartIso(morning), "2026-10-10T05:00:00.000Z");
});

