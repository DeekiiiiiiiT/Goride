import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canReplaceReceipt,
  faultChargeLine,
  partnerConversionBlocked,
  pickStatementTask,
  readyStatusAllowed,
  slaLevel,
} from "./deskRules.ts";
import { expectedCostMinor, pickupName } from "./createTask.ts";

Deno.test("statement matching keeps identical charges apart", () => {
  const tasks = [
    { id: "older", placedAt: "2026-10-10T15:00:00.000Z", matched: false },
    { id: "newer", placedAt: "2026-10-11T15:00:00.000Z", matched: false },
    { id: "used", placedAt: "2026-10-09T15:00:00.000Z", matched: true },
  ];
  assertEquals(pickStatementTask(tasks, "2026-10-11")?.id, "older");
  assertEquals(pickStatementTask([{ id: "far", placedAt: "2026-09-01T15:00:00.000Z", matched: false }], "2026-10-11"), null);
});

Deno.test("placing warns at 7 minutes and pages at 15", () => {
  const start = "2026-10-11T15:00:00.000Z";
  assertEquals(slaLevel(start, new Date("2026-10-11T15:06:00.000Z"), false), "none");
  assertEquals(slaLevel(start, new Date("2026-10-11T15:08:00.000Z"), false), "warn");
  assertEquals(slaLevel(start, new Date("2026-10-11T15:08:00.000Z"), true), "none");
  assertEquals(slaLevel(start, new Date("2026-10-11T15:16:00.000Z"), true), "page");
});

Deno.test("ready, receipts, and partner conversion stay gated", () => {
  assertEquals(readyStatusAllowed("placed_external", "preparing"), true);
  assertEquals(readyStatusAllowed("placing", "preparing"), false);
  assertEquals(canReplaceReceipt("placing", "buyer", "buyer"), true);
  assertEquals(canReplaceReceipt("placed_external", "buyer", "buyer"), false);
  assertEquals(partnerConversionBlocked({
    ownerId: "owner",
    teamCount: 0,
    payableHistory: false,
    openOrders: 0,
    procurementMode: "partner",
  }), "This restaurant already has an owner");
  assertEquals(partnerConversionBlocked({
    ownerId: null,
    teamCount: 0,
    payableHistory: false,
    openOrders: 0,
    procurementMode: "in_house",
  }), null);
});

Deno.test("a missing restaurant price cannot be sold", () => {
  assertEquals(expectedCostMinor([{ quantity: 2, in_store_price: 10 }]), { ok: true, cost: 2000 });
  assertEquals(expectedCostMinor([{ quantity: 1, price: 10 }]).ok, false);
  assertEquals(pickupName("1042"), "Roam 1042");
});

Deno.test("an In-House fault charge stays with Roam", () => {
  const line = faultChargeLine(true, "merchant-1", 5000);
  assertEquals(line.kind, "platform_cost");
  assertEquals(line.component, "procurement_refund");
  assertEquals(faultChargeLine(false, "merchant-1", 5000).kind, "merchant_receivable");
});
