/**
 * Shared mileage-adjustments cache for driver Fuel draft (Expenses + Payout).
 */
import { useQuery } from '@tanstack/react-query';
import { fuelService } from '../services/fuelService';
import type { MileageAdjustment } from '../types/fuel';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export const MILEAGE_ADJUSTMENTS_QUERY_KEY = ['mileageAdjustments'] as const;

export function useMileageAdjustments(enabled = true) {
  const query = useQuery({
    queryKey: MILEAGE_ADJUSTMENTS_QUERY_KEY,
    queryFn: (): Promise<MileageAdjustment[]> =>
      fuelService.getMileageAdjustments().catch(() => [] as MileageAdjustment[]),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  return {
    adjustments: (query.data || []) as MileageAdjustment[],
    loading: query.isLoading || query.isFetching,
    error: query.isError,
  };
}
