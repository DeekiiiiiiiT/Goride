/**
 * React Query infinite loader for driver earnings history (Financials period SSOT).
 * Flat earningsHistoryQueryKey stays for useDriverPayoutPeriodRows (first-page useQuery).
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type EarningsPeriodType = 'daily' | 'weekly' | 'monthly';

/** First-page / payout-row cache key — do not share with useInfiniteQuery. */
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

/** Infinite scroll cache — namespaced so flat useQuery cache is never corrupted. */
export function earningsHistoryInfiniteQueryKey(
  driverId: string,
  periodType: EarningsPeriodType,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  return [
    'driverEarningsHistory',
    'infinite',
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

export function getEarningsHistoryNextPageParam(
  last: EarningsHistoryPage,
): string | undefined {
  if (!last.hasMore || !last.nextCursor) return undefined;
  return last.nextCursor;
}

/** Flatten pages and dedupe by periodStart (cursor pages can overlap on edges). */
export function flattenEarningsHistoryPages(
  pages: EarningsHistoryPage[] | undefined,
): any[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const page of pages) {
    for (const row of page.data || []) {
      const key = String(row?.periodStart ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

async function fetchEarningsHistoryPage(opts: {
  driverId: string;
  periodType: EarningsPeriodType;
  startDate?: string;
  endDate?: string;
  cursor: string | null;
}): Promise<EarningsHistoryPage> {
  const { driverId, periodType, startDate, endDate, cursor } = opts;
  const res = await api.getLedgerEarningsHistory({
    driverId,
    periodType,
    startDate,
    endDate,
    cursor: cursor || undefined,
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
}

export function useDriverEarningsHistory(opts: {
  driverId: string;
  periodType: EarningsPeriodType;
  startDate?: string;
  endDate?: string;
}) {
  const { driverId, periodType, startDate, endDate } = opts;
  const enabled = Boolean(driverId && startDate && endDate);

  const query = useInfiniteQuery({
    queryKey: earningsHistoryInfiniteQueryKey(driverId, periodType, startDate, endDate),
    queryFn: ({ pageParam }) =>
      fetchEarningsHistoryPage({
        driverId,
        periodType,
        startDate,
        endDate,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: getEarningsHistoryNextPageParam,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  const rows = useMemo(
    () => flattenEarningsHistoryPages(query.data?.pages),
    [query.data?.pages],
  );

  return {
    rows,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loading: query.isLoading || (query.isFetching && !query.isFetchingNextPage),
    error: query.isError,
    success: query.isSuccess,
    readModel: query.data?.pages?.[0]?.readModel,
    refetch: query.refetch,
  };
}
