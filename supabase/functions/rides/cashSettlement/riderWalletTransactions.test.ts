import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { riderWalletTransactionTitle } from "../../_shared/paymentAccounts.ts";

Deno.test("riderWalletTransactionTitle maps card trip charge for rider", () => {
  assertEquals(
    riderWalletTransactionTitle("card_trip_digital_credit", { funded_from: "card" }),
    "Trip paid by card",
  );
});

Deno.test("riderWalletTransactionTitle maps Lynk card trip", () => {
  assertEquals(
    riderWalletTransactionTitle("card_trip_digital_credit", { payment_source: "demo_lynk" }),
    "Trip paid with Lynk",
  );
});

Deno.test("riderWalletTransactionTitle maps wallet fare debit", () => {
  assertEquals(
    riderWalletTransactionTitle("wallet_fare_from_rider"),
    "Trip paid from wallet",
  );
});

Deno.test("riderWalletTransactionTitle maps card shortfall payment", () => {
  assertEquals(
    riderWalletTransactionTitle("card_shortfall_payment", {}),
    "Arrears paid by card",
  );
});

Deno.test("riderWalletTransactionTitle maps arrears paid from wallet", () => {
  assertEquals(
    riderWalletTransactionTitle("card_shortfall_payment", { arrears_payment_source: "wallet" }),
    "Arrears paid from wallet",
  );
});
