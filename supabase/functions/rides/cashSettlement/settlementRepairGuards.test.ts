import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterLegacyRepairMissingLines,
  filterSplitRepairMissingLines,
  reconcileRiderShortfallDisplay,
  shouldSkipLegacySettlementRepair,
} from "./settlementRepairGuards.ts";
import type { JournalLineSpec } from "./buildJournalEntries.ts";

function line(entry_type: JournalLineSpec["entry_type"], amount = 100): JournalLineSpec {
  return {
    entry_type,
    debit_account_key: "a",
    credit_account_key: "b",
    amount_minor: amount,
    metadata: {},
  };
}

Deno.test("shouldSkipLegacySettlementRepair skips split outcome and split journal", () => {
  assertEquals(
    shouldSkipLegacySettlementRepair({ outcome: "split", existingTypes: new Set() }),
    true,
  );
  assertEquals(
    shouldSkipLegacySettlementRepair({
      outcome: "underpay",
      existingTypes: new Set(["wallet_fare_from_rider"]),
    }),
    true,
  );
  assertEquals(
    shouldSkipLegacySettlementRepair({
      outcome: "underpay",
      existingTypes: new Set(["cash_trip_arrears"]),
    }),
    false,
  );
});

Deno.test("filterLegacyRepairMissingLines blocks arrears when wallet fare exists", () => {
  const lines = [line("cash_trip_arrears", 11462)];
  const existing = new Set(["wallet_fare_from_rider", "cash_trip_collection"]);
  assertEquals(filterLegacyRepairMissingLines(lines, existing).length, 0);
});

Deno.test("filterSplitRepairMissingLines blocks wallet fare when arrears exists", () => {
  const lines = [
    line("wallet_fare_from_rider", 11462),
    line("wallet_fare_to_driver", 11462),
  ];
  const existing = new Set(["cash_trip_arrears", "cash_trip_collection"]);
  const filtered = filterSplitRepairMissingLines(lines, existing);
  assertEquals(filtered.some((l) => l.entry_type === "wallet_fare_from_rider"), false);
  assertEquals(filtered.some((l) => l.entry_type === "wallet_fare_to_driver"), true);
});

Deno.test("reconcileRiderShortfallDisplay fixes duplicate debit display", () => {
  const r = reconcileRiderShortfallDisplay({
    owedMinor: 81462,
    cashReceivedMinor: 70000,
    walletPaidMinor: 11462,
    arrearsMinor: 11462,
  });
  assertEquals(r.wallet_paid_minor, 11462);
  assertEquals(r.rider_arrears_minor, 0);
});
