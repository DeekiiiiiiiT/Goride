import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  abandonMoment,
  audienceAllows,
  canReplaceReceipt,
  faultChargeLine,
  lastClaimer,
  merchantFaultJournal,
  partnerConversionBlocked,
  pickStatementTask,
  purchaseRecording,
  readyStatusAllowed,
  receiptFollowsAbandon,
  refundMissingTask,
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
  assertEquals(canReplaceReceipt({ state: "placing", claimedBy: "buyer", actorId: "buyer", lastClaimerId: "buyer", isOps: false }), true);
  assertEquals(canReplaceReceipt({ state: "placed_external", claimedBy: "buyer", actorId: "buyer", lastClaimerId: "buyer", isOps: false }), false);
  assertEquals(canReplaceReceipt({ state: "abandoned", claimedBy: null, actorId: "stranger", lastClaimerId: "buyer", isOps: false }), false);
  assertEquals(canReplaceReceipt({ state: "abandoned", claimedBy: null, actorId: "buyer", lastClaimerId: "buyer", isOps: false }), true);
  assertEquals(canReplaceReceipt({ state: "abandoned", claimedBy: null, actorId: "ops", lastClaimerId: "buyer", isOps: true }), true);
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
  assertEquals(expectedCostMinor([{ quantity: 1, in_store_price: 1200, modifiers: [{ name: "Large", priceAdjustment: 200 }] }]), { ok: true, cost: 120000 });
  assertEquals(expectedCostMinor([{ quantity: 1, price: 10 }]).ok, false);
  assertEquals(pickupName("1042"), "Roam 1042");
});

Deno.test("a timed-out purchase cannot be retried or booked by a stranger", () => {
  const events = [
    { to_state: "claimed", actor_id: "buyer", at: "2026-10-11T15:00:00.000Z", payload: { actor_email: "buyer@roam.app" } },
    { to_state: "placing", actor_id: "buyer", at: "2026-10-11T15:01:00.000Z", payload: { actor_email: "buyer@roam.app" } },
    { to_state: "abandoned", actor_id: "ops", at: "2026-10-11T15:20:00.000Z" },
  ];
  assertEquals(lastClaimer(events)?.id, "buyer");
  assertEquals(lastClaimer(events)?.email, "buyer@roam.app");
  assertEquals(purchaseRecording({ state: "exception_purchase_unknown", actorId: "buyer", claimedBy: "buyer", lastClaimerId: "buyer", isOps: false }), "normal");
  assertEquals(purchaseRecording({ state: "queued", actorId: "buyer", claimedBy: null, lastClaimerId: "buyer", isOps: false }), "writeoff");
  assertEquals(purchaseRecording({ state: "abandoned", actorId: "stranger", claimedBy: null, lastClaimerId: "buyer", isOps: false }), "denied");
  assertEquals(purchaseRecording({ state: "abandoned", actorId: "ops", claimedBy: null, lastClaimerId: "buyer", isOps: true }), "writeoff");
  const abandonedAt = abandonMoment(events);
  assertEquals(receiptFollowsAbandon("2026-10-11T15:10:00.000Z", abandonedAt), false);
  assertEquals(receiptFollowsAbandon("2026-10-11T15:21:00.000Z", abandonedAt), true);
  const now = new Date("2026-10-11T15:30:00.000Z");
  assertEquals(refundMissingTask("2026-10-11T15:19:00.000Z", now, "skipped"), true);
  assertEquals(refundMissingTask("2026-10-11T15:21:00.000Z", now, "skipped"), false);
  assertEquals(refundMissingTask("2026-10-11T15:25:00.000Z", now, "skipped"), false);
  assertEquals(refundMissingTask("2026-10-11T15:00:00.000Z", now, "created"), false);
});

Deno.test("a staff-and-friends store is hidden from everyone else", () => {
  assertEquals(audienceAllows("beta", false), false);
  assertEquals(audienceAllows("beta", true), true);
  assertEquals(audienceAllows("public", false), true);
});

Deno.test("an In-House fault charge stays with Roam", () => {
  const line = faultChargeLine(true, "merchant-1", 5000);
  assertEquals(line.kind, "platform_cost");
  assertEquals(line.component, "procurement_refund");
  assertEquals(faultChargeLine(false, "merchant-1", 5000).kind, "merchant_receivable");
  assertEquals(merchantFaultJournal(true, "merchant-1", 5000), null);
  assertEquals(merchantFaultJournal(false, "merchant-1", 5000)?.length, 2);
});
