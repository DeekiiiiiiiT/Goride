/**
 * Keep in sync with apps/fleet/src/utils/fuelLogSummaryCore.test.ts
 * Same fixture + expected totals — if this suite and the fleet vitest diverge, the mirrors drifted.
 */
import { assertEquals } from "jsr:@std/assert";
import { summarizeFuelLogEntries } from "./fuel_log_summary.ts";

function makeEntry(partial: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return {
    date: "2026-08-24",
    amount: 100,
    liters: 10,
    type: "Manual_Entry",
    entryMode: "Floating",
    paymentSource: "RideShare_Cash",
    ...partial,
  };
}

/** Literal copy of fleet FIXTURE — do not "improve" without updating the vitest twin. */
const FIXTURE = [
  makeEntry({
    id: "f1",
    vehicleId: "v1",
    date: "2026-08-20",
    amount: 100,
    liters: 10,
    odometer: 1000,
    entrySource: "driver-portal",
  }),
  makeEntry({
    id: "f2",
    vehicleId: "v1",
    date: "2026-08-21",
    amount: 50,
    liters: 5,
    odometer: 1100,
    type: "Fuel_Manual_Entry",
    metadata: { source: "Fuel Log" },
  }),
  makeEntry({
    id: "fee",
    vehicleId: "v1",
    date: "2026-08-21",
    amount: 5,
    liters: 0,
    metadata: { jaaRowKind: "fee", importSource: "jaa_raw" },
  }),
  makeEntry({
    id: "await",
    vehicleId: "v1",
    date: "2026-08-22",
    amount: 0,
    liters: 0,
    odometer: 1200,
    paymentSource: "Gas_Card",
    type: "Card_Transaction",
    metadata: { awaitingCardStatement: true },
  }),
  makeEntry({
    id: "anchor",
    vehicleId: "v1",
    date: "2026-08-23",
    amount: 80,
    liters: 8,
    odometer: 1300,
    entryMode: "Anchor",
    entrySource: "admin-manual",
  }),
];

Deno.test("server core matches fleet contract fixture", () => {
  const core = summarizeFuelLogEntries(FIXTURE as any);
  assertEquals(core.totalFills, 4);
  assertEquals(core.totalSpend, 230);
  assertEquals(core.totalVolume, 23);
  assertEquals(core.totalKm, 300);
  assertEquals(core.sourcePortal, 1);
  assertEquals(core.sourceAdmin, 2);
  assertEquals(core.sourceAnchors, 1);
});

Deno.test("excludes JAA fee from fills and awaiting from spend", () => {
  const core = summarizeFuelLogEntries(FIXTURE as any);
  assertEquals(core.totalFills, 4);
  assertEquals(core.totalSpend, 230);
  assertEquals(core.totalVolume, 23);
  assertEquals(core.totalKm, 300);
  assertEquals(core.sourceAnchors, 1);
});

Deno.test("never uses cycle-distance semantics for totalKm", () => {
  const core = summarizeFuelLogEntries(FIXTURE as any);
  assertEquals(core.totalKm, 300);
});
