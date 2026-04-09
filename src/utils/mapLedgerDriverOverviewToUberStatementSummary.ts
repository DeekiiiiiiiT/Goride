import type { LedgerDriverOverview } from '../types/data';
import type { StatementSummary } from '../types/statementSummary';

/**
 * Mirrors the ledger-backed Uber math in `OverviewMetricsGrid` (Period earnings modal)
 * so Statement Summary (driver scope) matches that breakdown.
 */
export function mapLedgerDriverOverviewToUberStatementSummary(
  overview: LedgerDriverOverview,
  periodStart: string,
  periodEnd: string,
): StatementSummary | null {
  const ul = overview.period?.uber;
  if (!ul) return null;

  const u = overview.platformStats?.Uber;
  const priorAdj = Number(ul.priorPeriodAdjustments) || 0;
  const stmtTotal = Number(ul.statementTotalEarnings);
  const sumAsSeparateLines =
    (ul.fareComponents ?? 0) + (ul.promotions ?? 0) + (ul.tips ?? 0) + priorAdj;
  const matchesStmtAsSeparate =
    Number.isFinite(stmtTotal) && Math.abs(sumAsSeparateLines - stmtTotal) < 0.05;
  const periodTips =
    priorAdj > 0.005 &&
    (ul.tips ?? 0) > priorAdj + 0.005 &&
    !matchesStmtAsSeparate
      ? Math.max(0, (ul.tips ?? 0) - priorAdj)
      : ul.tips ?? 0;

  const refundsMag = ul.refundExpense;
  const tollSupportAmt = Number(overview.period.disputeRefunds) || 0;
  const tollsSub =
    (u?.tolls || 0) > 0.005 ? u!.tolls : Math.max(0, refundsMag - tollSupportAmt);

  const periodTotalEarnings =
    (ul.fareComponents ?? 0) + (ul.promotions ?? 0) + periodTips;

  const payoutCash = (u?.cashCollected || 0) > 0.005 ? u!.cashCollected : 0;
  const bankMag = Math.abs(Number(overview.period.bankTransferred) || 0);

  const tripCount = Number(u?.tripCount) || 0;

  const round2 = (n: number) => Number(n.toFixed(2));

  return {
    platform: 'Uber',
    periodStart,
    periodEnd,
    sourceType: 'computed',
    netFare: round2(ul.fareComponents ?? 0),
    promotions: round2(ul.promotions ?? 0),
    tips: round2(periodTips),
    totalEarnings: round2(periodTotalEarnings),
    tolls: round2(tollsSub),
    tollAdjustments: round2(tollSupportAmt),
    totalRefundsExpenses: round2(tollsSub + tollSupportAmt),
    periodAdjustments: round2(priorAdj),
    cashCollected: round2(payoutCash),
    bankTransfer: round2(bankMag),
    totalPayout: round2(payoutCash + bankMag),
    tripCount,
  };
}

/** Replace or prepend Uber row so it matches Period earnings modal (`driver-overview`). */
export function mergeUberStatementSummaryFromDriverOverview(
  summaries: StatementSummary[],
  overview: LedgerDriverOverview | undefined,
  periodStart: string,
  periodEnd: string,
): StatementSummary[] {
  if (!overview) return summaries;
  const mapped = mapLedgerDriverOverviewToUberStatementSummary(overview, periodStart, periodEnd);
  if (!mapped) return summaries;
  const idx = summaries.findIndex((s) => s.platform === 'Uber');
  if (idx >= 0) {
    const next = [...summaries];
    next[idx] = mapped;
    return next;
  }
  return [mapped, ...summaries];
}
