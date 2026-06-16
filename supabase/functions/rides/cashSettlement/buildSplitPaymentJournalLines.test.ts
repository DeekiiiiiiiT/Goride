import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertJournalBalanced } from "./buildJournalEntries.ts";
import { buildSplitPaymentJournalLines } from "./buildSplitPaymentJournalLines.ts";
import { computeSplitSettlement } from "./computeSplitSettlement.ts";

Deno.test("buildSplitPaymentJournalLines full wallet split trip", () => {
  const split = computeSplitSettlement({
    owedMinor: 189915,
    cashReceivedMinor: 120000,
    riderWalletAvailableMinor: 69915,
    splitEnabled: true,
  });
  const { lines } = buildSplitPaymentJournalLines({
    split,
    rideId: "ride-split-1",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 0,
  });
  assertEquals(lines.some((l) => l.entry_type === "cash_trip_collection"), true);
  assertEquals(lines.some((l) => l.entry_type === "fare_allocation_from_cash"), true);
  assertEquals(lines.some((l) => l.entry_type === "wallet_fare_from_rider"), true);
  assertEquals(lines.some((l) => l.entry_type === "wallet_fare_to_driver"), true);
  assertEquals(lines.some((l) => l.entry_type === "cash_trip_arrears"), false);
  const walletFromRider = lines.find((l) => l.entry_type === "wallet_fare_from_rider");
  assertEquals(walletFromRider?.amount_minor, 69915);
  assertJournalBalanced(lines);
});

Deno.test("buildSplitPaymentJournalLines platform guarantee when no wallet", () => {
  const split = computeSplitSettlement({
    owedMinor: 189915,
    cashReceivedMinor: 120000,
    riderWalletAvailableMinor: 0,
    splitEnabled: true,
  });
  const { lines } = buildSplitPaymentJournalLines({
    split,
    rideId: "ride-split-2",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 0,
  });
  assertEquals(lines.some((l) => l.entry_type === "platform_fare_guarantee"), true);
  assertEquals(lines.some((l) => l.entry_type === "cash_trip_arrears"), true);
  assertJournalBalanced(lines);
});
