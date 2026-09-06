/**
 * Shared React Query cache for driver transactions (Cash Wallet / Financials).
 * Supports optional startDate/endDate (server GET /transactions filters).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import type { FinancialTransaction } from '../types/data';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type DriverTransactionsOpts = {
  enabled?: boolean;
  /** Server-side date filter (yyyy-MM-dd). */
  startDate?: string;
  endDate?: string;
  /** Cap rows when period is known (default 15k with dates, 50k without). */
  maxRows?: number;
};

export function driverTransactionsQueryKey(
  expandedIds: string[],
  range?: { startDate?: string; endDate?: string },
) {
  const key = [...expandedIds].filter(Boolean).sort().join('|');
  const from = range?.startDate || '';
  const to = range?.endDate || '';
  return ['driverTransactions', key, from, to] as const;
}

/** Merge RQ payment rows with toll-log rows (id-deduped). */
export function mergeDriverMoneyTransactions(
  rqTransactions: FinancialTransaction[] | null | undefined,
  tollLogs: FinancialTransaction[] | null | undefined,
): FinancialTransaction[] {
  const validTx = Array.isArray(rqTransactions) ? rqTransactions.filter(Boolean) : [];
  const tollLogRows = Array.isArray(tollLogs) ? tollLogs : [];
  const mergedById = new Map<string, FinancialTransaction>();
  for (const tx of validTx) if (tx?.id) mergedById.set(tx.id, tx);
  for (const tx of tollLogRows) if (tx?.id) mergedById.set(tx.id, tx);
  return Array.from(mergedById.values());
}

export function useDriverTransactions(
  expandedIds: string[],
  options?: DriverTransactionsOpts,
) {
  const ids = useMemo(
    () => [...expandedIds].filter(Boolean).sort(),
    [expandedIds],
  );
  const startDate = options?.startDate;
  const endDate = options?.endDate;
  const maxRows =
    options?.maxRows ??
    (startDate || endDate ? 15_000 : 50_000);
  const enabled = options?.enabled !== false && ids.length > 0;
  const queryKey = driverTransactionsQueryKey(ids, { startDate, endDate });

  const query = useQuery({
    queryKey,
    queryFn: () =>
      api.getAllTransactionsForDrivers(ids, 5000, maxRows, {
        startDate,
        endDate,
      }),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  return {
    /** Query-key for setQueryData / invalidateQueries (stable sorted ids + range). */
    queryKey,
    /** Raw RQ payload (may be undefined while idle/disabled). */
    data: query.data as FinancialTransaction[] | undefined,
    transactions: (query.data || []).filter(Boolean) as FinancialTransaction[],
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError,
    refetch: query.refetch,
  };
}
