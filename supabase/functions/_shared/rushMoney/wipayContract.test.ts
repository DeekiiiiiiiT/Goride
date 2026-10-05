import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretRefundStatus, wipayAmountMatches, wipayCurrencyOk, wipayStatusAccepted } from "./wipayContract.ts";

Deno.test("only status=success is a capture", () => {
  assertEquals(wipayStatusAccepted("success"), true);
  assertEquals(wipayStatusAccepted("SUCCESS"), true);
  assertEquals(wipayStatusAccepted("1"), false);
  assertEquals(wipayStatusAccepted("true"), false);
  assertEquals(wipayStatusAccepted("paid"), false);
});

Deno.test("amount must match the intent", () => {
  assertEquals(wipayAmountMatches(2002.16, "2002.16"), true);
  assertEquals(wipayAmountMatches(2002.16, "10.00"), false);
  assertEquals(wipayAmountMatches(2002.16, ""), false);
  assertEquals(wipayCurrencyOk("jmd"), true);
  assertEquals(wipayCurrencyOk("USD"), false);
});

Deno.test("a stuck refund is paid, missing, or needs a person", () => {
  assertEquals(interpretRefundStatus(true, { status: "success" }), "paid");
  assertEquals(interpretRefundStatus(true, { status: "not_found" }), "missing");
  assertEquals(interpretRefundStatus(true, { found: false }), "missing");
  assertEquals(interpretRefundStatus(false, { status: "success" }), "unknown");
  assertEquals(interpretRefundStatus(true, { status: "pending" }), "unknown");
});
