import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { riderWalletTransactionTitle } from "../../_shared/paymentAccounts.ts";
import {
  consolidateTripPayments,
  type RiderWalletTransactionRow,
} from "./riderWalletTransactions.ts";

Deno.test("riderWalletTransactionTitle maps card trip charge for rider", () => {
  assertEquals(
    riderWalletTransactionTitle("card_trip_digital_credit", { funded_from: "card" }),
    "Trip paid by card",
  );
});

Deno.test("consolidateTripPayments merges wallet and card for same ride", () => {
  const rows: RiderWalletTransactionRow[] = [
    {
      id: "j-wallet",
      kind: "journal",
      title: "Trip paid from wallet",
      amount_minor: 37680,
      currency: "JMD",
      date: "2026-06-16T19:32:00.000Z",
      is_credit: false,
      ride_request_id: "ride-1",
      entry_type: "wallet_fare_from_rider",
    },
    {
      id: "j-card",
      kind: "journal",
      title: "Trip paid by card",
      amount_minor: 100198,
      currency: "JMD",
      date: "2026-06-16T19:32:01.000Z",
      is_credit: false,
      ride_request_id: "ride-1",
      entry_type: "card_trip_digital_credit",
    },
    {
      id: "j-other",
      kind: "journal",
      title: "Change paid from digital wallet",
      amount_minor: 37680,
      currency: "JMD",
      date: "2026-06-16T17:24:00.000Z",
      is_credit: true,
      ride_request_id: null,
      entry_type: "change_paid_from_digital",
    },
  ];

  const result = consolidateTripPayments(rows);
  assertEquals(result.length, 2);

  const tripPayment = result.find((row) => row.entry_type === "trip_payment");
  assertEquals(tripPayment?.title, "Trip payment");
  assertEquals(tripPayment?.amount_minor, 137878);
  assertEquals(tripPayment?.breakdown?.length, 2);
  assertEquals(tripPayment?.breakdown?.[0].label, "Wallet");
  assertEquals(tripPayment?.breakdown?.[1].label, "Card");
});

Deno.test("consolidateTripPayments leaves single-method trip unchanged", () => {
  const rows: RiderWalletTransactionRow[] = [{
    id: "j-card-only",
    kind: "journal",
    title: "Trip paid by card",
    amount_minor: 50000,
    currency: "JMD",
    date: "2026-06-16T18:00:00.000Z",
    is_credit: false,
    ride_request_id: "ride-2",
    entry_type: "card_trip_digital_credit",
  }];

  const result = consolidateTripPayments(rows);
  assertEquals(result.length, 1);
  assertEquals(result[0].entry_type, "card_trip_digital_credit");
});
