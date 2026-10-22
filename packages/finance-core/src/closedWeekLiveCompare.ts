/**
 * Closed pay weeks are frozen as built. Live trip totals are the check for
 * open weeks only. A later trip edit must not reopen a sealed week as drift.
 */

export function isProbeTripRef(id: unknown): boolean {
  return String(id ?? "").trim().startsWith("probe-trip-");
}

export function isFrozenPayWeek(period: {
  status?: string | null;
  closedAt?: string | null;
  closed_at?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!period) return false;
  if (period.closedAt || period.closed_at) return true;
  if (String(period.status || "").toLowerCase() === "closed") return true;
  const meta = period.metadata || {};
  if (meta.periodFrozen === true || meta.signedWeek === true) return true;
  if (meta.financeCore && typeof meta.financeCore === "object") {
    const fc = meta.financeCore as Record<string, unknown>;
    if (fc.periodFrozen === true || fc.signedAt) return true;
  }
  return false;
}

/** True only for an open week. Closed weeks are not compared to today's trips. */
export function shouldCompareWeekToLiveTrips(period: Parameters<typeof isFrozenPayWeek>[0]): boolean {
  return !isFrozenPayWeek(period);
}
