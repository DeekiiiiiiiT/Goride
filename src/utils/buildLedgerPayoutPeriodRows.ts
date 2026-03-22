import {
  format,
  differenceInCalendarDays,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import type { FinancialTransaction, DriverMetrics } from '../types/data';
import type { PayoutPeriodRow, PayoutStatus } from '../types/driverPayoutPeriod';
import type { CashWeekData } from './cashSettlementCalc';
import { isTollCategory } from './tollCategoryHelper';

type PeriodType = 'daily' | 'weekly' | 'monthly';

export function buildLedgerPayoutPeriodRows(params: {
  ledgerLoaded: boolean;
  ledgerError: boolean;
  ledgerRows: any[];
  cashWeeks: CashWeekData[];
  transactions: FinancialTransaction[];
  finalizedReports: any[];
  periodType: PeriodType;
}): PayoutPeriodRow[] {
  const {
    ledgerLoaded,
    ledgerError,
    ledgerRows,
    cashWeeks,
    transactions,
    finalizedReports,
    periodType,
  } = params;

  const getDeductionForPeriod = (
    periodStart: Date,
    periodEnd: Date
  ): { deduction: number; fleetShare: number; finalized: boolean } => {
    let totalDeduction = 0;
    let totalFleetShare = 0;
    let hasFinalized = false;

    for (const report of finalizedReports) {
      const rStartRaw = report.weekStart ?? report.periodStart ?? '';
      const rEndRaw = report.weekEnd ?? report.periodEnd ?? '';
      const rStart = new Date(String(rStartRaw).split('T')[0] + 'T00:00:00');
      const rEnd = new Date(String(rEndRaw).split('T')[0] + 'T23:59:59');

      if (rStart <= periodEnd && rEnd >= periodStart) {
        if (periodType === 'daily') {
          const weekDays = Math.max(1, differenceInCalendarDays(rEnd, rStart) + 1);
          const dailyShare = (report.driverShare ?? 0) / weekDays;
          const dailyFleet = (report.companyShare ?? 0) / weekDays;
          totalDeduction += dailyShare;
          totalFleetShare += dailyFleet;
        } else {
          totalDeduction += report.driverShare ?? 0;
          totalFleetShare += report.companyShare ?? 0;
        }
        hasFinalized = true;
      }
    }

    return { deduction: totalDeduction, fleetShare: totalFleetShare, finalized: hasFinalized };
  };

  const expenseTx = transactions.filter(
    (t) => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0)
  );

  const getTollsForPeriod = (
    pStartTime: number,
    pEndTime: number
  ): { amount: number; reconciled: number; unreconciled: number } => {
    let tollAmount = 0;
    let reconciled = 0;
    let unreconciled = 0;
    expenseTx.forEach((tx) => {
      const d = new Date(tx.date).getTime();
      if (d >= pStartTime && d <= pEndTime) {
        if (isTollCategory(tx.category)) {
          tollAmount += Math.abs(tx.amount);
          if (tx.isReconciled) reconciled++;
          else unreconciled++;
        }
      }
    });
    return { amount: tollAmount, reconciled, unreconciled };
  };

  if (ledgerLoaded && !ledgerError && ledgerRows.length > 0) {
    const cashMap = new Map<string, CashWeekData>();
    for (const cw of cashWeeks) {
      const key = format(cw.start, 'yyyy-MM-dd');
      cashMap.set(key, cw);
    }

    const getCashForPeriod = (
      periodStart: Date,
      periodEnd: Date
    ): { cashOwed: number; cashPaid: number; cashBalance: number; fuelCredits: number } => {
      if (periodType === 'daily') {
        return { cashOwed: 0, cashPaid: 0, cashBalance: 0, fuelCredits: 0 };
      }

      if (periodType === 'monthly') {
        const mStart = startOfMonth(periodStart);
        const mEnd = endOfMonth(periodStart);
        let owed = 0,
          paid = 0,
          bal = 0,
          fCred = 0;
        for (const cw of cashWeeks) {
          if (cw.start >= mStart && cw.start <= mEnd) {
            owed += cw.amountOwed;
            paid += cw.amountPaid;
            bal += cw.balance;
            fCred += cw.weeklyFuelCredits;
          }
        }
        return { cashOwed: owed, cashPaid: paid, cashBalance: bal, fuelCredits: fCred };
      }

      const key = format(periodStart, 'yyyy-MM-dd');
      let cw = cashMap.get(key);
      if (!cw) {
        const keyDate = periodStart;
        for (const [ck, cv] of cashMap.entries()) {
          const ckDate = new Date(ck + 'T00:00:00');
          if (Math.abs(differenceInCalendarDays(keyDate, ckDate)) <= 2) {
            cw = cv;
            break;
          }
        }
      }
      if (cw) {
        return {
          cashOwed: cw.amountOwed,
          cashPaid: cw.amountPaid,
          cashBalance: cw.balance,
          fuelCredits: cw.weeklyFuelCredits,
        };
      }
      return { cashOwed: 0, cashPaid: 0, cashBalance: 0, fuelCredits: 0 };
    };

    const rows: PayoutPeriodRow[] = ledgerRows.map((lr: any) => {
      const periodStart = new Date(lr.periodStart + 'T00:00:00');
      const periodEnd = new Date(lr.periodEnd + 'T23:59:59');
      const pStartTime = periodStart.getTime();
      const pEndTime = periodEnd.getTime();

      const grossRevenue = lr.grossRevenue || 0;
      const tripCount = lr.tripCount || 0;
      const driverSharePercent = lr.tier?.sharePercentage || 0;
      const driverShare = lr.driverShare || 0;
      const tierName = lr.tier?.name || 'Default';

      const {
        amount: tollExpenses,
        reconciled: tollReconciled,
        unreconciled: tollUnreconciled,
      } = getTollsForPeriod(pStartTime, pEndTime);

      const {
        deduction: fuelDeduction,
        fleetShare,
        finalized: isFinalized,
      } = getDeductionForPeriod(periodStart, periodEnd);

      const totalDeductions = tollExpenses + fuelDeduction;
      const netPayout = driverShare - totalDeductions;

      const { cashOwed, cashPaid, cashBalance, fuelCredits: txFuelCredits } = getCashForPeriod(
        periodStart,
        periodEnd
      );

      const effectiveFuelCredits =
        txFuelCredits > 0 ? txFuelCredits : isFinalized ? fleetShare : 0;

      return {
        periodStart,
        periodEnd,
        grossRevenue,
        driverSharePercent,
        driverShare,
        tollExpenses,
        tollReconciled,
        tollUnreconciled,
        fuelDeduction,
        fuelCredits: effectiveFuelCredits,
        totalDeductions,
        netPayout,
        isFinalized,
        tripCount,
        tierName,
        cashOwed,
        cashPaid,
        cashBalance,
        status: (!isFinalized
          ? 'Pending'
          : cashBalance - effectiveFuelCredits > 0.005
            ? 'Awaiting Cash'
            : 'Finalized') as PayoutStatus,
      };
    });

    return rows;
  }

  if (ledgerLoaded && (ledgerError || ledgerRows.length === 0)) {
    console.error(
      '[buildLedgerPayoutPeriodRows] Ledger unavailable — no period rows.'
    );
  }

  return [];
}
