import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertCanEnableAcceptingOrders,
  canEnableAcceptingOrders,
  PAYOUT_NOT_READY_CODE,
} from "./merchantPayoutGate.ts";

const base = {
  is_accepting_orders: false,
  payout_ready: false,
  is_test_merchant: false,
};

Deno.test("canEnableAcceptingOrders allows pause without payout", () => {
  assertEquals(canEnableAcceptingOrders({ ...base, is_accepting_orders: true }, false), true);
});

Deno.test("canEnableAcceptingOrders allows no-op when already accepting", () => {
  assertEquals(canEnableAcceptingOrders({ ...base, is_accepting_orders: true }, true), true);
});

Deno.test("canEnableAcceptingOrders blocks real merchant without payout_ready", () => {
  assertEquals(canEnableAcceptingOrders(base, true), false);
});

Deno.test("canEnableAcceptingOrders allows test merchant", () => {
  assertEquals(canEnableAcceptingOrders({ ...base, is_test_merchant: true }, true), true);
});

Deno.test("canEnableAcceptingOrders allows payout_ready merchant", () => {
  assertEquals(canEnableAcceptingOrders({ ...base, payout_ready: true }, true), true);
});

Deno.test("canEnableAcceptingOrders admin bypass", () => {
  assertEquals(canEnableAcceptingOrders(base, true, { adminBypass: true }), true);
});

Deno.test("assertCanEnableAcceptingOrders returns structured 403", () => {
  const result = assertCanEnableAcceptingOrders(base, true);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 403);
    assertEquals(result.body.code, PAYOUT_NOT_READY_CODE);
  }
});
