/**
 * Map server driver_financial_periods → PayoutPeriodRow.
 * Same mapping as apps/fleet useDriverFinancialPeriods.periodsToPayoutPeriodRows.
 */

import { parseISO } from 'date-fns';
import type {
  DriverFinancialPeriodClient,
  PayoutPeriodRow,
  PayoutStatus,
} from '../types/driverPayoutPeriod';

function mapPayoutStatus(p: DriverFinancialPeriodClient): PayoutStatus {
  const s = String(p.payoutStatus || '').toLowerCase();
  if (s === 'finalized') return 'Finalized';
  if (s === 'awaiting_cash') return 'Awaiting Cash';
  if (p.fuelFinalized) return Number(p.cashStillHeld) > 0.5 ? 'Awaiting Cash' : 'Finalized';
  return 'Pending';
}

export function periodsToPayoutPeriodRows(
  periods: DriverFinancialPeriodClient[] | undefined | null,
): PayoutPeriodRow[] {
  if (!periods?.length) return [];
  return [...periods]
    .sort((a, b) => String(b.periodAnchor).localeCompare(String(a.periodAnchor)))
    .map((p) => {
      const periodStart = parseISO(`${String(p.periodAnchor).slice(0, 10)}T00:00:00`);
      const periodEnd = parseISO(`${String(p.periodEnd).slice(0, 10)}T23:59:59`);
      const driverShare = Number(p.driverShare) || 0;
      const fuelDeduction = Number(p.fuelDeduction) || 0;
      const fuelCredits = Number(p.fuelFleetShare) || 0;
      const passengerCash = Number(p.cashCollected) || 0;
      const cashPaid = Number(p.cashReturned) || 0;
      const cashWrittenOff = Number(p.cashWrittenOff) || 0;
      const tollPersonal = Number(p.tollChargedToDriver) || 0;
      const cashTollWash = Number(p.tollCashSpend) || 0;
      const netPayout = Number(p.payoutNet) || 0;
      const cashBalance = Math.round((passengerCash - cashPaid) * 100) / 100;
      const expenseDeductions = Math.round((fuelDeduction + tollPersonal) * 100) / 100;

      return {
        periodStart,
        periodEnd,
        grossRevenue: Number(p.earningsGross) || 0,
        driverSharePercent: Number(p.driverSharePercent) || 0,
        driverShare,
        tollExpenses: tollPersonal,
        tollReconciled: Number(p.tollReconciledCount) || 0,
        tollUnreconciled: Number(p.tollUnmatchedCount) || 0,
        disputeRefundMatched: Number(p.disputeRefundMatched) || 0,
        disputeRefundUnmatched: Number(p.disputeRefundUnmatched) || 0,
        fuelDeduction,
        fuelCredits,
        totalDeductions: fuelDeduction,
        expenseDeductions,
        netPayout,
        isFinalized: !!p.fuelFinalized,
        isEstimate: !p.fuelFinalized,
        tripCount: Number(p.tripCount) || 0,
        tierName: p.tierName || 'Default',
        cashOwed: passengerCash,
        cashPaid,
        cashBalance,
        passengerCash,
        cashTollWash,
        personalTollCharge: tollPersonal,
        cashWrittenOff,
        bankSettled: 0,
        status: mapPayoutStatus(p),
        cashPaidBreakdown: {
          allocatedPayments: cashPaid,
          tollCredits: 0,
          fuelCreditsInCashPaid: 0,
          fifoPayments: 0,
          surplusPayments: 0,
        },
      };
    });
}
