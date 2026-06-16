import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertJournalBalanced } from "./buildJournalEntries.ts";
import { buildCardTripJournalLines } from "./buildCardTripJournal.ts";

Deno.test("buildCardTripJournalLines credits driver digital from platform clearing", () => {
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-1",
    currency: "JMD",
    driverUserId: "driver-1",
    fareMinor: 62320,
  });
  assertEquals(lines.length, 1);
  assertEquals(lines[0].entry_type, "card_trip_digital_credit");
  assertEquals(lines[0].amount_minor, 62320);
  assertEquals(lines[0].debit_account_key, "platform:clearing");
  assertEquals(lines[0].credit_account_key, "user:driver-1:driver:digital");
  assertJournalBalanced(lines);
});

Deno.test("buildCardTripJournalLines returns empty for zero fare", () => {
  const lines = buildCardTripJournalLines({
    rideId: "ride-card-1",
    currency: "JMD",
    driverUserId: "driver-1",
    fareMinor: 0,
  });
  assertEquals(lines.length, 0);
});
