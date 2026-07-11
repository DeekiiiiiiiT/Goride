import { differenceInCalendarDays } from 'date-fns';

/**
 * The ONE shared period-overlap aggregator for finalized fuel reconciliation reports.
 * Sums driverShare/companyShare/driverSpend/netPay for every finalized report whose
 * week overlaps a given period, with optional daily apportionment.
 *
 * This replaces three independently-drifted copies of the same logic that used to
 * live in DriverExpensesHistory.tsx, SettlementSummaryView.tsx, and
 * buildLedgerPayoutPeriodRows.ts — each summed driverShare slightly differently
 * (weekly-only vs daily-apportioned, with/without fleetShare, with/without
 * driverSpend/netPay). Every consumer of finalized-report period totals should call
 * this instead of re-deriving it.
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface PeriodDeductionResult {
  /** Sum of driverShare (the driver's fuel-cost share) for reports overlapping the period. */
  deduction: number;
  /** Sum of companyShare for reports overlapping the period. */
  fleetShare: number;
  /** Sum of driverSpend (cash the driver already paid out-of-pocket for fuel) for reports overlapping the period. */
  driverSpend: number;
  /** Sum of netPay (driverSpend − driverShare; positive = company owes the driver) for reports overlapping the period. */
  netPay: number;
  /** True if at least one finalized report overlaps this period. */
  finalized: boolean;
}

export function getFuelDeductionForPeriod(
  finalizedReports: any[],
  periodStart: Date,
  periodEnd: Date,
  periodType: PeriodType
): PeriodDeductionResult {
  let totalDeduction = 0;
  let totalFleetShare = 0;
  let totalDriverSpend = 0;
  let totalNetPay = 0;
  let hasFinalized = false;

  for (const report of finalizedReports || []) {
    const rStartRaw = report.weekStart ?? report.periodStart ?? '';
    const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
    const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
    const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

    // Check overlap: report range intersects period range
    if (rStart <= periodEnd && rEnd >= periodStart) {
      if (periodType === 'daily') {
        // Daily apportionment: spread the week's totals evenly across its days
        const weekDays = Math.max(1, differenceInCalendarDays(rEnd, rStart) + 1);
        totalDeduction += (report.driverShare ?? 0) / weekDays;
        totalFleetShare += (report.companyShare ?? 0) / weekDays;
        totalDriverSpend += (report.driverSpend ?? 0) / weekDays;
        totalNetPay += (report.netPay ?? 0) / weekDays;
      } else {
        totalDeduction += report.driverShare ?? 0;
        totalFleetShare += report.companyShare ?? 0;
        totalDriverSpend += report.driverSpend ?? 0;
        totalNetPay += report.netPay ?? 0;
      }
      hasFinalized = true;
    }
  }

  return {
    deduction: totalDeduction,
    fleetShare: totalFleetShare,
    driverSpend: totalDriverSpend,
    netPay: totalNetPay,
    finalized: hasFinalized,
  };
}
