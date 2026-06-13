import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";
import { assertJournalBalanced } from "./buildJournalEntries.ts";
import { buildSettlementJournalV2 } from "./buildSettlementJournalV2.ts";

Deno.test("buildSettlementJournalV2 overpay with sufficient digital", () => {
  const computed = computeCashSettlementOutcome(137884, 150000);
  const { lines, walletDeltas, debtOpenedMinor } = buildSettlementJournalV2({
    computed,
    rideId: "ride-1",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 50000,
  });
  assertEquals(computed.change_credit_minor, 12116);
  assertEquals(walletDeltas.rider_credit_minor, 12116);
  assertEquals(walletDeltas.driver_digital_debit_minor, 12116);
  assertEquals(debtOpenedMinor, 0);
  assertJournalBalanced(lines);
});

Deno.test("buildSettlementJournalV2 overpay with insufficient digital opens debt", () => {
  const computed = computeCashSettlementOutcome(137884, 150000);
  const { lines, walletDeltas, debtOpenedMinor } = buildSettlementJournalV2({
    computed,
    rideId: "ride-1",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 5000,
  });
  assertEquals(walletDeltas.driver_digital_debit_minor, 5000);
  assertEquals(walletDeltas.driver_debt_opened_minor, 7116);
  assertEquals(debtOpenedMinor, 7116);
  assertJournalBalanced(lines);
});

Deno.test("buildSettlementJournalV2 exact pay allocates fare only", () => {
  const computed = computeCashSettlementOutcome(1000, 1000);
  const { lines, walletDeltas } = buildSettlementJournalV2({
    computed,
    rideId: "ride-1",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 0,
  });
  assertEquals(walletDeltas.rider_credit_minor, 0);
  assertEquals(walletDeltas.fare_allocated_minor, 1000);
  assertJournalBalanced(lines);
});

Deno.test("buildSettlementJournalV2 underpay records arrears", () => {
  const computed = computeCashSettlementOutcome(1000, 600);
  const { lines } = buildSettlementJournalV2({
    computed,
    rideId: "ride-1",
    currency: "JMD",
    riderUserId: "rider-1",
    driverUserId: "driver-1",
    digitalAvailableMinor: 0,
  });
  assertEquals(lines.some((l) => l.entry_type === "cash_trip_arrears"), true);
  assertJournalBalanced(lines);
});
