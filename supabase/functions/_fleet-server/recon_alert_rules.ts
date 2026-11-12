/**
 * WRA-31 alert rules — pure, no database access.
 * The calculator passes in what it read; this decides which alerts are open,
 * and when an unacknowledged alert escalates by SMS.
 */

export type AlertKind =
  | "calculator_paused"
  | "unit_pending"
  | "unit_failed"
  | "enqueue_failed"
  | "week_overdue"
  | "close_failed"
  | "approval_waiting"
  | "correction_unsigned"
  | "shadow_mismatch";

export type AlertCandidate = {
  kind: AlertKind;
  dedupeKey: string;
  title: string;
  detail: Record<string, unknown>;
};

export type AlertInputs = {
  nowMs: number;
  calculatorPaused: boolean;
  pausedSinceMs: number | null;
  /** Calculator on, and the oldest unit still waiting. */
  oldestPendingAgeSeconds: number | null;
  pendingUnits: number;
  failedUnits: number;
  enqueueFailedSinceMs: number | null;
  openRunsOver14Days: number;
  closeFailedWeeks: string[];
  pendingApprovalsOver24h: number;
  unsignedCorrectionsOver24h: number;
  unexplainedShadowMismatch: boolean;
};

const HOUR = 3_600_000;

/** The alert list in §WRA-31, in plain words. */
export function openAlerts(input: AlertInputs): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  if (input.calculatorPaused && input.pausedSinceMs != null && input.nowMs - input.pausedSinceMs > HOUR) {
    const hours = Math.floor((input.nowMs - input.pausedSinceMs) / HOUR);
    out.push({
      kind: "calculator_paused",
      dedupeKey: "calculator_paused",
      title: `Week calculator paused for ${hours} hours`,
      detail: { pausedSince: new Date(input.pausedSinceMs).toISOString() },
    });
  }
  if (!input.calculatorPaused && (input.oldestPendingAgeSeconds ?? 0) > 15 * 60 && input.pendingUnits > 0) {
    out.push({
      kind: "unit_pending",
      dedupeKey: "unit_pending",
      title: `${input.pendingUnits} week updates waiting for more than 15 minutes`,
      detail: { pendingUnits: input.pendingUnits, oldestPendingAgeSeconds: input.oldestPendingAgeSeconds },
    });
  }
  if (input.failedUnits > 0) {
    out.push({
      kind: "unit_failed",
      dedupeKey: "unit_failed",
      title: `${input.failedUnits} week calculation${input.failedUnits === 1 ? "" : "s"} failed 3 times`,
      detail: { failedUnits: input.failedUnits },
    });
  }
  if (input.enqueueFailedSinceMs != null) {
    out.push({
      kind: "enqueue_failed",
      dedupeKey: "enqueue_failed",
      title: "A saved change could not be recalculated; the nightly run will pick it up",
      detail: { since: new Date(input.enqueueFailedSinceMs).toISOString() },
    });
  }
  if (input.openRunsOver14Days > 0) {
    out.push({
      kind: "week_overdue",
      dedupeKey: "week_overdue",
      title: `${input.openRunsOver14Days} week${input.openRunsOver14Days === 1 ? "" : "s"} still open more than 14 days after Sunday`,
      detail: { weeks: input.openRunsOver14Days },
    });
  }
  for (const week of input.closeFailedWeeks) {
    out.push({
      kind: "close_failed",
      dedupeKey: `close_failed:${week}`,
      title: `Closing the week of ${week} failed`,
      detail: { weekKey: week },
    });
  }
  if (input.pendingApprovalsOver24h > 0) {
    out.push({
      kind: "approval_waiting",
      dedupeKey: "approval_waiting",
      title: `${input.pendingApprovalsOver24h} approval request${input.pendingApprovalsOver24h === 1 ? "" : "s"} waiting more than 24 hours`,
      detail: { requests: input.pendingApprovalsOver24h },
    });
  }
  if (input.unsignedCorrectionsOver24h > 0) {
    out.push({
      kind: "correction_unsigned",
      dedupeKey: "correction_unsigned",
      title: `${input.unsignedCorrectionsOver24h} correction${input.unsignedCorrectionsOver24h === 1 ? "" : "s"} to closed weeks waiting to be signed`,
      detail: { drafts: input.unsignedCorrectionsOver24h },
    });
  }
  if (input.unexplainedShadowMismatch) {
    out.push({
      kind: "shadow_mismatch",
      dedupeKey: "shadow_mismatch",
      title: "The nightly side-by-side check found a difference",
      detail: {},
    });
  }
  return out;
}

export type Escalation = "manager" | "owner" | null;

/**
 * Unacknowledged for 24 h → SMS the fleet managers; for 48 h → SMS the owner as well.
 * One step per pass, each sent once.
 */
export function nextEscalation(input: {
  nowMs: number;
  raisedAtMs: number;
  acknowledged: boolean;
  smsManagerSent: boolean;
  smsOwnerSent: boolean;
}): Escalation {
  if (input.acknowledged) return null;
  const age = input.nowMs - input.raisedAtMs;
  if (age >= 24 * HOUR && !input.smsManagerSent) return "manager";
  if (age >= 48 * HOUR && !input.smsOwnerSent) return "owner";
  return null;
}
