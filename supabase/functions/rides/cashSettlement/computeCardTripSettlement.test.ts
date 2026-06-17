import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCardTripSettlement } from "./computeCardTripSettlement.ts";

Deno.test("computeCardTripSettlement no wallet charges full fare to card", () => {
  const r = computeCardTripSettlement({
    fareMinor: 1000,
    riderWalletAvailableMinor: 0,
  });
  assertEquals(r.fare_minor, 1000);
  assertEquals(r.wallet_paid_minor, 0);
  assertEquals(r.card_charge_minor, 1000);
});

Deno.test("computeCardTripSettlement partial wallet reduces card charge", () => {
  const r = computeCardTripSettlement({
    fareMinor: 1000,
    riderWalletAvailableMinor: 300,
  });
  assertEquals(r.wallet_paid_minor, 300);
  assertEquals(r.card_charge_minor, 700);
});

Deno.test("computeCardTripSettlement full wallet coverage skips card charge", () => {
  const r = computeCardTripSettlement({
    fareMinor: 1000,
    riderWalletAvailableMinor: 5000,
  });
  assertEquals(r.wallet_paid_minor, 1000);
  assertEquals(r.card_charge_minor, 0);
});
