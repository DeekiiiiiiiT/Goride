import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isBareTollEligibleForDisputeMatch,
  isFullyReimbursedViaTrip,
  isTollBlockedForDisputeMatch,
  tollShortfallAmount,
} from "./dispute_refund_eligibility.ts";

Deno.test("tollShortfallAmount is non-negative gap", () => {
  assertEquals(tollShortfallAmount(285, 285), 0);
  assertEquals(tollShortfallAmount(380, 370), 10);
  assertEquals(tollShortfallAmount(285, 400), 0);
});

Deno.test("isFullyReimbursedViaTrip within tolerance", () => {
  assertEquals(isFullyReimbursedViaTrip(285, 285), true);
  assertEquals(isFullyReimbursedViaTrip(380, 370), false);
  assertEquals(isFullyReimbursedViaTrip(285.04, 285), true);
});

Deno.test("isTollBlockedForDisputeMatch blocks deadhead", () => {
  assertEquals(
    isTollBlockedForDisputeMatch({ workflowStage: "deadhead_pending", type: "usage" }),
    true,
  );
});

Deno.test("isBareTollEligibleForDisputeMatch", () => {
  assertEquals(
    isBareTollEligibleForDisputeMatch({ tollAmount: 285, tripRefund: 285 }),
    false,
  );
  assertEquals(
    isBareTollEligibleForDisputeMatch({ tollAmount: 380, tripRefund: 370 }),
    true,
  );
  assertEquals(
    isBareTollEligibleForDisputeMatch({
      tollAmount: 285,
      tripRefund: null,
      workflowStage: "needs_review",
    }),
    false,
  );
  assertEquals(
    isBareTollEligibleForDisputeMatch({
      tollAmount: 285,
      tripRefund: null,
      workflowStage: "underpaid_pending",
    }),
    true,
  );
});
