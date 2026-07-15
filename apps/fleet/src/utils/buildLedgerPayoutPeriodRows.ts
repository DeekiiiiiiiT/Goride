import {
  format,
  differenceInCalendarDays,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import type { FinancialTransaction, DriverMetrics, DisputeRefund } from '../types/data';
import type { CashPaidBreakdown, PayoutPeriodRow, PayoutStatus } from '../types/driverPayoutPeriod';
import type { CashWeekData } from './cashSettlementCalc';
import { isTollCategory } from './tollCategoryHelper';
import { computePeriodSettlement } from './driverPeriodSettlement';
import { computeDisputeRefundCounts, weekBucketForDate } from './tollWeekPeriod';
import { getFuelDeductionForPeriod } from './fuelDeductionForPeriod';
import { deriveTollTxIsReconciled } from './tollHandledDisplay';
import { fleetTzDateKey } from './timezoneDisplay';
import { isDriverTollChargeRow, netDriverTollCharges } from './netDriverTollCharges';
import { classifyTollLedgerEntry } from './tollDisposition';

type PeriodType = 'daily' | 'weekly' | 'monthly';

export function buildLedgerPayoutPeriodRows(params: {
  ledgerLoaded: boolean;
  ledgerError: boolean;
  ledgerRows: any[];
  cashWeeks: CashWeekData[];
  transactions: FinancialTransaction[];
  finalizedReports: any[];
  disputeRefunds?: DisputeRefund[];
  periodType: PeriodType;
  /** Unified toll settlement: tolls leave the payout deduction, settled on cash side. */
  unifiedToll?: boolean;
  /** Fleet IANA tz — required so weekly Toll Status matches Toll Reconciliation buckets. */
  timezone?: string;
}): PayoutPeriodRow[] {
  const {
    ledgerLoaded,
    ledgerError,
    ledgerRows,
    cashWeeks,
    transactions,
    finalizedReports,
    disputeRefunds = [],
    periodType,
    unifiedToll = false,
    timezone,
  } = params;

  const getDeductionForPeriod = (periodStart: Date, periodEnd: Date) =>
    getFuelDeductionForPeriod(finalizedReports, periodStart, periodEnd, periodType);

  // Include toll-category rows regardless of `type` — toll_ledger-sourced rows
  // (merged in from GET /toll-logs) carry type:'Usage', which the plain
  // Expense/Adjustment gate below silently drops, making post-migration tolls
  // invisible even though they're present in `transactions`.
  const expenseTx = transactions.filter(
    (t) => t.type === 'Expense' || (t.type === 'Adjustment' && t.amount < 0) || isTollCategory(t.category)
  );

  const tollBelongsToPeriod = (
    txDate: string | undefined | null,
    periodStart: Date,
    periodEnd: Date,
  ): boolean => {
    if (!txDate) return false;
    if (periodType === 'daily') {
      const dayKey = timezone
        ? fleetTzDateKey(txDate, timezone)
        : String(txDate).split('T')[0];
      return dayKey === format(periodStart, 'yyyy-MM-dd');
    }
    if (periodType === 'monthly') {
      const ymd = timezone ? fleetTzDateKey(txDate, timezone) : String(txDate).slice(0, 10);
      return !!ymd && ymd.slice(0, 7) === format(periodStart, 'yyyy-MM');
    }
    // Weekly — same Monday key as Toll Reconciliation / Expenses (avoids
    // browser-local Date ranges pulling next-Monday tolls into this week).
    const periodWeekKey = format(periodStart, 'yyyy-MM-dd');
    return weekBucketForDate(txDate as any, timezone).key === periodWeekKey;
  };

  const getTollsForPeriod = (
    periodStart: Date,
    periodEnd: Date,
  ): { amount: number; reconciled: number; unreconciled: number } => {
    let tollAmount = 0;
    let reconciled = 0;
    let unreconciled = 0;
    expenseTx.forEach((tx) => {
      if (!tollBelongsToPeriod(tx.date, periodStart, periodEnd)) return;
      if (isTollCategory(tx.category)) {
        tollAmount += Math.abs(tx.amount);
        if (deriveTollTxIsReconciled(tx as any)) reconciled++;
        else unreconciled++;
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

    const emptyBreakdown = (): CashPaidBreakdown => ({
      allocatedPayments: 0,
      tollCredits: 0,
      fuelCreditsInCashPaid: 0,
      fifoPayments: 0,
      surplusPayments: 0,
    });

    const breakdownFromWeek = (cw: CashWeekData): CashPaidBreakdown => {
      const b = cw.breakdown;
      return {
        allocatedPayments: b?.allocatedPayments ?? 0,
        tollCredits: b?.tollExpenses ?? 0,
        fuelCreditsInCashPaid: b?.fuelCredits ?? 0,
        fifoPayments: b?.fifoPayments ?? 0,
        surplusPayments: b?.surplusPayments ?? 0,
      };
    };

    const getCashForPeriod = (
      periodStart: Date,
      periodEnd: Date
    ): {
      cashOwed: number;
      cashPaid: number;
      cashBalance: number;
      fuelCredits: number;
      bankSettled: number;
      cashPaidBreakdown?: CashPaidBreakdown;
    } => {
      if (periodType === 'daily') {
        return { cashOwed: 0, cashPaid: 0, cashBalance: 0, fuelCredits: 0, bankSettled: 0 };
      }

      if (periodType === 'monthly') {
        const mStart = startOfMonth(periodStart);
        const mEnd = endOfMonth(periodStart);
        let owed = 0,
          paid = 0,
          bal = 0,
          fCred = 0,
          bank = 0;
        const agg = emptyBreakdown();
        for (const cw of cashWeeks) {
          if (cw.start >= mStart && cw.start <= mEnd) {
            owed += cw.amountOwed;
            paid += cw.amountPaid;
            bal += cw.balance;
            fCred += cw.weeklyFuelCredits;
            bank += cw.bankSettled || 0;
            const br = breakdownFromWeek(cw);
            agg.allocatedPayments += br.allocatedPayments;
            agg.tollCredits += br.tollCredits;
            agg.fuelCreditsInCashPaid += br.fuelCreditsInCashPaid;
            agg.fifoPayments += br.fifoPayments;
            agg.surplusPayments += br.surplusPayments;
          }
        }
        return {
          cashOwed: owed,
          cashPaid: paid,
          cashBalance: bal,
          fuelCredits: fCred,
          bankSettled: bank,
          cashPaidBreakdown: agg,
        };
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
          bankSettled: cw.bankSettled || 0,
          cashPaidBreakdown: breakdownFromWeek(cw),
        };
      }
      return { cashOwed: 0, cashPaid: 0, cashBalance: 0, fuelCredits: 0, bankSettled: 0 };
    };

    const rows: PayoutPeriodRow[] = ledgerRows.map((lr: any) => {
      const periodStart = new Date(lr.periodStart + 'T00:00:00');
      const periodEnd = new Date(lr.periodEnd + 'T23:59:59');

      const grossRevenue = lr.grossRevenue || 0;
      const tripCount = lr.tripCount || 0;
      const driverSharePercent = lr.tier?.sharePercentage || 0;
      const driverShare = lr.driverShare || 0;
      const tierName = lr.tier?.name || 'Default';

      const {
        amount: tollExpenses,
        reconciled: tollReconciled,
        unreconciled: tollUnreconciled,
      } = getTollsForPeriod(periodStart, periodEnd);

      const {
        matched: disputeRefundMatched,
        unmatched: disputeRefundUnmatched,
      } = computeDisputeRefundCounts(disputeRefunds, periodStart, periodEnd);

      const {
        deduction: fuelDeduction,
        fleetShare,
        finalized: isFinalized,
      } = getDeductionForPeriod(periodStart, periodEnd);

      const {
        cashOwed: baseCashOwed,
        cashPaid: baseCashPaid,
        cashBalance: legacyCashBalance,
        fuelCredits: txFuelCredits,
        bankSettled,
        cashPaidBreakdown,
      } = getCashForPeriod(periodStart, periodEnd);

      // Prefer finalized fleet fuel share (companyShare) over partial Fuel Reimbursement
      // txs — otherwise Kenny-style weeks credit ~$2k instead of ~$21k fleet fuel.
      const effectiveFuelCredits = isFinalized
        ? Math.max(txFuelCredits || 0, fleetShare || 0)
        : txFuelCredits || 0;

      let displayTollExpenses = tollExpenses;
      let totalDeductions: number;
      let netPayout: number;
      let cashOwed = baseCashOwed;
      let cashPaid = baseCashPaid;
      let cashBalance = legacyCashBalance;

      // Driver settlement deductions = fuel + personal toll charges only.
      // Gross plaza toll spend is cash wash / fleet cost after reconcile — not driver take-home.
      const periodChargeTx = transactions.filter(
        (t) => t?.date && isDriverTollChargeRow(t) && tollBelongsToPeriod(t.date, periodStart, periodEnd),
      );
      const tollCharged = netDriverTollCharges(periodChargeTx);
      const expenseDeductions = fuelDeduction + tollCharged;

      // Cash-paid plaza tolls in the period (credits cash still held).
      let periodCashTollWash = 0;
      for (const tx of expenseTx) {
        if (!tollBelongsToPeriod(tx.date, periodStart, periodEnd)) continue;
        if (!isTollCategory(tx.category)) continue;
        if (isDriverTollChargeRow(tx)) continue;
        if (classifyTollLedgerEntry(tx as any) !== 'cashWash') continue;
        periodCashTollWash += Math.abs(Number(tx.amount) || 0);
      }

      if (unifiedToll) {
        // Tolls leave the payout deduction; settled once on the cash side per the
        // server's reconciliation-aware disposition (cashWeeks are toll-neutral).
        const disp = (lr as any).tollDisposition || { cashWash: 0, personal: 0 };
        const dispWash = Number(disp.cashWash) || 0;
        const tollCashWash = dispWash > 0.005 ? dispWash : periodCashTollWash;
        const tollPersonal =
          Number(disp.personal) > 0.005 ? Number(disp.personal) : tollCharged;
        const r = computePeriodSettlement({
          driverShare,
          fuelDeduction,
          baseCashOwed,
          baseCashPaid,
          tollCashWash,
          tollPersonal,
          fuelCredits: 0, // applied in getPeriodSettlementComponents via fuelCredits field
        });
        totalDeductions = fuelDeduction;
        netPayout = r.netPayout;
        cashOwed = r.cashOwed;
        cashPaid = r.cashPaid;
        cashBalance = r.cashBalance;
        displayTollExpenses = r.tollChargedToDriver;
      } else {
        totalDeductions = tollExpenses + fuelDeduction;
        netPayout = driverShare - totalDeductions;
        // Legacy: if cash tolls weren't already counted in cashPaid, credit them here.
        const tollAlreadyInPaid = cashPaidBreakdown?.tollCredits ?? 0;
        const tollExtra = Math.max(0, periodCashTollWash - tollAlreadyInPaid);
        if (tollExtra > 0.005) {
          cashPaid = cashPaid + tollExtra;
          cashBalance = cashOwed - cashPaid;
        }
      }

      return {
        periodStart,
        periodEnd,
        grossRevenue,
        driverSharePercent,
        driverShare,
        tollExpenses: displayTollExpenses,
        tollReconciled,
        tollUnreconciled,
        disputeRefundMatched,
        disputeRefundUnmatched,
        fuelDeduction,
        fuelCredits: effectiveFuelCredits,
        totalDeductions,
        expenseDeductions,
        netPayout,
        isFinalized,
        tripCount,
        tierName,
        cashOwed,
        cashPaid,
        cashBalance,
        bankSettled,
        cashPaidBreakdown,
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
