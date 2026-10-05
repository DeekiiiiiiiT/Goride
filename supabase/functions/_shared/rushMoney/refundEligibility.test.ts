import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertRefundAmount, orderRefundState, refundableRemaining } from "./refundEligibility.ts";

Deno.test("full pending refund leaves nothing new to create", () => {
  const eligible = refundableRemaining(2000, [
    { id: "a", amount: 2000, status: "pending" },
  ]);
  assertEquals(eligible, 0);
});

Deno.test("retry ignores its own pending row", () => {
  const eligible = refundableRemaining(2000, [
    { id: "a", amount: 2000, status: "pending" },
  ], { ignoreRefundId: "a" });
  assertEquals(eligible, 2000);
});

Deno.test("partial pending still blocks a second copy of itself", () => {
  const eligible = refundableRemaining(2000, [
    { id: "a", amount: 800, status: "pending" },
  ]);
  assertEquals(eligible, 1200);
  assertEquals(assertRefundAmount(800, eligible), null);
  assertEquals(assertRefundAmount(1201, eligible) != null, true);
});

Deno.test("failed refunds do not consume the capture", () => {
  assertEquals(refundableRemaining(100, [{ amount: 100, status: "failed" }]), 100);
});

Deno.test("a second full refund of the same charge is refused", () => {
  const captured = 2716.2;
  const rows = [
    { id: "first", amount: captured, status: "pending" },
    { id: "second", amount: captured, status: "pending" },
  ];
  const room = refundableRemaining(captured, rows, { ignoreRefundId: "second" });
  assertEquals(room, 0);
  assertEquals(assertRefundAmount(captured, room) != null, true);
});

Deno.test("an extra charge refund does not mark the order refunded", () => {
  assertEquals(orderRefundState({
    refundKind: "duplicate",
    primaryCaptured: 2622,
    primaryRefunded: 0,
  }), "unchanged");
  const primaryRoom = refundableRemaining(2622, []);
  assertEquals(primaryRoom, 2622);
  assertEquals(orderRefundState({
    refundKind: "primary",
    primaryCaptured: 2622,
    primaryRefunded: 2622,
  }), "refunded");
});
