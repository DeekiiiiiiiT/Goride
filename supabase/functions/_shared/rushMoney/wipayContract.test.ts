import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { wipayAmountMatches, wipayCurrencyOk, wipayStatusAccepted } from "./wipayContract.ts";

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
