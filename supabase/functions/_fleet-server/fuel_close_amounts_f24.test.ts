/**
 * F-24 / done-test 15: a v3 week's fuel statement = the sum of its current lines, nothing else.
 * A v2.2 week (no lines) keeps the old preference chain unchanged.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  amountsFromFuelLines,
  pickFuelCloseAmounts,
  type FuelCloseAmounts,
} from "./fuel_close_amounts.ts";

const lines = [
  // Kenny, current: trips + pickups + personal (J$5,648.20 driver, as in the Stitch sample shape)
  { driver_id: "kenny", driver_amount_minor: 400000, company_amount_minor: 1600000, reversed_at: null },
  { driver_id: "kenny", driver_amount_minor: 124820, company_amount_minor: 124820, reversed_at: null },
  { driver_id: "kenny", driver_amount_minor: 40000, company_amount_minor: 0, reversed_at: null },
  // Kenny, reversed by a reopen: never counts.
  { driver_id: "kenny", driver_amount_minor: 999900, company_amount_minor: 1, reversed_at: "2026-11-24T10:00:00Z" },
  // Another driver.
  { driver_id: "other", driver_amount_minor: 1000, company_amount_minor: 4000, reversed_at: null },
];

const kv: FuelCloseAmounts = {
  driverShare: 1, companyShare: 2, totalSpend: 3, miscellaneousCost: 0, source: "finalized_report",
};
const rebuild: FuelCloseAmounts = {
  driverShare: 7, companyShare: 8, totalSpend: 15, miscellaneousCost: 0, source: "fuel_week_rebuild",
};
const period: FuelCloseAmounts = {
  driverShare: 9, companyShare: 9, totalSpend: 0, miscellaneousCost: 0, source: "period_columns",
};

Deno.test("F-24: statement = sum of the driver's current lines; reversed lines ignored", () => {
  const a = amountsFromFuelLines(lines, "kenny");
  assertEquals(a.source, "fuel_week_lines");
  assertEquals(Math.round(a.driverShare * 100), 564820);
  assertEquals(Math.round(a.companyShare * 100), 1724820);
  assertEquals(Math.round(a.totalSpend * 100), 564820 + 1724820);
  assertEquals(a.miscellaneousCost, 0);
});

Deno.test("F-24: a driver with no line in a v3 week gets J$0, not an old-source amount", () => {
  const a = amountsFromFuelLines(lines, "nobody");
  assertEquals([a.driverShare, a.companyShare, a.totalSpend], [0, 0, 0]);
  assertEquals(a.source, "fuel_week_lines");
});

Deno.test("F-24: lines win over override, consumption strip, KV report, rebuild and period", () => {
  const picked = pickFuelCloseAmounts({
    fromLines: amountsFromFuelLines(lines, "kenny"),
    override: { driverShare: 123, companyShare: 456 },
    fromConsumption: { ...kv, source: "consumption_strip" },
    fromKv: kv,
    fromRebuild: rebuild,
    periodFallback: period,
  });
  assertEquals(picked.source, "fuel_week_lines");
  assertEquals(Math.round(picked.driverShare * 100), 564820);
});

Deno.test("F-24: a v2.2 week (no lines) keeps the old chain exactly", () => {
  assertEquals(pickFuelCloseAmounts({ fromKv: kv, fromRebuild: rebuild, periodFallback: period }).source, "finalized_report");
  assertEquals(pickFuelCloseAmounts({ fromRebuild: rebuild, periodFallback: period }).source, "fuel_week_rebuild");
  assertEquals(pickFuelCloseAmounts({ periodFallback: period }).source, "period_columns");
});

Deno.test("F-24: the seal never rebuilds a v3 week and closes from lines", async () => {
  const src = await Deno.readTextFile(new URL("./fuel_week_seal.ts", import.meta.url));
  assert(/if \(!v3Week\) \{\s*try \{\s*rebuilt = await amountsFromRebuild/.test(src), "rebuild guarded by !v3Week");
  assert(src.includes('"fuel_week_lines",'), "lines are a verified (closing) source");
  assert(src.includes("weekLines,"), "seal passes the week's lines to each driver");
  const probeGuard = src.indexOf("export async function loadFuelCloseRebuildMap(");
  const probeBody = src.slice(probeGuard, src.indexOf("\n}\n", probeGuard));
  assert(probeBody.includes("loadCurrentFuelWeekLines"), "probe map skips v3 weeks");
});
