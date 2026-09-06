/**
 * Period freeze / close gate for settlement commands (Phase 6).
 * Signed weeks in the projection metadata block further money writes.
 */

export function isPeriodFrozen(period: {
  metadata?: Record<string, unknown> | null;
  settlementStatus?: string | null;
  signedAt?: string | null;
} | null | undefined): boolean {
  if (!period) return false;
  if (period.signedAt) return true;
  const meta = period.metadata || {};
  if (meta.periodFrozen === true || meta.signedWeek === true) return true;
  if (meta.financeCore && typeof meta.financeCore === "object") {
    const fc = meta.financeCore as Record<string, unknown>;
    if (fc.periodFrozen === true || fc.signedAt) return true;
  }
  return false;
}

export function assertPeriodNotFrozen(period: Parameters<typeof isPeriodFrozen>[0]): void {
  if (isPeriodFrozen(period)) {
    const err = new Error("PERIOD_FROZEN: this settlement week is closed and cannot accept new movements");
    (err as Error & { code?: string }).code = "PERIOD_FROZEN";
    throw err;
  }
}
