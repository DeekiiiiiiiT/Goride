import { assertEquals } from "jsr:@std/assert";
import {
  buildFuelSealAmountsByDriver,
  isSuspiciousFuelRebuild,
  pickFuelCloseAmounts,
  type FuelCloseAmounts,
} from "./fuel_close_amounts.ts";

const rebuild = (partial: Partial<FuelCloseAmounts>): FuelCloseAmounts => ({
  driverShare: 0,
  companyShare: 0,
  totalSpend: 0,
  miscellaneousCost: 0,
  source: "fuel_week_rebuild",
  ...partial,
});

const periodFallback = (): FuelCloseAmounts => ({
  driverShare: 1.23,
  companyShare: 4.56,
  totalSpend: 0,
  miscellaneousCost: 0,
  source: "period_columns",
});

Deno.test("pickFuelCloseAmounts prefers override over divergent rebuild", () => {
  const picked = pickFuelCloseAmounts({
    override: { driverShare: 100, companyShare: 50, totalSpend: 150, miscellaneousCost: 0 },
    fromKv: rebuild({ driverShare: 999, companyShare: 1, source: "finalized_report" }),
    fromRebuild: rebuild({ driverShare: 0, companyShare: 999 }),
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "consumption_strip");
  assertEquals(picked.driverShare, 100);
  assertEquals(picked.companyShare, 50);
});

Deno.test("pickFuelCloseAmounts prefers finalized KV with real driver share over rebuild", () => {
  const picked = pickFuelCloseAmounts({
    fromKv: {
      driverShare: 82.5,
      companyShare: 17.5,
      totalSpend: 100,
      miscellaneousCost: 0,
      source: "finalized_report",
    },
    fromRebuild: rebuild({ driverShare: 10, companyShare: 90 }),
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "finalized_report");
  assertEquals(picked.driverShare, 82.5);
});

Deno.test("pickFuelCloseAmounts prefers consumption history over rebuild", () => {
  const picked = pickFuelCloseAmounts({
    fromConsumption: {
      driverShare: 40,
      companyShare: 60,
      totalSpend: 100,
      miscellaneousCost: 0,
      source: "consumption_strip",
    },
    fromRebuild: rebuild({ driverShare: 1, companyShare: 99 }),
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "consumption_strip");
  assertEquals(picked.driverShare, 40);
});

Deno.test("pickFuelCloseAmounts skips suspicious $0-driver rebuild when KV exists", () => {
  const picked = pickFuelCloseAmounts({
    fromKv: {
      driverShare: 0,
      companyShare: 5,
      totalSpend: 5,
      miscellaneousCost: 0,
      source: "finalized_report",
    },
    fromRebuild: rebuild({ driverShare: 0, companyShare: 500 }),
    periodFallback: periodFallback(),
  });
  assertEquals(picked.source, "finalized_report");
  assertEquals(picked.companyShare, 5);
});

Deno.test("isSuspiciousFuelRebuild detects $0 driver + company invent", () => {
  assertEquals(isSuspiciousFuelRebuild(rebuild({ driverShare: 0, companyShare: 100 })), true);
  assertEquals(isSuspiciousFuelRebuild(rebuild({ driverShare: 10, companyShare: 90 })), false);
});

Deno.test("buildFuelSealAmountsByDriver maps finalize snapshots for force seal", () => {
  const byDriver = buildFuelSealAmountsByDriver([
    {
      driverId: "d1",
      driverShare: 82.5,
      companyShare: 17.5,
      totalGasCardCost: 100,
      miscellaneousCost: 2,
    },
    { driverId: "", driverShare: 1 },
    null,
  ]);
  assertEquals(byDriver, {
    d1: {
      driverShare: 82.5,
      companyShare: 17.5,
      totalSpend: 100,
      miscellaneousCost: 2,
    },
  });
});
