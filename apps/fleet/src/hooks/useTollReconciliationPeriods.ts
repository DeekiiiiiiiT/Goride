import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { StepId } from '../utils/tollPeriodGating';

export interface ReconciliationPeriod {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  status: 'outstanding' | 'reconciled';
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

/**
 * Period-first landing data for Toll Reconciliation (Phase F3) — backed by
 * the new GET /toll-reconciliation/periods aggregation endpoint, which scans
 * full history server-side so period counts stay correct regardless of how
 * many years of tolls/claims/trips a fleet has (unlike the ~1000-row-capped
 * client hooks used once a period is actually opened).
 */
export function useTollReconciliationPeriods(driverId?: string) {
  const [periods, setPeriods] = useState<ReconciliationPeriod[]>([]);
  const [totals, setTotals] = useState<ReconciliationTotals>(EMPTY_TOTALS);
  const [workflowStageBackfillComplete, setWorkflowStageBackfillComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  // Only blank the UI on first load — action refreshes stay silent
  const isInitialLoad = useRef(true);

  const fetchPeriods = useCallback(async () => {
    const blockUi = isInitialLoad.current;
    if (blockUi) setLoading(true);
    try {
      const res = await api.getTollReconciliationPeriods({ driverId });
      setPeriods(res.periods || []);
      setTotals(res.totals || EMPTY_TOTALS);
      setWorkflowStageBackfillComplete(res.workflowStageBackfillComplete !== false);
    } catch (error) {
      console.error('Failed to fetch reconciliation periods', error);
    } finally {
      isInitialLoad.current = false;
      if (blockUi) setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    isInitialLoad.current = true;
    setLoading(true);
    fetchPeriods();
  }, [fetchPeriods]);

  const outstanding = periods.filter((p) => p.status === 'outstanding');
  const reconciled = periods.filter((p) => p.status === 'reconciled');

  return {
    periods,
    outstanding,
    reconciled,
    totals,
    workflowStageBackfillComplete,
    loading,
    refresh: fetchPeriods,
  };
}
