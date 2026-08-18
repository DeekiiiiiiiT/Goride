import { useQuery } from '@tanstack/react-query';
import {
  buildFuelWeekReportsWithGating,
  type BuildFuelWeekReportsInput,
} from '../utils/buildFuelWeekReportsForFinalize';

export const FUEL_WEEK_REPORTS_KEY = 'fuelWeekReports';

export function useFuelWeekReports(
  input: BuildFuelWeekReportsInput | null,
  enabled = true,
) {
  const query = useQuery({
    queryKey: [
      FUEL_WEEK_REPORTS_KEY,
      input?.weekStartYmd,
      input?.weekEndYmd,
      input?.vehicles?.length,
      input?.fuelEntries?.length,
      input?.adjustments?.length,
      input?.trips?.length ?? 0,
      input?.drivers?.length,
      input?.scenarios?.length,
    ],
    queryFn: () => {
      if (!input) throw new Error('Missing fuel week input');
      return buildFuelWeekReportsWithGating(input);
    },
    enabled: enabled && !!input?.weekStartYmd && !!input?.weekEndYmd,
    staleTime: 30_000,
  });

  return {
    reports: query.data?.reports ?? [],
    trips: query.data?.trips ?? input?.trips ?? [],
    gateResult: query.data?.gateResult,
    loading: query.isLoading || query.isFetching,
    error: query.error,
    refresh: query.refetch,
  };
}
