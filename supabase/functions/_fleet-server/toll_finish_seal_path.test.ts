/**
 * Phase 8 durability — Finish → readiness → seal path (unit-testable without E2E).
 * Mirrors POST …/finish + decideTollPeriodSealed write refusal (TR-C2).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  computeTollPeriodReadiness,
  decideTollFinishAllowed,
} from "../../../packages/toll-core/src/tollPeriodReadiness.ts";
import { incrementUnlinkedRefundCount } from "../../../packages/toll-core/src/tollPeriodCounts.ts";
import { isUnlinkedRefundActionableNow } from "../../../packages/toll-core/src/unlinkedShortfallEligibility.ts";
import {
  decideTollPeriodSealed,
  periodSealedBody,
  TollPeriodSealedError,
} from "./toll_period_writable.ts";
import { tollsClearFromGate } from "./period_projector.ts";
import type { StepId } from "../../../packages/toll-core/src/tollPeriodStepTypes.ts";

function zeroSteps() {
  return {
    "needs-review": { actionable: 0, informational: 0 },
    "personal-use": { actionable: 0, informational: 0 },
    deadhead: { actionable: 0, informational: 0 },
    "underpaid-claims": { actionable: 0, informational: 0 },
    "dispute-refunds": { actionable: 0, informational: 0 },
    "unlinked-refunds": { actionable: 0, informational: 0 },
  } as Record<StepId, { actionable: number; informational: number }>;
}

Deno.test("Finish→readiness→seal: pending-hold blocks Finish (product decision A)", () => {
  const steps = zeroSteps();
  const pendingTrip = {
    id: "t-pending",
    tollCharges: 275,
    tollRefundResolution: { status: "pending" },
  };
  assertEquals(isUnlinkedRefundActionableNow(pendingTrip), true);
  incrementUnlinkedRefundCount(steps, pendingTrip as any);

  const readiness = computeTollPeriodReadiness({
    weekKey: "2026-09-07",
    steps,
    cardsNetLoss: 0,
    eventsNetLoss: 0,
  });
  assertEquals(readiness.actionableTotal, 1);
  assertEquals(decideTollFinishAllowed(readiness).allowed, false);
  assertEquals(
    tollsClearFromGate({
      tollStatus: "reconciled",
      tollWorkflowActionable: readiness.actionableTotal,
      tollUnmatchedCount: readiness.actionableTotal,
    }),
    false,
  );
});

Deno.test("Finish→readiness→seal: clear readiness allows Finish; sealed refuses writes", () => {
  const readiness = computeTollPeriodReadiness({
    weekKey: "2026-09-07",
    steps: zeroSteps(),
    cardsNetLoss: 100,
    eventsNetLoss: 100,
  });
  assertEquals(readiness.blockers.length, 0);
  assertEquals(decideTollFinishAllowed(readiness).allowed, true);

  // After Finish, period is ready (writable until Close seals).
  const afterFinish = decideTollPeriodSealed({
    periodState: "ready",
    hasClosedTollStatement: false,
  });
  assertEquals(afterFinish.sealed, false);

  // Close Week seal → mutations must get 409 PERIOD_SEALED (enforce mode).
  const afterSeal = decideTollPeriodSealed({
    periodState: "sealed",
    hasClosedTollStatement: true,
  });
  assertEquals(afterSeal.sealed, true);
  assertEquals(afterSeal.source, "period");

  const err = new TollPeriodSealedError("2026-09-07", "period");
  const body = periodSealedBody(err);
  assertEquals(body.error, "PERIOD_SEALED");
  assertEquals(body.weekKey, "2026-09-07");
  assertEquals(typeof body.reopenPath, "string");

  assertEquals(
    tollsClearFromGate({
      tollStatus: "reconciled",
      tollWorkflowActionable: 0,
      tollUnmatchedCount: 0,
    }),
    true,
  );
});

Deno.test("Finish→readiness→seal: identity residual blocks Finish even with zero steps", () => {
  const readiness = computeTollPeriodReadiness({
    weekKey: "2026-09-07",
    steps: zeroSteps(),
    cardsNetLoss: 100,
    eventsNetLoss: 90,
  });
  assertEquals(readiness.identity.withinTolerance, false);
  assertEquals(decideTollFinishAllowed(readiness).allowed, false);
  assertEquals(readiness.blockers.some((b) => b.code === "IDENTITY_RESIDUAL"), true);
});

Deno.test("pending-hold actionable parity: wizard count matches readiness blocker", () => {
  const steps = zeroSteps();
  incrementUnlinkedRefundCount(steps, {
    id: "u1",
    tollRefundResolution: { status: "pending" },
  } as any);
  // Same trip without optional suggestion signals — still actionable.
  assertEquals(steps["unlinked-refunds"].actionable, 1);
  assertEquals(steps["unlinked-refunds"].informational, 0);

  const readiness = computeTollPeriodReadiness({
    weekKey: "2026-09-14",
    steps,
    cardsNetLoss: 1,
    eventsNetLoss: 1,
  });
  assertEquals(readiness.actionableTotal, steps["unlinked-refunds"].actionable);
  assertEquals(
    readiness.blockers.find((b) => b.stepId === "unlinked-refunds")?.count,
    1,
  );
});
