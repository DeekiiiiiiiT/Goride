/** Pinned WiPay callback contract. One success value. Amount must match the intent. */

export function wipayStatusAccepted(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "success";
}

export function wipayAmountMatches(intentAmount: number, reported: unknown): boolean {
  if (reported == null || String(reported).trim() === "") return false;
  const amount = Number(reported);
  if (!Number.isFinite(amount)) return false;
  return Math.abs(amount - Number(intentAmount)) <= 0.01;
}

export function wipayCurrencyOk(currency: unknown): boolean {
  const value = String(currency ?? "JMD").trim().toUpperCase();
  return value === "JMD" || value === "";
}

/** Refund status query. Paid is already done. Missing means WiPay has no record. Anything else needs a person. */
export function interpretRefundStatus(
  ok: boolean,
  body: { status?: unknown; found?: unknown },
): "paid" | "missing" | "unknown" {
  if (!ok) return "unknown";
  const status = String(body.status ?? "").trim().toLowerCase();
  if (["success", "completed", "paid", "refunded", "succeeded"].includes(status)) return "paid";
  if (body.found === false || ["not_found", "missing", "none", "unknown_refund"].includes(status)) return "missing";
  return "unknown";
}
