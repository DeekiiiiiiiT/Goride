import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deskInputsHash,
  expandWeekCoverage,
  requiredSourcesMissing,
  sortWeekList,
  weekDays,
  weekListEntry,
  weekListKpis,
} from "./recon_desk_shape.ts";

const label = (id: string) => id.toUpperCase();

Deno.test("weekDays: Monday to Sunday", () => {
  assertEquals(weekDays("2026-02-23"), [
    "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01",
  ]);
});

Deno.test("WRA-09: {week: status} spreads over the 7 days; day maps pass through", () => {
  const spread = expandWeekCoverage({ week: "covered" }, "2026-11-02");
  assertEquals(Object.keys(spread).length, 7);
  assertEquals(new Set(Object.values(spread)), new Set(["covered"]));
  const daily = { "2026-11-02": "covered", "2026-11-03": "missing" };
  assertEquals(expandWeekCoverage(daily, "2026-11-02"), daily);
  assertEquals(expandWeekCoverage(null, "2026-11-02"), {});
});

Deno.test("deskInputsHash does not depend on source order", () => {
  const a = deskInputsHash([{ id: "b", inputHash: "2" }, { id: "a", inputHash: "1" }]);
  const b = deskInputsHash([{ id: "a", inputHash: "1" }, { id: "b", inputHash: "2" }]);
  assertEquals(a, b);
});

Deno.test("requiredSourcesMissing counts only required sources not received", () => {
  assertEquals(requiredSourcesMissing([
    { requirement: "required", status: "missing" },
    { requirement: "required", status: "partial" },
    { requirement: "required", status: "waiting_external" },
    { requirement: "required", status: "received" },
    { requirement: "required", status: "waived" },
    { requirement: "optional", status: "missing" },
  ]), 3);
});

Deno.test("WRA-12/14/40: list order, KPIs and 'close earlier week first'", () => {
  const src = (id: string, status: string) => ({ id, requirement: "required", status, coverage: {} });
  const entries = sortWeekList([
    weekListEntry({ weekKey: "2026-10-19", state: "collecting", closedAt: null, closedBy: null, sources: [src("uber_bundle", "missing")], nextAction: null }, "rideshare", label),
    weekListEntry({ weekKey: "2026-09-07", state: "closed", closedAt: "2026-10-26", closedBy: "x", sources: [], nextAction: null }, "rideshare", label),
    weekListEntry({ weekKey: "2026-09-21", state: "collecting", closedAt: null, closedBy: null, sources: [src("indrive_trips", "missing"), src("uber_bundle", "received")], nextAction: null }, "rideshare", label),
    weekListEntry({ weekKey: "2026-10-12", state: "closed", closedAt: "2026-10-23", closedBy: "x", sources: [], nextAction: null }, "rideshare", label),
  ]);
  // Outstanding oldest first, then Reconciled newest first.
  assertEquals(entries.map((e) => e.weekKey), ["2026-09-21", "2026-10-19", "2026-10-12", "2026-09-07"]);
  assertEquals(entries[0].earlierOpenWeek, null);
  assertEquals(entries[1].earlierOpenWeek, "2026-09-21");
  assertEquals(entries[2].earlierOpenWeek, null);
  assertEquals(entries[0].nextAction.label, "Provide INDRIVE_TRIPS");
  assertEquals(entries[0].blockers, entries[0].requiredSourcesMissing);

  const kpis = weekListKpis(entries);
  assertEquals(kpis.openWeeks, 2);
  assertEquals(kpis.reconciledWeeks, 2);
  assertEquals(kpis.requiredSourcesMissing, 2);
  assertEquals(kpis.oldestOpenWeek, "2026-09-21");
});

Deno.test("the desk's own next step wins over the source fallback", () => {
  const entry = weekListEntry({
    weekKey: "2026-09-21",
    state: "reconciling",
    closedAt: null,
    closedBy: null,
    sources: [],
    nextAction: { kind: "step", targetId: "fuel", label: "Fuel" },
  }, "rideshare", label);
  assertEquals(entry.nextAction.targetId, "fuel");
  assertEquals(entry.state, "reconciling");
});

Deno.test("Rev 24: Fuel has nothing to finalize only when every fuel file that applies is no activity / waived", async () => {
  const { fuelHasNothingToFinalize } = await import("./recon_desk_shape.ts");
  const s = (id: string, requirement: string, status: string) => ({ id, requirement, status });
  assertEquals(fuelHasNothingToFinalize([s("cash_fuel", "optional", "attested_none"), s("fuel_card_roam", "not_applicable", "not_applicable")]), true);
  assertEquals(fuelHasNothingToFinalize([s("cash_fuel", "optional", "attested_none"), s("fuel_card_roam", "required", "waived")]), true);
  assertEquals(fuelHasNothingToFinalize([s("cash_fuel", "optional", "attested_none"), s("fuel_card_roam", "required", "received")]), false);
  assertEquals(fuelHasNothingToFinalize([s("cash_fuel", "optional", "missing")]), false);
  assertEquals(fuelHasNothingToFinalize([s("fuel_card_roam", "not_applicable", "not_applicable"), s("uber_bundle", "required", "attested_none")]), false);
});

Deno.test("Rev 25: an upload's weeks — the week it was made for, else every Monday it touches", async () => {
  const { uploadWeekKeys } = await import("./recon_desk_shape.ts");
  assertEquals(uploadWeekKeys({ weekKey: "2026-03-16", coverageStart: "2026-03-16", coverageEnd: "2026-03-22" }), ["2026-03-16"]);
  assertEquals(uploadWeekKeys({ coverageStart: "2026-03-16", coverageEnd: "2026-03-22" }), ["2026-03-16"]);
  assertEquals(uploadWeekKeys({ coverageStart: "2026-10-13", coverageEnd: "2026-10-18" }), ["2026-10-12"]);
  assertEquals(uploadWeekKeys({ coverageStart: "2026-02-16", coverageEnd: "2026-02-26" }), ["2026-02-16", "2026-02-23"]);
  assertEquals(uploadWeekKeys({ coverageStart: null, coverageEnd: "2026-02-26" }), []);
});
