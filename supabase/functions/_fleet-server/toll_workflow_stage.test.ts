import {
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeTollWorkflowStage } from "./toll_workflow_stage.ts";

Deno.test("computeTollWorkflowStage: unconfirmed PERFECT_MATCH stays needs_review", () => {
  assertEquals(
    computeTollWorkflowStage({
      matchStatus: "matched",
      matchTypeCode: "PERFECT_MATCH",
      isReconciled: false,
    }),
    "needs_review",
  );
});

Deno.test("computeTollWorkflowStage: confirmed PERFECT_MATCH is matched", () => {
  assertEquals(
    computeTollWorkflowStage({
      matchStatus: "matched",
      matchTypeCode: "PERFECT_MATCH",
      isReconciled: true,
    }),
    "matched",
  );
});

Deno.test("computeTollWorkflowStage: AMOUNT_VARIANCE stays underpaid_pending before confirm", () => {
  assertEquals(
    computeTollWorkflowStage({
      matchStatus: "matched",
      matchTypeCode: "AMOUNT_VARIANCE",
      isReconciled: false,
    }),
    "underpaid_pending",
  );
});

Deno.test("computeTollWorkflowStage: personal Charge Driver → personal_use_resolved", () => {
  assertEquals(
    computeTollWorkflowStage({
      matchStatus: "orphan_personal",
      matchTypeCode: "PERSONAL_MATCH",
      matchReasonCode: "ORPHAN_NO_TRIP",
      claim: { status: "Resolved", resolutionReason: "Charge Driver" },
    }),
    "personal_use_resolved",
  );
});

Deno.test("computeTollWorkflowStage: underpaid Charge Driver → claim_resolved", () => {
  assertEquals(
    computeTollWorkflowStage({
      matchStatus: "matched",
      matchTypeCode: "AMOUNT_VARIANCE",
      claim: { status: "Resolved", resolutionReason: "Charge Driver" },
    }),
    "claim_resolved",
  );
});
