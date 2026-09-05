/**
 * Shared React Query cache for fleet claims (driver toll claim linking).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export const FLEET_CLAIMS_QUERY_KEY = ['claims'] as const;

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
