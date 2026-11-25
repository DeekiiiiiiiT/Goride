import { assertEquals } from "jsr:@std/assert@1";
import { approveRefusal, rejectRefusal } from "./fuel_review_guards.ts";

const fill = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  status: "Pending",
  category: "Fuel",
  amount: -1500,
  metadata: meta,
  ...over,
});

Deno.test("RQ-01 approve: a normal fill with a total goes ahead", () => {
  assertEquals(approveRefusal(fill()), null);
});

Deno.test("RQ-01 approve: no total is refused", () => {
  assertEquals(approveRefusal(fill({ amount: 0 }))?.code, "NO_TOTAL");
});

Deno.test("RQ-01 approve: total kept in metadata.totalCost counts", () => {
  assertEquals(approveRefusal(fill({ amount: 0 }, { totalCost: 900 })), null);
});

Deno.test("RQ-01 approve: split cash settled at 0 by the statement goes ahead", () => {
  assertEquals(approveRefusal(fill({ amount: 0 }, { splitReconciled: true, fillGroupId: "g1" })), null);
});

Deno.test("RQ-01 approve: phone fill still being read is refused", () => {
  assertEquals(approveRefusal(fill({}, { photoReadStatus: "waiting" }))?.code, "PHOTO_NOT_READ");
  assertEquals(approveRefusal(fill({}, { photoReadStatus: "needs_look" }))?.code, "PHOTO_NOT_READ");
});

Deno.test("RQ-01 approve: phone fill already read goes ahead", () => {
  assertEquals(approveRefusal(fill({}, { photoReadStatus: "read" })), null);
});

Deno.test("RQ-01 approve: cash half waiting on the statement is refused", () => {
  assertEquals(approveRefusal(fill({}, { awaitingCashStatement: true }))?.code, "SPLIT_CASH_AWAITING_STATEMENT");
});

Deno.test("RQ-03 approve: already approved or rejected is refused", () => {
  assertEquals(approveRefusal(fill({ status: "Approved" }))?.code, "NOT_PENDING");
  assertEquals(approveRefusal(fill({ status: "Rejected" }))?.code, "NOT_PENDING");
  assertEquals(approveRefusal(fill({ status: "Approving" }))?.code, "NOT_PENDING");
});

Deno.test("RQ-01 approve: non-fuel expenses skip the fuel checks", () => {
  assertEquals(approveRefusal(fill({ category: "Tolls", amount: 0 })), null);
});

Deno.test("RQ-03 reject: already approved is refused", () => {
  assertEquals(rejectRefusal(fill({ status: "Approved" }), "blurry")?.code, "NOT_PENDING");
});

Deno.test("RQ-11 reject: blank reason is refused, a reason goes ahead", () => {
  assertEquals(rejectRefusal(fill(), "")?.status, 400);
  assertEquals(rejectRefusal(fill(), "   ")?.code, "REASON_REQUIRED");
  assertEquals(rejectRefusal(fill(), undefined)?.code, "REASON_REQUIRED");
  assertEquals(rejectRefusal(fill(), "Receipt is for another car"), null);
});

Deno.test("CR-06 approve: a phone fill with no odometer is refused, unless a reading is given", () => {
  assertEquals(approveRefusal(fill({ odometer: 0 }, { captureId: "c1", photoReadStatus: "read" }))?.code, "NO_ODOMETER");
  assertEquals(approveRefusal(fill({ odometer: 0 }, { captureId: "c1", photoReadStatus: "read" }), 200500), null);
  assertEquals(approveRefusal(fill({ odometer: 200500 }, { captureId: "c1", photoReadStatus: "read" })), null);
});

Deno.test("CR-06 approve: old-app fills without a captureId are unchanged (no odometer check)", () => {
  assertEquals(approveRefusal(fill({ odometer: 0 })), null);
});
