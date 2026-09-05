/**
 * Shared React Query cache for driver transactions (Cash Wallet / Financials).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export function driverTransactionsQueryKey(expandedIds: string[]) {
  const key = [...expandedIds].filter(Boolean).sort().join('|');
  return ['driverTransactions', key] as const;
}

export function useDriverTransactions(
  expandedIds: string[],
  options?: { enabled?: boolean }
) {
  const ids = useMemo(
    () => [...expandedIds].filter(Boolean).sort(),
    [expandedIds]
  );
  const enabled = options?.enabled !== false && ids.length > 0;

  const query = useQuery({
    queryKey: driverTransactionsQueryKey(ids),
    queryFn: () => api.getAllTransactionsForDrivers(ids),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  return {
    transactions: (query.data || []).filter(Boolean),
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError,
    refetch: query.refetch,
  };
}
