import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeSplitSettlement } from "./computeSplitSettlement.ts";

Deno.test("computeSplitSettlement flag OFF matches legacy underpay", () => {
  const r = computeSplitSettlement({
    owedMinor: 189915,
    cashReceivedMinor: 120000,
    riderWalletAvailableMinor: 999999,
    splitEnabled: false,
  });
  assertEquals(r.storedOutcome, "underpay");
  assertEquals(r.arrears_minor, 69915);
  assertEquals(r.wallet_paid_minor, 0);
});

Deno.test("computeSplitSettlement full wallet coverage", () => {
  const r = computeSplitSettlement({
    owedMinor: 189915,
    cashReceivedMinor: 120000,
    riderWalletAvailableMinor: 69915,
    splitEnabled: true,
  });
  assertEquals(r.storedOutcome, "split");
  assertEquals(r.wallet_paid_minor, 69915);
  assertEquals(r.rider_arrears_minor, 0);
  assertEquals(r.platform_guarantee_minor, 0);
  assertEquals(r.driver_digital_credit_minor, 69915);
  assertEquals(r.cash_received_minor + r.wallet_paid_minor + r.platform_guarantee_minor, 189915);
});

Deno.test("computeSplitSettlement zero wallet platform guarantee", () => {
  const r = computeSplitSettlement({
    owedMinor: 189915,
    cashReceivedMinor: 120000,
    riderWalletAvailableMinor: 0,
    splitEnabled: true,
  });
  assertEquals(r.storedOutcome, "split");
  assertEquals(r.wallet_paid_minor, 0);
  assertEquals(r.rider_arrears_minor, 69915);
  assertEquals(r.platform_guarantee_minor, 69915);
  assertEquals(r.driver_digital_credit_minor, 69915);
});

Deno.test("computeSplitSettlement partial wallet", () => {
  const r = computeSplitSettlement({
    owedMinor: 100000,
    cashReceivedMinor: 60000,
    riderWalletAvailableMinor: 25000,
    splitEnabled: true,
  });
  assertEquals(r.storedOutcome, "split");
  assertEquals(r.wallet_paid_minor, 25000);
  assertEquals(r.rider_arrears_minor, 15000);
  assertEquals(r.platform_guarantee_minor, 15000);
  assertEquals(r.driver_digital_credit_minor, 40000);
});

Deno.test("computeSplitSettlement exact unchanged", () => {
  const r = computeSplitSettlement({
    owedMinor: 100000,
    cashReceivedMinor: 100000,
    riderWalletAvailableMinor: 50000,
    splitEnabled: true,
  });
  assertEquals(r.storedOutcome, "exact");
});
