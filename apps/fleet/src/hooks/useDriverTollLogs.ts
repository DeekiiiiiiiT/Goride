/**
 * Shared React Query cache for per-driver toll logs (ledger + legacy merge on server).
 * getTollLogs accepts a single driverId — batch via fetchTollLogsForDriverIds helper.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export function driverTollLogsQueryKey(expandedIds: string[]) {
  const key = [...expandedIds].filter(Boolean).sort().join('|');
  return ['driverTollLogs', key] as const;
}

/**
 * Batch helper: one request per id (server has no multi-driverId query yet).
 * TODO: when GET /toll-logs supports driverIds=, collapse to a single fetch.
 */
export async function fetchTollLogsForDriverIds(ids: string[]): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const responses = await Promise.all(
    unique.map((id) =>
      api.getTollLogs({ driverId: id }).catch(() => ({ data: [] as any[] })),
    ),
  );
  return (responses || []).flatMap((r: any) => (r && Array.isArray(r.data) ? r.data : []));
}

export function useDriverTollLogs(
  expandedIds: string[],
  options?: { enabled?: boolean },
) {
  const ids = useMemo(
    () => [...expandedIds].filter(Boolean).sort(),
    [expandedIds],
  );
  const enabled = options?.enabled !== false && ids.length > 0;

  const query = useQuery({
    queryKey: driverTollLogsQueryKey(ids),
    queryFn: () => fetchTollLogsForDriverIds(ids),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  return {
    tollLogs: query.data || [],
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError,
    refetch: query.refetch,
  };
}
