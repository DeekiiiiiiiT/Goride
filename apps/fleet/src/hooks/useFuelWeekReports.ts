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
    // Don't leave the wizard stuck on "Loading…" if one dependency call hangs.
    networkMode: 'always',
    // Soft-timeouts inside the builder; this is a hard backstop for the UI.
    gcTime: 60_000,
  });

  return {
    reports: query.data?.reports ?? [],
    trips: query.data?.trips ?? input?.trips ?? [],
    gateResult: query.data?.gateResult,
    // Initial open only — background refetch must not blank the step UI.
    loading: query.isLoading && !query.data,
    updating: query.isFetching && !!query.data,
    error: query.error,
    refresh: query.refetch,
  };
}
