/**
 * Shared weekly driver financial periods — one React Query key for
 * Expenses / Settlement / Payout / Reconciliation invalidation.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { api } from '../services/api';
import type { PayoutPeriodRow, PayoutStatus } from '../types/driverPayoutPeriod';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export const DRIVER_FINANCIAL_PERIODS_KEY = 'driverFinancialPeriods';

export type DriverFinancialPeriodClient = {
  id?: string;
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  timezone?: string;
  status: 'open' | 'closed' | 'reopened' | string;
  tollSpend: number;
  tollCashSpend: number;
  tollTagSpend: number;
  tollReimbursed: number;
  tollChargedToDriver: number;
  tollUnmatchedCount: number;
  tollReconciledCount: number;
  tollWorkflowActionable: number;
  disputeRefundMatched: number;
  disputeRefundUnmatched: number;
  fuelDriverSpend: number;
  fuelGasCardSpend: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  fuelNetPay: number;
  fuelFinalized: boolean;
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  tripCount: number;
  tierId?: string | null;
  tierName?: string | null;
  cashCollected: number;
  cashReturned: number;
  cashStillHeld: number;
  settlementAmount: number;
  payoutNet: number;
  settlementStatus: string;
  payoutStatus: string;
  tollStatus: string;
  sourceEventHash?: string;
  projectionVersion?: number;
  projectedAt?: string;
  lines?: unknown[];
};

export function driverFinancialPeriodsQueryKey(driverId: string) {
  return [DRIVER_FINANCIAL_PERIODS_KEY, driverId] as const;
}

export function useDriverFinancialPeriods(driverId: string) {
  return useQuery({
    queryKey: driverFinancialPeriodsQueryKey(driverId),
    queryFn: async (): Promise<DriverFinancialPeriodClient[]> => {
      const res = await api.getDriverFinancialPeriods(driverId);
      return Array.isArray(res?.data) ? (res.data as DriverFinancialPeriodClient[]) : [];
    },
    enabled: Boolean(driverId),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });
}

/** Invalidate after toll/fuel/earnings/cash mutations so all four tabs refresh together. */
export function useInvalidateDriverFinancialPeriods() {
  const qc = useQueryClient();
  return (driverId?: string) => {
    if (driverId) {
      return qc.invalidateQueries({ queryKey: driverFinancialPeriodsQueryKey(driverId) });
    }
    return qc.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
  };
}

function mapPayoutStatus(p: DriverFinancialPeriodClient): PayoutStatus {
  const s = String(p.payoutStatus || '').toLowerCase();
  if (s === 'finalized') return 'Finalized';
  if (s === 'awaiting_cash') return 'Awaiting Cash';
  if (p.fuelFinalized) return Number(p.cashStillHeld) > 0.5 ? 'Awaiting Cash' : 'Finalized';
  return 'Pending';
}

/** Build Settlement/Payout weekly rows directly from the shared period projection. */
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

/**
 * @deprecated Prefer periodsToPayoutPeriodRows — kept for daily/monthly fallback overlays.
 * Overlay shared-period toll/fuel fields onto weekly payout rows (Monday anchors).
 */
export function overlaySharedPeriodsOntoPayoutRows<T extends {
  periodStart: Date;
  tollExpenses: number;
  tollReconciled: number;
  tollUnreconciled: number;
  disputeRefundMatched: number;
  disputeRefundUnmatched: number;
  fuelDeduction: number;
  fuelCredits: number;
  personalTollCharge?: number;
  cashTollWash?: number;
  isFinalized: boolean;
  driverShare?: number;
  grossRevenue?: number;
  netPayout?: number;
  cashOwed?: number;
  cashPaid?: number;
  cashBalance?: number;
  passengerCash?: number;
  tripCount?: number;
  driverSharePercent?: number;
  tierName?: string;
}>(rows: T[], periods: DriverFinancialPeriodClient[] | undefined | null): T[] {
  if (!periods?.length || !rows.length) return rows;
  const byAnchor = new Map<string, DriverFinancialPeriodClient>();
  for (const p of periods) {
    const a = String(p.periodAnchor || '').slice(0, 10);
    if (a) byAnchor.set(a, p);
  }
  return rows.map((row) => {
    const key = [
      row.periodStart.getFullYear(),
      String(row.periodStart.getMonth() + 1).padStart(2, '0'),
      String(row.periodStart.getDate()).padStart(2, '0'),
    ].join('-');
    const p = byAnchor.get(key);
    if (!p) return row;
    const passengerCash = Number(p.cashCollected) || 0;
    const cashPaid = Number(p.cashReturned) || 0;
    return {
      ...row,
      tollExpenses: Number(p.tollChargedToDriver) || 0,
      tollReconciled: Number(p.tollReconciledCount) || 0,
      tollUnreconciled: Number(p.tollUnmatchedCount) || 0,
      disputeRefundMatched: Number(p.disputeRefundMatched) || 0,
      disputeRefundUnmatched: Number(p.disputeRefundUnmatched) || 0,
      personalTollCharge: Number(p.tollChargedToDriver) || 0,
      cashTollWash: Number(p.tollCashSpend) || 0,
      fuelDeduction: Number(p.fuelDeduction) || row.fuelDeduction,
      fuelCredits: Number(p.fuelFleetShare) || row.fuelCredits,
      isFinalized: p.fuelFinalized ? true : row.isFinalized,
      driverShare: Number(p.driverShare) || row.driverShare,
      grossRevenue: Number(p.earningsGross) || row.grossRevenue,
      netPayout: Number(p.payoutNet) || row.netPayout,
      cashOwed: passengerCash,
      cashPaid,
      cashBalance: Math.round((passengerCash - cashPaid) * 100) / 100,
      passengerCash,
      tripCount: Number(p.tripCount) || row.tripCount,
      driverSharePercent: Number(p.driverSharePercent) || row.driverSharePercent,
      tierName: p.tierName || row.tierName,
    };
  });
}
