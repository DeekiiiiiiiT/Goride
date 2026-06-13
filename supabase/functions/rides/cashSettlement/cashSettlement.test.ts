import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";
import {
  assertJournalBalanced,
  buildJournalLineSpecs,
  driverAccountKeyForUser,
  riderAccountKeyForUser,
} from "./buildJournalEntries.ts";
import {
  canTransitionToCashSettlement,
  fareLockPatch,
} from "./cashSettlementLifecycle.ts";
import { hashSettlementRequest } from "./requestHash.ts";
import { resolveOwedFareMinor } from "./processCashSettlement.ts";
import { isCashSettlementEnabled, isCashSettlementV2Enabled } from "./flags.ts";

Deno.test("computeCashSettlementOutcome exact", () => {
  const r = computeCashSettlementOutcome(150000, 150000);
  assertEquals(r.outcome, "exact");
  assertEquals(r.arrears_minor, 0);
  assertEquals(r.change_credit_minor, 0);
});

Deno.test("computeCashSettlementOutcome underpay", () => {
  const r = computeCashSettlementOutcome(150000, 100000);
  assertEquals(r.outcome, "underpay");
  assertEquals(r.arrears_minor, 50000);
});

Deno.test("computeCashSettlementOutcome overpay", () => {
  const r = computeCashSettlementOutcome(150000, 200000);
  assertEquals(r.outcome, "overpay");
  assertEquals(r.change_credit_minor, 50000);
});

Deno.test("computeCashSettlementOutcome unpaid", () => {
  const r = computeCashSettlementOutcome(150000, 0);
  assertEquals(r.outcome, "unpaid");
  assertEquals(r.arrears_minor, 150000);
});

Deno.test("buildJournalLineSpecs balances for underpay", () => {
  const computed = computeCashSettlementOutcome(1000, 600);
  const lines = buildJournalLineSpecs({
    computed,
    riderAccountKey: riderAccountKeyForUser("r1"),
    driverAccountKey: driverAccountKeyForUser("d1"),
    rideId: "ride-1",
    currency: "JMD",
  });
  assertEquals(lines.length, 1);
  assertEquals(lines[0].entry_type, "cash_trip_arrears");
  assertEquals(lines[0].amount_minor, 400);
  assertJournalBalanced(lines);
});

Deno.test("buildJournalLineSpecs balances for overpay", () => {
  const computed = computeCashSettlementOutcome(1000, 1500);
  const lines = buildJournalLineSpecs({
    computed,
    riderAccountKey: riderAccountKeyForUser("r1"),
    driverAccountKey: driverAccountKeyForUser("d1"),
    rideId: "ride-1",
    currency: "JMD",
  });
  assertEquals(lines.length, 1);
  assertEquals(lines[0].entry_type, "cash_change_debit");
  assertJournalBalanced(lines);
});

Deno.test("buildJournalLineSpecs exact produces no wallet lines", () => {
  const computed = computeCashSettlementOutcome(1000, 1000);
  const lines = buildJournalLineSpecs({
    computed,
    riderAccountKey: riderAccountKeyForUser("r1"),
    driverAccountKey: driverAccountKeyForUser("d1"),
    rideId: "ride-1",
    currency: "JMD",
  });
  assertEquals(lines.length, 0);
});

Deno.test("canTransitionToCashSettlement requires flag and cash", () => {
  assertEquals(canTransitionToCashSettlement("on_trip", "cash", true), true);
  assertEquals(canTransitionToCashSettlement("on_trip", "card", true), false);
  assertEquals(canTransitionToCashSettlement("on_trip", "cash", false), false);
});

Deno.test("resolveOwedFareMinor prefers locked fare then estimate", () => {
  assertEquals(resolveOwedFareMinor({ fare_final_minor: 1200 }), 1200);
  assertEquals(resolveOwedFareMinor({ fare_estimate_minor: 800 }), 800);
  assertEquals(resolveOwedFareMinor({}), null);
});

Deno.test("fareLockPatch sets awaiting status", () => {
  const patch = fareLockPatch(5000, "2026-01-01T00:00:00.000Z");
  assertEquals(patch.status, "awaiting_cash_settlement");
  assertEquals(patch.fare_final_minor, 5000);
});

Deno.test("hashSettlementRequest stable", async () => {
  const a = await hashSettlementRequest({ cash_received_minor: 1000 });
  const b = await hashSettlementRequest({ cash_received_minor: 1000 });
  assertEquals(a, b);
  const c = await hashSettlementRequest({ cash_received_minor: 1001 });
  assertEquals(a === c, false);
});

Deno.test("driver earnings invariant: journal never references fare reduction", () => {
  const computed = computeCashSettlementOutcome(1000, 0);
  assertEquals(computed.arrears_minor, 1000);
  const lines = buildJournalLineSpecs({
    computed,
    riderAccountKey: riderAccountKeyForUser("r1"),
    driverAccountKey: driverAccountKeyForUser("d1"),
    rideId: "ride-1",
    currency: "JMD",
  });
  for (const line of lines) {
    assertEquals(line.metadata.owed_minor, 1000);
    assertThrows(() => {
      if ((line.metadata as Record<string, unknown>).driver_net_reduced) {
        throw new Error("driver net must not be reduced");
      }
    });
  }
});

Deno.test("isCashSettlementV2Enabled requires V1 flag", () => {
  const prevV1 = Deno.env.get("CASH_SETTLEMENT_ENABLED");
  const prevV2 = Deno.env.get("CASH_SETTLEMENT_V2");
  try {
    Deno.env.delete("CASH_SETTLEMENT_ENABLED");
    Deno.env.delete("CASH_SETTLEMENT_V2");
    assertEquals(isCashSettlementV2Enabled(), false);

    Deno.env.set("CASH_SETTLEMENT_ENABLED", "1");
    assertEquals(isCashSettlementV2Enabled(), false);

    Deno.env.set("CASH_SETTLEMENT_V2", "1");
    assertEquals(isCashSettlementV2Enabled(), true);
  } finally {
    if (prevV1 === undefined) Deno.env.delete("CASH_SETTLEMENT_ENABLED");
    else Deno.env.set("CASH_SETTLEMENT_ENABLED", prevV1);
    if (prevV2 === undefined) Deno.env.delete("CASH_SETTLEMENT_V2");
    else Deno.env.set("CASH_SETTLEMENT_V2", prevV2);
  }
});
