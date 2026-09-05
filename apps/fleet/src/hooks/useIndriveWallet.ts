/**
 * Fetches GET /ledger/driver-indrive-wallet — period loads, period fees, lifetime loads.
 * React Query + optional `enabled` so Overview does not pay for this until needed.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { IndriveWalletSummary } from '../types/data';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

/** YYYY-MM-DD bounds; must match `getLedgerDriverOverview` / driver detail date filter. */
export interface IndriveWalletDateRange {
  startDate: string;
  endDate: string;
}

export function indriveWalletSummaryQueryKey(
  driverId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return ['indriveWalletSummary', driverId || '', startDate || '', endDate || ''] as const;
}

/**
 * @param enabled — when false, skips network (Overview must pass false; InDrive tab / dialog pass true).
 */
export function useIndriveWallet(
  driverId: string | undefined,
  range: IndriveWalletDateRange | null | undefined,
  options?: { enabled?: boolean }
): {
  data: IndriveWalletSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const enabledOpt = options?.enabled !== false;
  const startDate = range?.startDate;
  const endDate = range?.endDate;
  const enabled =
    enabledOpt && Boolean(driverId && startDate && endDate);

  const query = useQuery({
    queryKey: indriveWalletSummaryQueryKey(driverId, startDate, endDate),
    queryFn: async () => {
      if (!driverId || !startDate || !endDate) return null;
      return api.getDriverIndriveWallet({ driverId, startDate, endDate });
    },
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled,
  });

  const qc = useQueryClient();
  const refetch = useCallback(async () => {
    if (!enabled) return;
    await qc.invalidateQueries({
      queryKey: indriveWalletSummaryQueryKey(driverId, startDate, endDate),
    });
  }, [qc, driverId, startDate, endDate, enabled]);

  return {
    data: query.data ?? null,
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : 'Failed to load InDrive wallet'
      : null,
    refetch,
  };
}
