import { assertEquals } from "jsr:@std/assert";
import {
  isCycleVolumeEligible,
  shouldSuppressFrequencyFlag,
  normalizeIntegrityStatus,
  mapIntegrityToSignalTier,
} from "./fuel_cycle_stamp.ts";

Deno.test("isCycleVolumeEligible excludes JAA statement ledger rows", () => {
  const row = {
    id: "s1",
    type: "Card_Transaction",
    metadata: { importSource: "jaa_raw" },
  };
  assertEquals(isCycleVolumeEligible(row), false);
});

Deno.test("isCycleVolumeEligible excludes linked gas-card admin anchor", () => {
  const row = {
    id: "a1",
    type: "Manual_Entry",
    paymentSource: "Gas_Card",
    liters: 0,
    metadata: { jaaMatchedStatementId: "s1", entryMode: "Anchor" },
  };
  assertEquals(isCycleVolumeEligible(row), false);
});

Deno.test("shouldSuppressFrequencyFlag for linked pairs", () => {
  const row = {
    id: "a1",
    metadata: { jaaMatchedStatementId: "s1" },
  };
  assertEquals(shouldSuppressFrequencyFlag(row), true);
});

Deno.test("normalizeIntegrityStatus maps stable to valid", () => {
  assertEquals(normalizeIntegrityStatus("stable"), "valid");
  assertEquals(normalizeIntegrityStatus("critical"), "critical");
});

Deno.test("mapIntegrityToSignalTier suppresses linked pair frequency to observe", () => {
  assertEquals(
    mapIntegrityToSignalTier("critical", {
      suppressedFrequency: true,
      isHighFrequency: true,
    }),
    "observe",
  );
  assertEquals(
    mapIntegrityToSignalTier("valid", {
      suppressedFrequency: false,
      isHighFrequency: true,
    }),
    "review",
  );
});
