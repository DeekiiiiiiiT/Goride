import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveArrearsPaymentMethod } from "./arrearsPaymentMethods.ts";

Deno.test("resolveArrearsPaymentMethod rejects cash", () => {
  assertEquals(resolveArrearsPaymentMethod("cash").valid, false);
  assertEquals(resolveArrearsPaymentMethod("").valid, false);
});

Deno.test("resolveArrearsPaymentMethod accepts demo cards", () => {
  const visa = resolveArrearsPaymentMethod("visa_1212");
  assertEquals(visa.valid, true);
  assertEquals(visa.paymentSource, "demo_card");
  assertEquals(visa.shortfallPaymentMethod, "card");
});

Deno.test("resolveArrearsPaymentMethod accepts Lynk", () => {
  const lynk = resolveArrearsPaymentMethod("lynk");
  assertEquals(lynk.valid, true);
  assertEquals(lynk.paymentSource, "demo_lynk");
  assertEquals(lynk.shortfallPaymentMethod, "lynk");
});

Deno.test("resolveArrearsPaymentMethod accepts saved prefixes", () => {
  const card = resolveArrearsPaymentMethod("saved_card_123");
  assertEquals(card.valid, true);
  assertEquals(card.paymentSource, "demo_card");

  const lynk = resolveArrearsPaymentMethod("saved_lynk_456");
  assertEquals(lynk.valid, true);
  assertEquals(lynk.paymentSource, "demo_lynk");
});

Deno.test("resolveArrearsPaymentMethod rejects unknown ids", () => {
  assertEquals(resolveArrearsPaymentMethod("bitcoin").valid, false);
});
