/**
 * Pure period-landing bucket rules (no Hono / KV). Mirrors
 * apps/fleet/src/utils/tollBucket.ts resolveWizardBucket for persisted fields
 * only — no live MatchResult on the server period endpoint.
 */

export type PeriodBucket = "needs-review" | "underpaid-claims" | "deadhead" | "personal-use";

/** Mirrors bucketForWorkflowStage in apps/fleet/src/utils/tollBucket.ts. */
export function bucketForWorkflowStage(stage: string | undefined): PeriodBucket | null {
  switch (stage) {
    case "needs_review":
      return "needs-review";
    case "underpaid_pending":
      return "underpaid-claims";
    case "deadhead_pending":
      return "deadhead";
    case "personal_use_pending":
      return "personal-use";
    case "deadhead_resolved":
    case "personal_use_resolved":
    case "claim_filed":
    case "claim_resolved":
    case "matched":
      return null;
    default:
      return "needs-review";
  }
}

/** Mirrors resolveWizardBucket in apps/fleet/src/utils/tollBucket.ts (persisted fields only). */
export function resolvePeriodBucket(tx: any): PeriodBucket | null {
  const stage = tx.workflowStage as string | undefined;
  const stageBucket = bucketForWorkflowStage(stage);
  if (stageBucket === null && stage) return null;

  const reasonCode = String(tx.matchReasonCode || "");
  const isOrphanPersonal =
    tx.matchTypeCode === "PERSONAL_MATCH" &&
    (reasonCode.startsWith("ORPHAN_") || !tx.matchedTripId);

  if (isOrphanPersonal || stage === "personal_use_pending" || tx.matchStatus === "orphan_personal") {
    // Stale personal pin: a later rematch can flip the persisted match type —
    // money / review buckets win (mirrors resolveWizardBucket personal escape).
    if (!isOrphanPersonal) {
      // Ambiguous first — unsettled trip pick must not jump to Underpaid.
      if (tx.matchStatus === "ambiguous" || tx.isAmbiguous === true) return "needs-review";
      if (tx.matchTypeCode === "AMOUNT_VARIANCE") return "underpaid-claims";
      if (tx.matchTypeCode === "DEADHEAD_MATCH") return "deadhead";
      if (tx.matchTypeCode === "PERFECT_MATCH") return "needs-review";
    }
    return "personal-use";
  }

  const linkConfirmed = !!(tx.isReconciled && tx.tripId);
  if (!linkConfirmed && (tx.matchStatus === "ambiguous" || tx.isAmbiguous === true)) {
    return "needs-review";
  }

  const matchType = tx.matchTypeCode as string | undefined;
  if (matchType === "AMOUNT_VARIANCE" || stage === "underpaid_pending") return "underpaid-claims";
  if (matchType === "DEADHEAD_MATCH" || stage === "deadhead_pending") return "deadhead";
  if (matchType === "PERSONAL_MATCH" || stage === "personal_use_pending") return "personal-use";

  const isCash = tx.paymentMethod === "Cash" || !!tx.receiptUrl;
  if (!matchType && !isCash && tx.matchStatus !== "ambiguous") {
    return "personal-use";
  }

  return stageBucket ?? "needs-review";
}
