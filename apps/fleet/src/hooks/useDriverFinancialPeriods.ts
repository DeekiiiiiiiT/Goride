/**
 * Shared weekly driver financial periods — one React Query key for
 * Expenses / Settlement / Payout / Reconciliation invalidation.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
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

/** Invalidate after toll/fuel mutations so all four tabs refresh together. */
export function useInvalidateDriverFinancialPeriods() {
  const qc = useQueryClient();
  return (driverId?: string) => {
    if (driverId) {
      return qc.invalidateQueries({ queryKey: driverFinancialPeriodsQueryKey(driverId) });
    }
    return qc.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
  };
}

/** Overlay shared-period toll/fuel fields onto weekly payout rows (Monday anchors). */
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
}>(rows: T[], periods: DriverFinancialPeriodClient[] | undefined | null): T[] {
  if (!periods?.length || !rows.length) return rows;
  const byAnchor = new Map<string, DriverFinancialPeriodClient>();
  for (const p of periods) {
    const a = String(p.periodAnchor || '').slice(0, 10);
    if (a) byAnchor.set(a, p);
  }
  return rows.map((row) => {
    // Local calendar key — periodStart is already fleet Monday from payout builder.
    const key = [
      row.periodStart.getFullYear(),
      String(row.periodStart.getMonth() + 1).padStart(2, '0'),
      String(row.periodStart.getDate()).padStart(2, '0'),
    ].join('-');
    const p = byAnchor.get(key);
    if (!p) return row;
    return {
      ...row,
      tollExpenses: Number(p.tollSpend) || 0,
      tollReconciled: Number(p.tollReconciledCount) || 0,
      tollUnreconciled: Number(p.tollUnmatchedCount) || 0,
      disputeRefundMatched: Number(p.disputeRefundMatched) || 0,
      disputeRefundUnmatched: Number(p.disputeRefundUnmatched) || 0,
      personalTollCharge: Number(p.tollChargedToDriver) || 0,
      cashTollWash: Number(p.tollCashSpend) || 0,
      fuelDeduction: Number(p.fuelDeduction) || row.fuelDeduction,
      fuelCredits: Number(p.fuelFleetShare) || row.fuelCredits,
      isFinalized: p.fuelFinalized ? true : row.isFinalized,
    };
  });
}
