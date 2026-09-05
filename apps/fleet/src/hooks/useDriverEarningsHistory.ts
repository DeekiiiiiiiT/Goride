/**
 * React Query for driver earnings history (Overview date range SSOT).
 * Supports first page + cursor pagination for "Show more".
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type EarningsPeriodType = 'daily' | 'weekly' | 'monthly';

export function earningsHistoryQueryKey(
  driverId: string,
  periodType: EarningsPeriodType,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  return [
    'driverEarningsHistory',
    driverId,
    periodType,
    startDate || '',
    endDate || '',
  ] as const;
}

export type EarningsHistoryPage = {
  data: any[];
  hasMore: boolean;
  nextCursor: string | null;
  readModel?: string;
  durationMs?: number;
};

export function useDriverEarningsHistory(opts: {
  driverId: string;
  periodType: EarningsPeriodType;
  startDate?: string;
  endDate?: string;
}) {
  const { driverId, periodType, startDate, endDate } = opts;
  const enabled = Boolean(driverId && startDate && endDate);

  const query = useQuery({
    queryKey: earningsHistoryQueryKey(driverId, periodType, startDate, endDate),
    queryFn: async (): Promise<EarningsHistoryPage> => {
      const res = await api.getLedgerEarningsHistory({
        driverId,
        periodType,
        startDate,
        endDate,
        mode: periodType === 'weekly' ? 'periods' : 'ledger',
      });
      if (!res.success || !res.data) {
        return { data: [], hasMore: false, nextCursor: null, readModel: res.readModel };
      }
      return {
        data: res.data as any[],
        hasMore: Boolean(res.hasMore),
        nextCursor: res.nextCursor || null,
        readModel: res.readModel,
        durationMs: res.durationMs,
      };
    },
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  const rows = useMemo(() => query.data?.data || [], [query.data]);

  return {
    rows,
    hasMore: Boolean(query.data?.hasMore),
    nextCursor: query.data?.nextCursor || null,
    loading: query.isLoading || query.isFetching,
    error: query.isError,
    success: query.isSuccess,
    readModel: query.data?.readModel,
    refetch: query.refetch,
  };
}
