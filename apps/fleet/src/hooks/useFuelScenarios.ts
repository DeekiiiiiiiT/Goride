/**
 * Shared fuel-scenarios cache — one GET /scenarios for Driver Detail header,
 * Expenses draft, and Payout draft (Fixes ROAM-FLEET-10 HTTP/1.1 overhead).
 */
import { useQuery } from '@tanstack/react-query';
import { fuelService } from '../services/fuelService';
import type { FuelScenario } from '../types/fuel';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export const FUEL_SCENARIOS_QUERY_KEY = ['fuelScenarios'] as const;

export function useFuelScenarios(enabled = true) {
  const query = useQuery({
    queryKey: FUEL_SCENARIOS_QUERY_KEY,
    queryFn: (): Promise<FuelScenario[]> =>
      fuelService.getFuelScenarios().catch(() => [] as FuelScenario[]),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  return {
    scenarios: (query.data || []) as FuelScenario[],
    loading: query.isLoading || query.isFetching,
    error: query.isError,
  };
}
