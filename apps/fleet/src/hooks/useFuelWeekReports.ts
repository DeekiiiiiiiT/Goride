import { useQuery } from '@tanstack/react-query';
import {
  buildFuelWeekReportsWithGating,
  type BuildFuelWeekReportsInput,
} from '../utils/buildFuelWeekReportsForFinalize';
import {
  fuelAdjustmentsContentSig,
  fuelDisputesContentSig,
  fuelEntriesContentSig,
  fuelScenariosContentSig,
  hashFuelContentSig,
} from '../utils/fuelContentSig';

export const FUEL_WEEK_REPORTS_KEY = 'fuelWeekReports';

export function useFuelWeekReports(
  input: BuildFuelWeekReportsInput | null,
  enabled = true,
) {
  const contentKey = input
    ? hashFuelContentSig([
        input.weekStartYmd,
        input.weekEndYmd,
        fuelEntriesContentSig(input.fuelEntries || []),
        fuelAdjustmentsContentSig(input.adjustments || []),
        fuelScenariosContentSig(input.scenarios || []),
        fuelDisputesContentSig(input.disputes || []),
        (input.vehicles || []).map((v) => `${v.id}:${v.fuelScenarioId || ''}`).join(','),
        (input.drivers || [])
          .map((d: any) => `${d.id || d.driverId}:${d.fuelScenarioId || ''}`)
          .join(','),
        (input.finalizedReports || [])
          .map((f) => `${f.driverId}:${f.weekStart}:${f.miscellaneousCost}`)
          .join(','),
      ])
    : 'none';

  const query = useQuery({
    queryKey: [FUEL_WEEK_REPORTS_KEY, input?.weekStartYmd, input?.weekEndYmd, contentKey],
    queryFn: () => {
      if (!input) throw new Error('Missing fuel week input');
      return buildFuelWeekReportsWithGating(input);
    },
    enabled: enabled && !!input?.weekStartYmd && !!input?.weekEndYmd,
    staleTime: 30_000,
    networkMode: 'always',
    gcTime: 60_000,
  });

  return {
    reports: query.data?.reports ?? [],
    trips: query.data?.trips ?? input?.trips ?? [],
    gateResult: query.data?.gateResult,
    loading: query.isLoading && !query.data,
    updating: query.isFetching && !!query.data,
    error: query.error,
    refresh: query.refetch,
  };
}
