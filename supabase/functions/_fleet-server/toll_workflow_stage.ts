/**
 * Pure decision engine for a toll's persisted reconciliation-workflow stage —
 * the single source of truth for "where is this toll in the process" that
 * `bucketForBestMatch` (client, apps/fleet/src/utils/tollBucket.ts) used to
 * answer by recomputing from a live match result every render, with nothing
 * durable to show period progress or let a linked claim's resolution win.
 *
 * Same decision table `bucketForBestMatch` already uses, just fed from
 * durable `TollLedgerRecord` fields (matchStatus/matchTypeCode/matchReasonCode/
 * resolution/isReconciled) plus the linked claim's live status, instead of a
 * recomputed-per-render MatchResult. `bucketForBestMatch` itself is not
 * replaced — it stays as the client-side fallback for rows that predate the
 * workflow-stage backfill.
 *
 * Pure + dependency-free so it is unit-testable in isolation, matching the
 * style of `driver_toll_disposition.ts` / `claim_resolution_sync.ts`.
 */

export type TollWorkflowStage =
  | "needs_review"
  | "personal_use_pending"
  | "personal_use_resolved"
  | "deadhead_pending"
  | "deadhead_resolved"
  | "underpaid_pending"
  | "claim_filed"
  | "claim_resolved"
  | "matched";

export interface WorkflowStageClaimInput {
  status: string;
  resolutionReason?: string | null;
}

export interface WorkflowStageInput {
  matchStatus?: "unmatched" | "matched" | "orphan_personal" | "ambiguous" | null;
  matchTypeCode?: "PERFECT_MATCH" | "AMOUNT_VARIANCE" | "DEADHEAD_MATCH" | "PERSONAL_MATCH" | "POSSIBLE_MATCH" | null;
  matchReasonCode?: string | null;
  resolution?: "personal" | "business" | "write_off" | "refunded" | null;
  isReconciled?: boolean;
  /** The claim linked to this toll (via TollLedgerRecord.claimId), if any. */
  claim?: WorkflowStageClaimInput | null;
}

/**
 * Decide a toll's workflow stage. Priority order:
 *   1. A linked claim's lifecycle dominates — a claim existing IS the toll's
 *      state once one exists, regardless of the underlying match bucket.
 *   2. A manual resolution label with no claim (Business/WriteOff/legacy
 *      Reimbursed path, or a legacy Personal row resolved before claimId
 *      linking existed).
 *   3. The persisted match bucket (same table as bucketForBestMatch).
 *   4. Fallback: reconciled → matched, otherwise needs_review.
 */
export function computeTollWorkflowStage(input: WorkflowStageInput): TollWorkflowStage {
  const { claim } = input;
  if (claim) {
    if (claim.status === "Resolved" || claim.status === "Rejected") {
      return claim.resolutionReason === "Charge Driver" ? "personal_use_resolved" : "claim_resolved";
    }
    return "claim_filed";
  }

  if (input.resolution === "business" || input.resolution === "write_off" || input.resolution === "refunded") {
    return "matched";
  }
  if (input.resolution === "personal") {
    return "personal_use_resolved";
  }

  if (input.matchStatus === "orphan_personal") return "personal_use_pending";
  if (input.matchStatus === "matched") {
    switch (input.matchTypeCode) {
      case "AMOUNT_VARIANCE":
        return "underpaid_pending";
      case "DEADHEAD_MATCH":
        return "deadhead_pending";
      case "PERSONAL_MATCH":
        return input.matchReasonCode === "ENROUTE_APPROACH" ? "deadhead_pending" : "personal_use_pending";
      case "PERFECT_MATCH":
      default:
        // Suggestion-only PERFECT_MATCH (matchedTripId set, trip link not
        // confirmed) must stay in needs_review — otherwise period landing
        // shows Completed / Expenses shows Unmatched for the same tolls.
        return input.isReconciled ? "matched" : "needs_review";
    }
  }

  return input.isReconciled ? "matched" : "needs_review";
}
