/**
 * Shared React Query cache for per-driver toll logs (ledger + legacy merge on server).
 * Batches via getTollLogs({ driverIds }) — one request for all expanded aliases.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export function driverTollLogsQueryKey(expandedIds: string[]) {
  const key = [...expandedIds].filter(Boolean).sort().join('|');
  return ['driverTollLogs', key] as const;
}

/** One batched GET /toll-logs?driverIds=… (falls back to empty on error). */
export async function fetchTollLogsForDriverIds(ids: string[]): Promise<any[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  try {
    const res = await api.getTollLogs({ driverIds: unique });
    return Array.isArray(res?.data) ? res.data : [];
  } catch {
    return [];
  }
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
