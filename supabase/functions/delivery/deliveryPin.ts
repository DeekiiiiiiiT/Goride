/** Delivery handoff PIN helpers (courier.delivery.pin_required_over_jmd). */

/** 4-digit zero-padded PIN for customer handoff. */
export function generateDeliveryPin(): string {
  const n = Math.floor(Math.random() * 10_000);
  return String(n).padStart(4, "0");
}

/** True when threshold > 0 and order total meets/exceeds it. */
export function maybeNeedsPin(totalJmd: number, threshold: number): boolean {
  const t = Number(threshold);
  const total = Number(totalJmd);
  if (!Number.isFinite(t) || t <= 0) return false;
  if (!Number.isFinite(total)) return false;
  return total >= t;
}
