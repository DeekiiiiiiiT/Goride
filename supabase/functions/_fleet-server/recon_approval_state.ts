/**
 * Week Reconciliation approvals (WRA-32, WRA-38). Pure rules, no database access.
 * A request is a recon.run_events row: kind 'approval_request',
 * status pending_approval → approved | rejected | withdrawn | stale (stale → withdrawn).
 */

/**
 * Actions that can be sent for approval from the week desk.
 * Write off keeps the settlement desk's own approval flow (settlement_approval_settings),
 * so it is not duplicated here.
 */
export const APPROVAL_ACTIONS = [
  "waive",
  "accept_statement_cash",
  "close",
  "reopen",
  "sign_restatement",
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return typeof value === "string" && (APPROVAL_ACTIONS as readonly string[]).includes(value);
}

export type RequestStatus = "pending_approval" | "approved" | "rejected" | "withdrawn" | "stale" | "applied";

export type ApproveDecision =
  | { go: true }
  | { go: false; code: "APPROVAL_GONE" | "APPROVAL_STALE" | "WEEK_CHANGED"; markStale: boolean; status: 409 };

/**
 * WRA-38 "Approve, step by step":
 * 1. stale → APPROVAL_STALE (nothing happens); approved / rejected / withdrawn → APPROVAL_GONE.
 * 2. pending, but the week moved since Send → WEEK_CHANGED and the request becomes stale.
 * 3. otherwise go.
 */
export function decideApprove(input: {
  status: RequestStatus | string;
  versionAtSend: number | null;
  currentVersion: number;
}): ApproveDecision {
  if (input.status === "stale") return { go: false, code: "APPROVAL_STALE", markStale: false, status: 409 };
  if (input.status !== "pending_approval") return { go: false, code: "APPROVAL_GONE", markStale: false, status: 409 };
  if (input.versionAtSend == null || input.versionAtSend !== input.currentVersion) {
    return { go: false, code: "WEEK_CHANGED", markStale: true, status: 409 };
  }
  return { go: true };
}

/** Only the person who sent it can withdraw, and only while it is pending or stale. */
export function canWithdraw(input: { actor: string; preparedBy: string | null; status: string }):
  | { ok: true }
  | { ok: false; code: "NOT_YOUR_REQUEST" | "APPROVAL_GONE" } {
  if (input.status !== "pending_approval" && input.status !== "stale") return { ok: false, code: "APPROVAL_GONE" };
  if (!input.preparedBy || input.preparedBy !== input.actor) return { ok: false, code: "NOT_YOUR_REQUEST" };
  return { ok: true };
}

/** Reject needs a reason (WRA-38); approving someone else's request does not. */
export function rejectReasonError(reason: unknown): string | null {
  return String(reason ?? "").trim().length > 0 ? null : "A reason is required to reject a request.";
}

/** The plain words shown on the week card and in the bell. */
export function approvalActionLabel(action: ApprovalAction): string {
  switch (action) {
    case "waive": return "Waive a required file";
    case "accept_statement_cash": return "Accept statement cash";
    case "close": return "Close week";
    case "reopen": return "Reopen week";
    case "sign_restatement": return "Sign correction";
  }
}
