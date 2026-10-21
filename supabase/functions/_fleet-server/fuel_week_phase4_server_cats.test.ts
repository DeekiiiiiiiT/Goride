import { assertEquals } from "jsr:@std/assert";
import {
  resolveEngineCategoryCosts,
} from "./fuel_week_category_loader.ts";

Deno.test("Phase4: tagged fill amounts are not distance-category authority", () => {
  const snap = {
    driverId: "d1",
    vehicleId: "v1",
    categoryCosts: {
      rideShareCost: 999,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 0,
    },
    metadata: {
      tripCategoryAgg: {
        rideShareCost: 999,
        companyUsageCost: 0,
        deadheadCost: 0,
        personalUsageCost: 0,
      },
      settledEntries: [{ amount: 999, date: "2026-08-25" }],
    },
  };
  const serverTagged = [
    { amount: 400, usageCategory: "ride", driverId: "d1", vehicleId: "v1" },
    { amount: 100, usageCategory: "company", driverId: "d1", vehicleId: "v1" },
    { amount: 5000, usageCategory: "ride", driverId: "d2", vehicleId: "v2" },
  ];
  const { authority, authoritySource } = resolveEngineCategoryCosts(snap, serverTagged);
  assertEquals(authoritySource, "trip_agg");
  assertEquals(authority.rideShareCost, 999);
});

Deno.test("Phase4: a rideshare stamp that does not match the saved engine still diffs on spend helper", async () => {
  const { diffFuelSpendAgainstFills } = await import("./fuel_week_category_loader.ts");
  const deltas = diffFuelSpendAgainstFills({
    clientSpend: 19000,
    clientRideShare: 19081.21,
    serverSpend: 19000,
    serverGasCard: 15000,
    serverCash: 4000,
    serverRideShare: 18081.21,
  });
  assertEquals(deltas.some((d) => d.field === "rideShareCost" && d.delta === 1000), true);
  const clean = diffFuelSpendAgainstFills({
    clientSpend: 19000,
    clientRideShare: 18081.21,
    serverSpend: 19000,
    serverGasCard: 15000,
    serverCash: 4000,
    serverRideShare: 18081.21,
  });
  assertEquals(clean, []);
});
