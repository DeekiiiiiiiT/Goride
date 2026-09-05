/**
 * Shared React Query cache for per-driver toll logs (ledger + legacy merge on server).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export function driverTollLogsQueryKey(expandedIds: string[]) {
  const key = [...expandedIds].filter(Boolean).sort().join('|');
  return ['driverTollLogs', key] as const;
}

export function useDriverTollLogs(
  expandedIds: string[],
  options?: { enabled?: boolean }
) {
  const ids = useMemo(
    () => [...expandedIds].filter(Boolean).sort(),
    [expandedIds]
  );
  const enabled = options?.enabled !== false && ids.length > 0;

  const query = useQuery({
    queryKey: driverTollLogsQueryKey(ids),
    queryFn: async () => {
      const responses = await Promise.all(
        ids.map((id) =>
          api.getTollLogs({ driverId: id }).catch(() => ({ data: [] as any[] }))
        )
      );
      return (responses || []).flatMap((r: any) =>
        r && Array.isArray(r.data) ? r.data : []
      );
    },
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
