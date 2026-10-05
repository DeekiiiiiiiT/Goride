/** Eligible card refund = captured − succeeded − in-flight, never counting the row being retried. */

export type RefundStatus = "pending" | "submitted" | "completed" | "failed" | "succeeded";

export type RefundSlice = { id?: string; amount: number; status: string };

const IN_FLIGHT = new Set(["pending", "submitted"]);
const SUCCEEDED = new Set(["completed", "succeeded"]);

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function refundableRemaining(
  captured: number,
  refunds: RefundSlice[],
  opts?: { ignoreRefundId?: string },
): number {
  const paid = Math.max(0, Number(captured) || 0);
  let used = 0;
  for (const row of refunds) {
    if (opts?.ignoreRefundId && row.id === opts.ignoreRefundId) continue;
    const status = String(row.status || "").toLowerCase();
    if (!IN_FLIGHT.has(status) && !SUCCEEDED.has(status)) continue;
    used += Number(row.amount) || 0;
  }
  return roundMoney(Math.max(0, paid - used));
}

/** Duplicate and late extra charges never change the order's paid state. */
export function orderRefundState(input: {
  refundKind: "primary" | "duplicate";
  primaryCaptured: number;
  primaryRefunded: number;
}): "unchanged" | "partially_refunded" | "refunded" {
  if (input.refundKind === "duplicate") return "unchanged";
  const captured = Math.max(0, Number(input.primaryCaptured) || 0);
  const refunded = Math.max(0, Number(input.primaryRefunded) || 0);
  if (captured <= 0 || refunded <= 0) return "unchanged";
  if (refunded >= captured - 0.001) return "refunded";
  return "partially_refunded";
}

export function assertRefundAmount(requested: number, eligible: number): string | null {
  const amount = roundMoney(Number(requested));
  if (!Number.isFinite(amount) || amount <= 0) return "Refund amount must be positive";
  if (amount > eligible + 0.001) {
    return `Refund amount exceeds eligible ${eligible.toFixed(2)}`;
  }
  return null;
}
