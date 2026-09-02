import { differenceInCalendarDays, format } from 'date-fns';
import { resolveReportGasCardSpend } from './fuelPaidByDriver';

/**
 * The ONE shared period-overlap aggregator for finalized fuel reconciliation reports.
 * Sums driverShare/companyShare/driverSpend/gasCardSpend/netPay for every finalized report whose
 * week overlaps a given period, with optional daily apportionment.
 *
 * `finalized` follows Consumption Reconciliation week lock — not merely “a snapshot exists.”
 * Pass `lockedWeekStarts` (Monday YYYY-MM-DD) when the caller knows which weeks are locked;
 * without that set, finalized stays false so Expenses cannot paint Finalized from stale KV alone.
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface PeriodDeductionResult {
  /** Sum of driverShare (the driver's fuel-cost share) for reports overlapping the period. */
  deduction: number;
  /** Sum of companyShare for reports overlapping the period. */
  fleetShare: number;
  /** Sum of driverSpend (cash the driver already paid out-of-pocket for fuel) for reports overlapping the period. */
  driverSpend: number;
  /** Sum of company gas-card charges for reports overlapping the period. */
  gasCardSpend: number;
  /** Sum of netPay (driverSpend − driverShare; positive = company owes the driver) for reports overlapping the period. */
  netPay: number;
  /** True only when overlapping report week(s) are in lockedWeekStarts (recon lock). */
  finalized: boolean;
  /** True if at least one overlapping report contributed amounts (regardless of lock). */
  hasReport: boolean;
}

export type FuelDeductionForPeriodOpts = {
  /** Monday week keys locked in fuel_reconciliation_period. */
  lockedWeekStarts?: Set<string> | string[];
};

function asLockedSet(locked?: Set<string> | string[]): Set<string> | null {
  if (!locked) return null;
  if (locked instanceof Set) return locked;
  return new Set(locked.map((w) => String(w).slice(0, 10)));
}

function reportWeekKey(report: any): string {
  return String(report.weekStart ?? report.periodStart ?? report.startDate ?? '').slice(0, 10);
}

export function getFuelDeductionForPeriod(
  finalizedReports: any[],
  periodStart: Date,
  periodEnd: Date,
  periodType: PeriodType,
  opts?: FuelDeductionForPeriodOpts,
): PeriodDeductionResult {
  let totalDeduction = 0;
  let totalFleetShare = 0;
  let totalDriverSpend = 0;
  let totalGasCardSpend = 0;
  let totalNetPay = 0;
  let hasReport = false;
  let anyLockedOverlap = false;
  const locked = asLockedSet(opts?.lockedWeekStarts);

  for (const report of finalizedReports || []) {
    const rStartRaw = report.weekStart ?? report.periodStart ?? '';
    const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
    const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
    const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

    // Check overlap: report range intersects period range
    if (rStart <= periodEnd && rEnd >= periodStart) {
      const gasCard = resolveReportGasCardSpend(report);
      if (periodType === 'daily') {
        const weekDays = Math.max(1, differenceInCalendarDays(rEnd, rStart) + 1);
        totalDeduction += (report.driverShare ?? 0) / weekDays;
        totalFleetShare += (report.companyShare ?? 0) / weekDays;
        totalDriverSpend += (report.driverSpend ?? 0) / weekDays;
        totalGasCardSpend += gasCard / weekDays;
        totalNetPay += (report.netPay ?? 0) / weekDays;
      } else {
        totalDeduction += report.driverShare ?? 0;
        totalFleetShare += report.companyShare ?? 0;
        totalDriverSpend += report.driverSpend ?? 0;
        totalGasCardSpend += gasCard;
        totalNetPay += report.netPay ?? 0;
      }
      hasReport = true;
      const wk = reportWeekKey(report) || format(rStart, 'yyyy-MM-dd');
      if (locked?.has(wk)) anyLockedOverlap = true;
    }
  }

  return {
    deduction: totalDeduction,
    fleetShare: totalFleetShare,
    driverSpend: totalDriverSpend,
    gasCardSpend: totalGasCardSpend,
    netPay: totalNetPay,
    hasReport,
    // Without an explicit lock set, never claim Finalized (avoids Expenses false green).
    finalized: locked != null && hasReport && anyLockedOverlap,
  };
}
