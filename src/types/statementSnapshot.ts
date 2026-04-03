/**
 * Phase 4 — Uber statement SSOT (logical snapshot shape).
 *
 * **Persistence (v1):** Immutable canonical rows — primarily `statement_line` with
 * `metadata.lineCode`, plus `payout_cash` / `payout_bank` and `toll_support_adjustment`
 * from import (`buildCanonicalImportEvents`). No separate `statement_snapshot:*` KV in v1.
 */

export interface UberStatementSnapshot {
  driverId: string;
  periodStart: string;
  periodEnd: string;
  totalEarnings?: number;
  netFareStatement?: number;
  tipsStatement?: number;
  promotionsStatement?: number;
  /** Positive magnitude (matches Uber CSV “Refunds & expenses” style). */
  refundsAndExpenses?: number;
  /** Toll-only refunds from `payments_organization` when present. */
  refundsToll?: number;
  cashCollected?: number;
  bankTransferred?: number;
}
