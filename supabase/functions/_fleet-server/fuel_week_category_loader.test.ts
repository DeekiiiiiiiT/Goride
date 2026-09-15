import { assertEquals } from "jsr:@std/assert";
import { computeFuelWeek } from "../../../packages/fuel-core/src/computeFuelWeek.ts";
import { categoryCostsFromEntriesAndTrips } from "./fuel_week_category_loader.ts";

Deno.test("category loader: trip agg wins over entries", () => {
  const cats = categoryCostsFromEntriesAndTrips(
    [{ amount: 999, usageCategory: "personal" }],
    { rideShareCost: 400, companyUsageCost: 100, deadheadCost: 50, personalUsageCost: 50 },
  );
  assertEquals(cats.rideShareCost, 400);
  assertEquals(cats.personalUsageCost, 50);
});

Deno.test("category loader + computeFuelWeek produces shares", () => {
  const cats = categoryCostsFromEntriesAndTrips([
    { amount: 700, usageCategory: "ride" },
    { amount: 300, usageCategory: "company" },
  ]);
  const calc = computeFuelWeek({
    totalSpend: 1000,
    ...cats,
    rule: { coverageType: "Percentage", coverageValue: 50 },
    driverId: "d1",
  });
  assertEquals(calc.totalSpend, 1000);
  assertEquals(calc.driverShare + calc.companyShare + calc.miscellaneousCost, 1000);
});
