import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cashReceivedMinorFromTripRow } from "./cashInHand.ts";

Deno.test("cashReceivedMinorFromTripRow uses cash_received column", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
      cash_received_minor: 100000,
    }),
    100000,
  );
});

Deno.test("cashReceivedMinorFromTripRow reads settlement snapshot", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
      cash_settlement_snapshot: { cash_received_minor: 100000 },
    }),
    100000,
  );
});

Deno.test("cashReceivedMinorFromTripRow is zero without settlement data", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "cash",
    }),
    0,
  );
});

Deno.test("cashReceivedMinorFromTripRow ignores card trips", () => {
  assertEquals(
    cashReceivedMinorFromTripRow({
      status: "completed",
      payment_method: "card",
      cash_received_minor: 100000,
    }),
    0,
  );
});
