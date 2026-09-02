import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldEvaluateForgottenRule } from "./forgottenOrderRule.ts";

Deno.test("R1 triggers for never_arrived with long courier wait", () => {
  assertEquals(shouldEvaluateForgottenRule("never_arrived", "preparing", 25), true);
});

Deno.test("R1 does not trigger before wait threshold", () => {
  assertEquals(shouldEvaluateForgottenRule("never_arrived", "preparing", 10), false);
});

Deno.test("R1 does not trigger after delivery", () => {
  assertEquals(shouldEvaluateForgottenRule("never_arrived", "delivered", 30), false);
});
