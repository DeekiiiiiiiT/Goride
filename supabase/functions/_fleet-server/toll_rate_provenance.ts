/**
 * Pricing provenance for toll ledger rows.
 *
 * Expected cost used to be re-derived from whichever rate card was current at
 * read time. That meant publishing a back-dated card silently rewrote what a
 * settled toll "should" have cost, and re-flagged closed reconciliations as
 * drift. Once a toll reaches a closing status its rate card is frozen onto the
 * row and read back from there.
 *
 * Kept separate from toll_controller.tsx so these rules can be unit-tested
 * without booting the server.
 */

/** Statuses that close a toll's pricing. After these the rate must not move. */
export const RATE_STAMPING_STATUSES = new Set([
  "reconciled",
  "approved",
  "resolved",
  "rejected",
]);

export interface RateStampRow {
  status?: string | null;
  isReconciled?: boolean | null;
  rateScheduleVersionId?: string | null;
  officialAmount?: number | null;
  officialEffectiveFrom?: string | null;
}

export interface RateStamp {
  officialAmount: number;
  rateScheduleVersionId: string;
  officialEffectiveFrom: string | null;
}

/**
 * The frozen rate for a row, or null when it has none and must be resolved live.
 * A stamp without a positive amount is treated as absent — a zero official rate
 * is an incomplete card, not a price.
 */
export function readRateStamp(row: RateStampRow | null | undefined): RateStamp | null {
  if (!row?.rateScheduleVersionId) return null;
  const amount = Number(row.officialAmount);
  if (!(amount > 0)) return null;
  return {
    officialAmount: amount,
    rateScheduleVersionId: String(row.rateScheduleVersionId),
    officialEffectiveFrom: row.officialEffectiveFrom ?? null,
  };
}

/**
 * Whether this row should have its rate frozen now.
 *
 * Already-stamped rows are never re-stamped: that is the whole point, and it is
 * also what keeps the write idempotent across the several reconciliation paths
 * that all funnel into the same save.
 */
export function shouldStampRate(row: RateStampRow | null | undefined): boolean {
  if (!row) return false;
  if (readRateStamp(row)) return false;
  if (row.rateScheduleVersionId) return false;
  return RATE_STAMPING_STATUSES.has(String(row.status ?? "")) || row.isReconciled === true;
}
