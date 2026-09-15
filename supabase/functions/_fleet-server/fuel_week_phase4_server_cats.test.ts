import { assertEquals } from "jsr:@std/assert";
import {
  resolveEngineCategoryCosts,
} from "./fuel_week_category_loader.ts";

Deno.test("Phase4: server-tagged week entries override client tripCategoryAgg stamp", () => {
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
    // Other driver must not pollute d1 authority
    { amount: 5000, usageCategory: "ride", driverId: "d2", vehicleId: "v2" },
  ];
  const { authority, authoritySource, fromLoader } = resolveEngineCategoryCosts(
    snap,
    serverTagged,
  );
  assertEquals(fromLoader, true);
  assertEquals(authoritySource, "server_entries");
  assertEquals(authority.rideShareCost, 400);
  assertEquals(authority.companyUsageCost, 100);
});

Deno.test("Phase4: wrong client stamp vs server derivation → non-zero category deltas path", () => {
  const snap = {
    driverId: "d1",
    categoryCosts: {
      rideShareCost: 999,
      companyUsageCost: 0,
      deadheadCost: 0,
      personalUsageCost: 0,
    },
  };
  const serverTagged = [
    { amount: 200, usageCategory: "personal", driverId: "d1" },
  ];
  const { authority, snapCats, authoritySource } = resolveEngineCategoryCosts(
    snap,
    serverTagged,
  );
  assertEquals(authoritySource, "server_entries");
  assertEquals(authority.personalUsageCost, 200);
  assertEquals(Number(snapCats?.rideShareCost), 999);
});
