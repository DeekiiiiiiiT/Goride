/**
 * Review Queue approve / reject guards (docs/fuel-review-queue-review.md RQ-01, RQ-03, RQ-11).
 * Pure rules — the routes in register_residual_monolith_routes.tsx call these before any write.
 */

export type ReviewRefusal = { status: 400 | 409; code: string; error: string };

type TxLike = {
  status?: unknown;
  odometer?: unknown;
  category?: unknown;
  amount?: unknown;
  metadata?: Record<string, unknown> | null;
};

const on = (v: unknown) => v === true || v === "true";

function isFuel(tx: TxLike): boolean {
  return tx.category === "Fuel" || tx.category === "Fuel Reimbursement";
}

export function isStillPending(tx: TxLike): boolean {
  return String(tx.status || "").toLowerCase() === "pending";
}

/** RQ-01 + RQ-03 (+ DSH CR-06): null when approve may go ahead. */
export function approveRefusal(tx: TxLike, odometerReading?: unknown): ReviewRefusal | null {
  if (!isStillPending(tx)) {
    return { status: 409, code: "NOT_PENDING", error: "This fill was already approved or rejected. Refresh the Review Queue." };
  }
  if (!isFuel(tx)) return null;
  const m = tx.metadata || {};
  const read = m.photoReadStatus;
  if (read === "waiting" || read === "needs_look") {
    return { status: 409, code: "PHOTO_NOT_READ", error: "Type the total and litres for this fill before approving it." };
  }
  if (on(m.awaitingCashStatement)) {
    return { status: 409, code: "SPLIT_CASH_AWAITING_STATEMENT", error: "The cash part waits for the gas card statement. It can't be approved yet." };
  }
  const total = Math.abs(Number(tx.amount) || Number(m.totalCost) || 0);
  const settledAtZero = on(m.splitReconciled) && typeof m.fillGroupId === "string" && m.fillGroupId.length > 0;
  if (!(total > 0) && !settledAtZero) {
    return { status: 409, code: "NO_TOTAL", error: "This fill has no total. Add the total before approving it." };
  }
  // DSH CR-06: a phone fill (captureId) never posts without an odometer — the odometer window gives one.
  const odo = Number(tx.odometer) > 0 || Number(odometerReading) > 0;
  if (typeof m.captureId === "string" && m.captureId && !odo) {
    return { status: 409, code: "NO_ODOMETER", error: "This fill has no odometer reading. Approve it from Log Review and type the reading." };
  }
  return null;
}

/** RQ-03 + RQ-11: null when reject may go ahead. */
export function rejectRefusal(tx: TxLike, reason: unknown): ReviewRefusal | null {
  if (!isStillPending(tx)) {
    return { status: 409, code: "NOT_PENDING", error: "This fill was already approved or rejected. Refresh the Review Queue." };
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return { status: 400, code: "REASON_REQUIRED", error: "Say why the fill is rejected. The driver sees this." };
  }
  return null;
}
