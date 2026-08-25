import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { StepId } from '../utils/tollPeriodGating';

export interface ReconciliationPeriod {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  status: 'outstanding' | 'in_progress' | 'reconciled';
  actionableTotal: number;
  counts: Record<StepId, { actionable: number; informational: number }>;
  /** Same Reimbursed rule as the wizard cards (includes resolved trip credits). */
  financials?: {
    tollSpend: number;
    reimbursedByPlatform: number;
    matchedDisputeRefundAmount: number;
    chargedToDrivers: number;
    netTollLoss: number;
    resolvedRefundsAmount: number;
  };
}

/** All-time (not period-scoped) financial snapshot — the pre-redesign dashboard cards. */
export interface ReconciliationTotals {
  tollSpend: number;
  reimbursedByPlatform: number;
  matchedDisputeRefundAmount: number;
  chargedToDrivers: number;
  netTollLoss: number;
  needsReviewCount: number;
  tollsNeedingReviewCount: number;
  refundsNeedingReviewCount: number;
  resolvedRefundsAmount: number;
  /** Tag usages with no matching Business Finance toll_charge (repair via canonical-backfill types=tolls). */
  missingCanonicalChargeCount?: number;
}

const EMPTY_TOTALS: ReconciliationTotals = {
  tollSpend: 0,
  reimbursedByPlatform: 0,
  matchedDisputeRefundAmount: 0,
  chargedToDrivers: 0,
  netTollLoss: 0,
  needsReviewCount: 0,
  tollsNeedingReviewCount: 0,
  refundsNeedingReviewCount: 0,
  resolvedRefundsAmount: 0,
};

export const TOLL_RECONCILIATION_PERIODS_KEY = 'toll-reconciliation-periods';

type PeriodsPayload = {
  periods: ReconciliationPeriod[];
  totals: ReconciliationTotals;
  workflowStageBackfillComplete: boolean;
};

/**
 * Period-first landing data for Toll Reconciliation (Phase F3) — backed by
 * GET /toll-reconciliation/periods. Wave 2 Dev D: React Query (QueryClientProvider
 * is wired in App.tsx).
 */
export function useTollReconciliationPeriods(driverId?: string) {
  const queryKey = [TOLL_RECONCILIATION_PERIODS_KEY, driverId ?? null] as const;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PeriodsPayload> => {
      const res = await api.getTollReconciliationPeriods({ driverId });
      return {
        periods: res.periods || [],
        totals: res.totals || EMPTY_TOTALS,
        workflowStageBackfillComplete: res.workflowStageBackfillComplete !== false,
      };
    },
  });

  const periods = query.data?.periods ?? [];
  const totals = query.data?.totals ?? EMPTY_TOTALS;
  const workflowStageBackfillComplete = query.data?.workflowStageBackfillComplete ?? true;

  const outstanding = periods.filter((p) => p.status === 'outstanding');
  const inProgress = periods.filter((p) => p.status === 'in_progress');
  const reconciled = periods.filter((p) => p.status === 'reconciled');

  return {
    periods,
    outstanding,
    inProgress,
    reconciled,
    totals,
    workflowStageBackfillComplete,
    loading: query.isLoading,
    loadError: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Could not load tolls'
      : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
