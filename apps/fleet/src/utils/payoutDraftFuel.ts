import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { Trip } from '../types/data';
import type { PayoutPeriodRow, PayoutStatus } from '../types/driverPayoutPeriod';
import { FuelCalculationService } from '../services/fuelCalculationService';
import type { FuelEntry, MileageAdjustment, FuelScenario } from '../types/fuel';
import { computePeriodSettlement } from './driverPeriodSettlement';

/**
 * Draft driver fuel share keyed by period start (yyyy-MM-dd), matching Expenses fuel view.
 */
export function buildDraftFuelByPeriod(params: {
  periods: Array<{ periodStart: Date; periodEnd: Date }>;
  vehicles: any[];
  trips: Trip[];
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  scenarios: FuelScenario[];
}): Record<string, { deduction: number; fleetShare: number }> {
  const { periods, vehicles, trips, fuelEntries, adjustments, scenarios } = params;
  const out: Record<string, { deduction: number; fleetShare: number }> = {};
  if (!vehicles?.length || !periods.length) return out;

  for (const { periodStart, periodEnd } of periods) {
    const key = format(periodStart, 'yyyy-MM-dd');
    let deduction = 0;
    let fleetShare = 0;
    for (const vehicle of vehicles) {
      try {
        const report = FuelCalculationService.calculateReconciliation(
          vehicle,
          periodStart,
          periodEnd,
          trips,
          fuelEntries,
          adjustments,
          scenarios,
        );
        deduction += report.driverShare || 0;
        fleetShare += report.companyShare || 0;
      } catch {
        // Skip vehicle on draft failure — estimate stays partial.
      }
    }
    out[key] = {
      deduction: Math.round(deduction * 100) / 100,
      fleetShare: Math.round(fleetShare * 100) / 100,
    };
  }
  return out;
}

/**
 * Overlay draft fuel onto rows that are not fuel-locked (Payout estimates).
 * Does not change isFinalized / status — Settlement stays locked.
 */
export function applyDraftFuelToPayoutRows(
  rows: PayoutPeriodRow[],
  draftFuelByPeriod: Record<string, { deduction: number; fleetShare?: number }>,
  unifiedToll = true,
): PayoutPeriodRow[] {
  if (!rows.length || !Object.keys(draftFuelByPeriod).length) return rows;

  return rows.map((row) => {
    if (row.isFinalized) return row;
    const key = format(row.periodStart, 'yyyy-MM-dd');
    const draft = draftFuelByPeriod[key];
    if (!draft) {
      return { ...row, isEstimate: true };
    }

    const fuelDeduction = Math.max(0, Number(draft.deduction) || 0);
    const draftFleet = Math.max(0, Number(draft.fleetShare) || 0);
    const fuelCredits = Math.max(row.fuelCredits || 0, draftFleet);
    const tollPersonal = Math.max(0, row.personalTollCharge ?? 0);

    let netPayout: number;
    let totalDeductions: number;
    if (unifiedToll) {
      totalDeductions = fuelDeduction;
      netPayout = computePeriodSettlement({
        driverShare: row.driverShare,
        fuelDeduction,
        baseCashOwed: 0,
        baseCashPaid: 0,
        tollCashWash: 0,
        tollPersonal: 0,
        fuelCredits: 0,
      }).netPayout;
    } else {
      totalDeductions = (row.tollExpenses || 0) + fuelDeduction;
      netPayout = row.driverShare - totalDeductions;
    }

    const expenseDeductions = fuelDeduction + tollPersonal;

    return {
      ...row,
      fuelDeduction,
      fuelCredits,
      totalDeductions,
      expenseDeductions,
      netPayout,
      isEstimate: true,
    };
  });
}

const STATUS_RANK: Record<PayoutStatus, number> = {
  Pending: 0,
  'Awaiting Cash': 1,
  Finalized: 2,
};

/** Roll weekly paycheck rows into calendar months (cash-aware). */
export function rollupWeeklyPayoutRowsToMonthly(weeks: PayoutPeriodRow[]): PayoutPeriodRow[] {
  const groups = new Map<string, PayoutPeriodRow[]>();
  for (const w of weeks) {
    const key = format(w.periodStart, 'yyyy-MM');
    const list = groups.get(key) || [];
    list.push(w);
    groups.set(key, list);
  }

  const months: PayoutPeriodRow[] = [];
  for (const [, list] of Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a))) {
    const periodStart = startOfMonth(list[0].periodStart);
    const periodEnd = endOfMonth(list[0].periodStart);
    const isFinalized = list.every((r) => r.isFinalized);
    const isEstimate = !isFinalized || list.some((r) => r.isEstimate);
    let worst: PayoutStatus = 'Finalized';
    for (const r of list) {
      if (STATUS_RANK[r.status] < STATUS_RANK[worst]) worst = r.status;
    }

    const sum = (fn: (r: PayoutPeriodRow) => number) =>
      Math.round(list.reduce((s, r) => s + fn(r), 0) * 100) / 100;

    months.push({
      periodStart,
      periodEnd,
      grossRevenue: sum((r) => r.grossRevenue),
      driverSharePercent: list[0].driverSharePercent,
      driverShare: sum((r) => r.driverShare),
      tollExpenses: sum((r) => r.tollExpenses),
      tollReconciled: sum((r) => r.tollReconciled),
      tollUnreconciled: sum((r) => r.tollUnreconciled),
      disputeRefundMatched: sum((r) => r.disputeRefundMatched || 0),
      disputeRefundUnmatched: sum((r) => r.disputeRefundUnmatched || 0),
      fuelDeduction: sum((r) => r.fuelDeduction),
      fuelCredits: sum((r) => r.fuelCredits),
      totalDeductions: sum((r) => r.totalDeductions),
      expenseDeductions: sum((r) => r.expenseDeductions || 0),
      netPayout: sum((r) => r.netPayout),
      isFinalized,
      isEstimate,
      tripCount: sum((r) => r.tripCount),
      tierName: list.length === 1 ? list[0].tierName : 'Mixed',
      cashOwed: sum((r) => r.cashOwed),
      cashPaid: sum((r) => r.cashPaid),
      cashBalance: sum((r) => r.cashBalance),
      passengerCash: sum((r) => r.passengerCash ?? r.cashOwed),
      cashTollWash: sum((r) => r.cashTollWash || 0),
      personalTollCharge: sum((r) => r.personalTollCharge || 0),
      bankSettled: sum((r) => r.bankSettled || 0),
      status: worst,
    });
  }
  return months;
}
