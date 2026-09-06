/**
 * Shared select lists for driver_financial_periods queue queries.
 * Guard against S1-9: mapper must never read a column the SELECT omitted.
 */

/** Columns required by mapPeriodListRow + overpaid/mismatch metadata reads. */
export const PERIOD_LIST_SELECT =
  "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count, metadata";

/** Snake_case columns the period list mapper reads (including nested metadata). */
export const PERIOD_LIST_MAPPER_COLUMNS = [
  "driver_id",
  "period_anchor",
  "period_end",
  "settlement_amount",
  "settlement_paid",
  "cash_collected",
  "cash_returned",
  "cash_still_held",
  "payout_net",
  "settlement_status",
  "fuel_finalized",
  "trip_count",
  "metadata",
] as const;

/** Reconciled list needs extra gross/share columns. */
export const RECONCILED_PERIOD_LIST_SELECT =
  "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, cash_written_off, payout_net, settlement_status, fuel_finalized, trip_count, earnings_gross, driver_share, fleet_share, driver_share_percent, fuel_deduction, fuel_fleet_share, toll_charged_to_driver, toll_cash_spend, tips_paid_to_driver, tips_withheld, metadata";

export function selectIncludesColumns(
  selectClause: string,
  required: readonly string[],
): string[] {
  const parts = new Set(
    selectClause
      .split(",")
      .map((s) => s.trim().split(/\s+/)[0]?.toLowerCase())
      .filter(Boolean),
  );
  return required.filter((c) => !parts.has(c.toLowerCase()));
}
