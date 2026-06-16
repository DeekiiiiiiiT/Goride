import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCardShortfallJournalLines } from "./buildCardShortfallJournal.ts";

Deno.test("buildCardShortfallJournalLines returns empty array for zero shortfall", () => {
  const lines = buildCardShortfallJournalLines({
    rideId: "ride-123",
    riderUserId: "rider-456",
    driverUserId: "driver-789",
    shortfallMinor: 0,
    currency: "JMD",
    paymentMethodId: "visa_1212",
  });
  assertEquals(lines.length, 0);
});

Deno.test("buildCardShortfallJournalLines returns empty array for negative shortfall", () => {
  const lines = buildCardShortfallJournalLines({
    rideId: "ride-123",
    riderUserId: "rider-456",
    driverUserId: "driver-789",
    shortfallMinor: -100,
    currency: "JMD",
    paymentMethodId: "visa_1212",
  });
  assertEquals(lines.length, 0);
});

Deno.test("buildCardShortfallJournalLines creates correct journal line for positive shortfall", () => {
  const lines = buildCardShortfallJournalLines({
    rideId: "ride-123",
    riderUserId: "rider-456",
    driverUserId: "driver-789",
    shortfallMinor: 5000,
    currency: "JMD",
    paymentMethodId: "visa_1212",
  });

  assertEquals(lines.length, 1);

  const line = lines[0];
  assertEquals(line.entry_type, "card_shortfall_payment");
  assertEquals(line.debit_account_key, "platform:clearing");
  assertEquals(line.credit_account_key, "user:rider-456:rider");
  assertEquals(line.amount_minor, 5000);

  assertExists(line.metadata);
  assertEquals(line.metadata.ride_request_id, "ride-123");
  assertEquals(line.metadata.currency, "JMD");
  assertEquals(line.metadata.shortfall_minor, 5000);
  assertEquals(line.metadata.payment_method_id, "visa_1212");
  assertEquals(line.metadata.payment_source, "demo_card");
});

Deno.test("buildCardShortfallJournalLines credits rider account (clears arrears)", () => {
  const lines = buildCardShortfallJournalLines({
    rideId: "ride-123",
    riderUserId: "test-rider",
    driverUserId: "test-driver",
    shortfallMinor: 3000,
    currency: "JMD",
    paymentMethodId: "apple_pay",
  });

  assertEquals(lines.length, 1);

  const line = lines[0];
  assertEquals(line.credit_account_key, "user:test-rider:rider");
  assertEquals(line.amount_minor, 3000);
});
