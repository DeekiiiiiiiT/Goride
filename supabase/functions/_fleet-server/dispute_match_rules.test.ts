import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  amountsAlign,
  tollShortfallAmount,
} from "./dispute_refund_eligibility.ts";
import {
  computeDisputeMatchConfidence,
  DISPUTE_AUTO_AMBIGUITY_GAP,
  DISPUTE_AUTO_MAX_TIME_MINUTES,
  passesAutoHardGates,
  pickDisputeMatchCandidate,
  type DisputeMatchCandidate,
} from "./dispute_match_scoring.ts";

function mockCandidate(overrides: Partial<DisputeMatchCandidate>): DisputeMatchCandidate {
  return {
    tollId: "toll-1",
    tripId: "trip-1",
    claimId: "claim-1",
    tollAmount: 285,
    claimAmount: 10,
    tripRefund: 275,
    shortfall: 10,
    uberRefund: 10,
    variance: 0,
    date: "2026-06-30",
    confidence: 95,
    claimStatus: "Open",
    matchType: "claim",
    eligibleForSuggestion: true,
    eligibleForAuto: true,
    rejectReason: null,
    timeDifferenceMinutes: 30,
    ...overrides,
  };
}

Deno.test("tollShortfallAmount: $380 toll with $380 paid = $0 shortfall", () => {
  assertEquals(tollShortfallAmount(380, 380), 0);
});

Deno.test("amountsAlign within 5 cents", () => {
  assertEquals(amountsAlign(10, 10.04), true);
  assertEquals(amountsAlign(10, 20), false);
});

Deno.test("passesAutoHardGates rejects zero shortfall", () => {
  assertEquals(
    passesAutoHardGates({
      refundAmount: 20,
      shortfall: 0,
      claimAmount: 20,
      tripId: "trip-1",
      timeDifferenceMinutes: 30,
    }),
    "Toll already fully paid on trip — no shortfall to fix",
  );
});

Deno.test("passesAutoHardGates rejects refund vs shortfall mismatch", () => {
  assertEquals(
    passesAutoHardGates({
      refundAmount: 20,
      shortfall: 10,
      claimAmount: 10,
      tripId: "trip-1",
      timeDifferenceMinutes: 30,
    }),
    "Dispute refund does not match the toll shortfall",
  );
});

Deno.test("computeDisputeMatchConfidence favors exact shortfall match", () => {
  const exact = computeDisputeMatchConfidence({
    refundAmount: 10,
    shortfall: 10,
    claimAmount: 10,
    refundDateMs: new Date("2026-06-30").getTime(),
    anchorDateMs: new Date("2026-06-29").getTime(),
    timeDifferenceMinutes: 20,
  });
  const off = computeDisputeMatchConfidence({
    refundAmount: 20,
    shortfall: 10,
    claimAmount: 20,
    refundDateMs: new Date("2026-06-30").getTime(),
    anchorDateMs: new Date("2026-06-29").getTime(),
    timeDifferenceMinutes: 20,
  });
  if (exact <= off) throw new Error(`expected exact > off, got ${exact} vs ${off}`);
});

Deno.test("pickDisputeMatchCandidate auto skips ineligible candidate", () => {
  const picked = pickDisputeMatchCandidate(
    [mockCandidate({ eligibleForAuto: false, shortfall: 0, rejectReason: "no shortfall" })],
    { mode: "auto", minConfidence: 50 },
  );
  assertEquals(picked, null);
});

Deno.test("pickDisputeMatchCandidate auto accepts valid match", () => {
  const picked = pickDisputeMatchCandidate(
    [mockCandidate({ confidence: 96 })],
    { mode: "auto", minConfidence: 95 },
  );
  assertEquals(picked?.claimId, "claim-1");
});

Deno.test("pickDisputeMatchCandidate auto skips ambiguous top two", () => {
  const picked = pickDisputeMatchCandidate(
    [
      mockCandidate({ tollId: "t1", claimId: "c1", confidence: 90 }),
      mockCandidate({ tollId: "t2", claimId: "c2", confidence: 90 - DISPUTE_AUTO_AMBIGUITY_GAP + 1 }),
    ],
    { mode: "auto", minConfidence: 50 },
  );
  assertEquals(picked, null);
});

Deno.test("passesAutoHardGates rejects trip time beyond max", () => {
  assertEquals(
    passesAutoHardGates({
      refundAmount: 10,
      shortfall: 10,
      claimAmount: 10,
      tripId: "trip-1",
      timeDifferenceMinutes: DISPUTE_AUTO_MAX_TIME_MINUTES + 60,
    }),
    "Trip time is too far from the toll",
  );
});

Deno.test("pickDisputeMatchCandidate suggest mode ignores auto-only flags", () => {
  const picked = pickDisputeMatchCandidate(
    [
      mockCandidate({
        eligibleForAuto: false,
        eligibleForSuggestion: true,
        confidence: 70,
      }),
    ],
    { mode: "suggest" },
  );
  assertEquals(picked?.tollId, "toll-1");
});
