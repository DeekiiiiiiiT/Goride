/**
 * Phase 8 durability — Finish → readiness → seal path (unit-testable without E2E).
 * Mirrors POST …/finish + decideTollPeriodSealed write refusal (TR-C2).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  computeTollPeriodReadiness,
  decideTollFinishAllowed,
} from "../../../packages/toll-core/src/tollPeriodReadiness.ts";
import { scopeTollReadinessWeekInputs } from "../../../packages/toll-core/src/tollPeriodReadinessScope.ts";
import { incrementUnlinkedRefundCount } from "../../../packages/toll-core/src/tollPeriodCounts.ts";
import { isUnlinkedRefundActionableNow } from "../../../packages/toll-core/src/unlinkedShortfallEligibility.ts";
import {
  decideTollPeriodSealed,
  periodSealedBody,
  TollPeriodSealedError,
} from "./toll_period_writable.ts";
import { tollsClearFromGate } from "./period_projector.ts";
import { isTollIncludedInSpend } from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import {
  SERVER_STEP_BY_BLOCKER,
  countBlockersForStep,
} from "../../../packages/finance-core/src/closeBlockerSteps.ts";
import { buildCanonicalTollEventFromTollLedger } from "./canonical_from_ops.ts";
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

  // Finish marks ready before sealTollWeek runs.
  const afterReady = decideTollPeriodSealed({
    periodState: "ready",
    hasClosedTollStatement: false,
  });
  assertEquals(afterReady.sealed, false);

  // Finish then publishes closed toll statements and persists state=sealed.
  // Mutations must get 409 PERIOD_SEALED (enforce mode). Idempotent re-finish
  // keeps one statement (sealTollWeek skips unchanged amounts).
  const afterFinishSeal = decideTollPeriodSealed({
    periodState: "sealed",
    hasClosedTollStatement: true,
  });
  assertEquals(afterFinishSeal.sealed, true);
  assertEquals(afterFinishSeal.source, "period");

  // Statement alone also seals even if period row lagged (chip / write guard).
  const statementOnly = decideTollPeriodSealed({
    periodState: "ready",
    hasClosedTollStatement: true,
  });
  assertEquals(statementOnly.sealed, true);
  assertEquals(statementOnly.source, "week_statements");

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

Deno.test("Finish seal contract: TOLL_STATEMENT_MISSING maps to tolls step; statement clears gate", () => {
  // closeBlockerSteps maps TOLL_STATEMENT_MISSING → 'tolls'. Finish must publish
  // the statement before steps/tolls/complete or computeLiveStepCounts keeps
  // tollActionable ≥ 1 via saved blockers.
  assertEquals(SERVER_STEP_BY_BLOCKER.TOLL_STATEMENT_MISSING, "tolls");
  const withMissing = [
    { code: "TOLL_STATEMENT_MISSING", severity: "block" as const },
  ];
  assertEquals(countBlockersForStep("tolls", withMissing), 1);
  assertEquals(countBlockersForStep("tolls", []), 0);
});

Deno.test("TR-C1a: blockers empty ⟺ tollsClear when readiness present (informational-only legacy)", () => {
  const readiness = computeTollPeriodReadiness({
    weekKey: "2026-09-07",
    steps: zeroSteps(),
    cardsNetLoss: 50,
    eventsNetLoss: 50,
  });
  assertEquals(readiness.blockers.length, 0);
  assertEquals(readiness.actionableTotal, 0);
  // Legacy counters still non-zero (informational work) — readiness governs.
  assertEquals(
    tollsClearFromGate({
      tollStatus: "unmatched",
      tollWorkflowActionable: 4,
      tollUnmatchedCount: 4,
      readinessActionableTotal: readiness.actionableTotal,
    }),
    true,
  );
  assertEquals(
    readiness.blockers.length === 0,
    tollsClearFromGate({
      tollStatus: "unmatched",
      tollWorkflowActionable: 4,
      tollUnmatchedCount: 4,
      readinessActionableTotal: readiness.actionableTotal,
    }),
  );
});

Deno.test("charged personal toll stays in spend; uncharged rejection does not", () => {
  assertEquals(
    isTollIncludedInSpend({ status: "rejected", resolution: "personal", amount: -275 }),
    true,
  );
  assertEquals(
    isTollIncludedInSpend({ status: "pending", resolution: "personal", amount: -275 }),
    true,
  );
  assertEquals(
    isTollIncludedInSpend({ status: "rejected", amount: -275 }),
    false,
  );
});

Deno.test("GPS usage writes a toll_charge event", () => {
  const ev = buildCanonicalTollEventFromTollLedger({
    id: "ea0380fb-bc98-47fd-b597-e1d1ca0a0027",
    date: "2026-09-12",
    driverId: "73e5b1dc-01b4-45ee-a34a-25a3256b9841",
    amount: -275,
    type: "usage",
    description: "Toll crossing (fleet post-trip replay): Spanish Town",
  });
  assertEquals(ev?.eventType, "toll_charge");
  assertEquals(ev?.idempotencyKey, "toll_ledger:ea0380fb-bc98-47fd-b597-e1d1ca0a0027|toll_charge");
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

Deno.test("Finish readiness week-scope: prior-week dispute + pad trips do not block", () => {
  const TZ = "America/Jamaica";
  const weekKey = "2026-10-12";
  const scoped = scopeTollReadinessWeekInputs({
    weekKey,
    fleetTz: TZ,
    tollTx: [
      { id: "toll-pad", date: "2026-10-10" },
      { id: "toll-week", date: "2026-10-15" },
    ],
    trips: [
      { id: "pad-unlinked", date: "2026-10-10" },
      { id: "week-cleared", date: "2026-10-15" },
    ],
    disputeRefunds: [
      {
        date: "2026-10-11T23:55:31.524Z",
        matchedClaimId: null,
        matchedTollId: null,
      },
    ],
  });
  assertEquals(scoped.weekDisputes.length, 0);
  assertEquals(scoped.weekTrips.map((t) => t.id), ["week-cleared"]);

  const steps = zeroSteps();
  // Only week-scoped unlinked would be counted — pad trip omitted.
  const readiness = computeTollPeriodReadiness({
    weekKey,
    steps,
    cardsNetLoss: 0,
    eventsNetLoss: 0,
  });
  assertEquals(decideTollFinishAllowed(readiness).allowed, true);
  assertEquals(readiness.blockers.length, 0);
});
