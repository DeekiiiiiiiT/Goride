import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertJournalBalanced } from "./buildJournalEntries.ts";
import { buildCardTripJournalLines } from "./buildCardTripJournal.ts";
import { computeCardTripSettlement } from "./computeCardTripSettlement.ts";

Deno.test("buildCardTripJournalLines credits driver digital from platform clearing", () => {
  const settlement = computeCardTripSettlement({
    fareMinor: 62320,
    riderWalletAvailableMinor: 0,
  });
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-1",
    currency: "JMD",
    driverUserId: "driver-1",
    riderUserId: "rider-1",
    settlement,
  });
  assertEquals(lines.length, 1);
  assertEquals(lines[0].entry_type, "card_trip_digital_credit");
  assertEquals(lines[0].amount_minor, 62320);
  assertEquals(lines[0].debit_account_key, "platform:clearing");
  assertEquals(lines[0].credit_account_key, "user:driver-1:driver:digital");
  assertJournalBalanced(lines);
});

Deno.test("buildCardTripJournalLines wallet first then card for remainder", () => {
  const settlement = computeCardTripSettlement({
    fareMinor: 1000,
    riderWalletAvailableMinor: 300,
  });
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-2",
    currency: "JMD",
    driverUserId: "driver-1",
    riderUserId: "rider-1",
    settlement,
  });
  assertEquals(lines.length, 3);
  assertEquals(lines.some((l) => l.entry_type === "wallet_fare_from_rider"), true);
  assertEquals(lines.some((l) => l.entry_type === "wallet_fare_to_driver"), true);
  assertEquals(lines.some((l) => l.entry_type === "card_trip_digital_credit"), true);
  const walletFromRider = lines.find((l) => l.entry_type === "wallet_fare_from_rider");
  const cardCredit = lines.find((l) => l.entry_type === "card_trip_digital_credit");
  assertEquals(walletFromRider?.amount_minor, 300);
  assertEquals(cardCredit?.amount_minor, 700);
  assertJournalBalanced(lines);
});

Deno.test("buildCardTripJournalLines wallet-only skips card charge", () => {
  const settlement = computeCardTripSettlement({
    fareMinor: 1000,
    riderWalletAvailableMinor: 5000,
  });
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-3",
    currency: "JMD",
    driverUserId: "driver-1",
    riderUserId: "rider-1",
    settlement,
  });
  assertEquals(lines.length, 2);
  assertEquals(lines.some((l) => l.entry_type === "card_trip_digital_credit"), false);
  assertJournalBalanced(lines);
});

Deno.test("buildCardTripJournalLines returns empty for zero fare", () => {
  const settlement = computeCardTripSettlement({
    fareMinor: 0,
    riderWalletAvailableMinor: 5000,
  });
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-1",
    currency: "JMD",
    driverUserId: "driver-1",
    riderUserId: "rider-1",
    settlement,
  });
  assertEquals(lines.length, 0);
});
