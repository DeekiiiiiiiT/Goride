/**
 * Shared React Query cache for fleet claims (driver toll claim linking).
 * Prefer useDriverClaims(driverId) when scoped to one driver — server supports ?driverId=.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export const FLEET_CLAIMS_QUERY_KEY = ['claims'] as const;

export function driverClaimsQueryKey(driverId?: string) {
  return driverId ? (['claims', 'driver', driverId] as const) : FLEET_CLAIMS_QUERY_KEY;
}

export function useFleetClaims(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;

  const query = useQuery({
    queryKey: FLEET_CLAIMS_QUERY_KEY,
    queryFn: () => api.getClaims(),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  return {
    claims: Array.isArray(query.data) ? query.data : [],
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError,
    refetch: query.refetch,
  };
}

/** Driver-scoped claims — uses GET /claims?driverId= (server filters by driver_id). */
export function useDriverClaims(driverId: string | undefined, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && Boolean(driverId);

  const query = useQuery({
    queryKey: driverClaimsQueryKey(driverId),
    queryFn: () => api.getClaims(driverId),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled,
  });

  return {
    claims: Array.isArray(query.data) ? query.data : [],
    loading: enabled && (query.isLoading || query.isFetching),
    error: query.isError,
    refetch: query.refetch,
  };
}
