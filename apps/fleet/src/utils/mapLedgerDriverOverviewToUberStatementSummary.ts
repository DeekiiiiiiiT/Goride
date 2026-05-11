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
  const fareC = ul.fareComponents ?? 0;
  const promoC = ul.promotions ?? 0;
  const tipsRaw = ul.tips ?? 0;
  const sumSeparatePromoPrior = fareC + promoC + tipsRaw + priorAdj;
  const sumFareEmbedsPromoPrior = fareC + tipsRaw + priorAdj;
  const stmtTol = 0.05;
  const matchesSeparatePromo =
    Number.isFinite(stmtTotal) && Math.abs(sumSeparatePromoPrior - stmtTotal) < stmtTol;
  const matchesFareEmbedsPromo =
    Number.isFinite(stmtTotal) && Math.abs(sumFareEmbedsPromoPrior - stmtTotal) < stmtTol;
  const matchesStmtAsSeparate = matchesSeparatePromo || matchesFareEmbedsPromo;
  const promotionsDoubleCountedInFare =
    matchesFareEmbedsPromo && !matchesSeparatePromo && promoC > 0.005;
  const periodTips =
    priorAdj > 0.005 &&
    tipsRaw > priorAdj + 0.005 &&
    !matchesStmtAsSeparate
      ? Math.max(0, tipsRaw - priorAdj)
      : tipsRaw;

  const refundsMag = ul.refundExpense;
  const tollSupportAmt = Number(overview.period.disputeRefunds) || 0;
  const tollsSub =
    (u?.tolls || 0) > 0.005 ? u!.tolls : Math.max(0, refundsMag - tollSupportAmt);

  const periodTotalEarnings = promotionsDoubleCountedInFare
    ? fareC + periodTips
    : fareC + promoC + periodTips;

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
