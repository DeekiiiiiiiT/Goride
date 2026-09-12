import type { StatementSummary } from '../types/statementSummary';
import { createEmptyStatementSummary } from '../types/statementSummary';

/** Sum Statement Summary rows for All-platforms Earnings view. */
export function aggregateStatementSummaries(rows: StatementSummary[]): StatementSummary | null {
  if (!rows.length) return null;
  const first = rows[0]!;
  const sum = (pick: (r: StatementSummary) => number) =>
    Math.round(rows.reduce((acc, r) => acc + pick(r), 0) * 100) / 100;

  return {
    ...createEmptyStatementSummary('Uber', first.periodStart, first.periodEnd, first.sourceType),
    platform: first.platform,
    periodStart: first.periodStart,
    periodEnd: first.periodEnd,
    sourceType: first.sourceType,
    netFare: sum((r) => r.netFare),
    promotions: sum((r) => r.promotions),
    tips: sum((r) => r.tips),
    totalEarnings: sum((r) => r.totalEarnings),
    statementTollExpense: sum((r) => r.statementTollExpense ?? r.tollCharges ?? 0),
    platformTollCredits: sum((r) => r.platformTollCredits ?? r.tollReimbursements ?? 0),
    uberTollCredits: sum((r) => r.uberTollCredits ?? r.platformTollCredits ?? r.tollReimbursements ?? 0),
    tolls: sum((r) => r.tolls),
    tollCharges: sum((r) => r.tollCharges ?? 0),
    tollRefunds: sum((r) => r.tollRefunds ?? 0),
    tollReimbursements: sum((r) => r.tollReimbursements ?? 0),
    tollAdjustments: sum((r) => r.tollAdjustments),
    totalRefundsExpenses: sum((r) => r.totalRefundsExpenses),
    periodAdjustments: sum((r) => r.periodAdjustments),
    cashCollected: sum((r) => r.cashCollected),
    bankTransfer: sum((r) => r.bankTransfer),
    totalPayout: sum((r) => r.totalPayout),
    tripCount: rows.reduce((acc, r) => acc + (r.tripCount ?? 0), 0),
  };
}

/** Period end balance when API has no bank balances: start 0 + earnings − refunds + adjustments − payout. */
export function computePeriodBalances(summary: StatementSummary | null | undefined): {
  startBalance: number;
  endBalance: number;
} {
  if (!summary) return { startBalance: 0, endBalance: 0 };
  const startBalance = 0;
  const endBalance =
    Math.round(
      (startBalance +
        summary.totalEarnings -
        summary.totalRefundsExpenses +
        summary.periodAdjustments -
        summary.totalPayout) *
        100,
    ) / 100;
  return { startBalance, endBalance };
}
