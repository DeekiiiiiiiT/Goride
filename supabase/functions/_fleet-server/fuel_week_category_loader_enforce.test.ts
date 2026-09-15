import { assertEquals } from "jsr:@std/assert";
import { computeFuelWeek, diffWeekCalc } from "../../../packages/fuel-core/src/computeFuelWeek.ts";
import {
  materialCategoryCostDeltas,
  resolveEngineCategoryCosts,
} from "./fuel_week_category_loader.ts";

const rule = { coverageType: "Percentage", coverageValue: 50 };

const honestCats = {
  rideShareCost: 400,
  companyUsageCost: 100,
  deadheadCost: 50,
  personalUsageCost: 50,
};

/** Production-shaped: wallet settledEntries without usageCategory + Engine A tripCategoryAgg. */
function productionSnap(overrides?: {
  categoryCosts?: typeof honestCats;
  tripCategoryAgg?: typeof honestCats;
  omitTripAgg?: boolean;
  companyShare?: number;
  driverShare?: number;
  miscellaneousCost?: number;
}) {
  const tripAgg = overrides?.omitTripAgg ? undefined : (overrides?.tripCategoryAgg ?? honestCats);
  return {
    driverId: "d1",
    totalGasCardCost: 600,
    companyShare: overrides?.companyShare ?? 200,
    driverShare: overrides?.driverShare ?? 400,
    miscellaneousCost: overrides?.miscellaneousCost ?? 0,
    categoryCosts: overrides?.categoryCosts ?? honestCats,
    fuelRule: rule,
    metadata: {
      fuelRule: rule,
      ...(tripAgg ? { tripCategoryAgg: tripAgg } : {}),
      settledEntries: [
        { id: "e1", amount: 600, date: "2026-08-25", driverId: "d1", vehicleId: "v1" },
      ],
    },
  };
}

Deno.test("N-15: production-shaped snap (untagged entries + tripCategoryAgg) → no false mismatch", () => {
  const honest = computeFuelWeek({
    totalSpend: 600,
    ...honestCats,
    rule,
    driverId: "d1",
  });
  const snap = productionSnap({
    companyShare: honest.companyShare,
    driverShare: honest.driverShare,
    miscellaneousCost: honest.miscellaneousCost,
  });
  const { authority: cats, snapCats, fromLoader } = resolveEngineCategoryCosts(snap);
  assertEquals(fromLoader, true);
  assertEquals(cats.rideShareCost, 400);
  const recomputed = computeFuelWeek({
    totalSpend: 600,
    ...cats,
    rule,
    driverId: "d1",
  });
  const clientCalc = {
    totalSpend: 600,
    companyShare: Number(snap.companyShare),
    driverShare: Number(snap.driverShare),
    miscellaneousCost: Number(snap.miscellaneousCost),
  };
  const deltas = [
    ...diffWeekCalc(clientCalc, recomputed),
    ...materialCategoryCostDeltas(snapCats, cats),
  ];
  assertEquals(deltas.length, 0);
});

Deno.test("N-15: tampered categoryCosts vs honest tripCategoryAgg → SNAPSHOT_MISMATCH deltas", () => {
  const honest = computeFuelWeek({
    totalSpend: 600,
    ...honestCats,
    rule,
    driverId: "d1",
  });
  const snap = productionSnap({
    categoryCosts: {
      rideShareCost: 999,
      companyUsageCost: 100,
      deadheadCost: 50,
      personalUsageCost: 50,
    },
    tripCategoryAgg: honestCats,
    companyShare: honest.companyShare,
    driverShare: honest.driverShare,
    miscellaneousCost: honest.miscellaneousCost,
  });
  const { authority: cats, snapCats, fromLoader } = resolveEngineCategoryCosts(snap);
  assertEquals(fromLoader, true);
  assertEquals(cats.rideShareCost, 400);
  const recomputed = computeFuelWeek({
    totalSpend: 600,
    ...cats,
    rule,
    driverId: "d1",
  });
  const clientCalc = {
    totalSpend: 600,
    companyShare: Number(snap.companyShare),
    driverShare: Number(snap.driverShare),
    miscellaneousCost: Number(snap.miscellaneousCost),
  };
  const deltas = [
    ...diffWeekCalc(clientCalc, recomputed),
    ...materialCategoryCostDeltas(snapCats, cats),
  ];
  assertEquals(deltas.some((d) => d.field === "category.rideShareCost"), true);
  assertEquals(deltas.length > 0, true);
});

Deno.test("N-15: untagged entries alone do not dump spend into rideShareCost", () => {
  const snap = productionSnap({ omitTripAgg: true });
  const { authority: cats, fromLoader } = resolveEngineCategoryCosts(snap);
  assertEquals(fromLoader, false);
  assertEquals(cats.rideShareCost, 400);
  assertEquals(cats.companyUsageCost, 100);
  assertEquals(cats.rideShareCost === 600 && cats.companyUsageCost === 0, false);
});
