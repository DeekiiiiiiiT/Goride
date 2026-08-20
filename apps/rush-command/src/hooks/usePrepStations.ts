import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createPrepStation,
  deletePrepStation,
  fetchPrepStations,
  updatePrepStation,
} from '../lib/partner-api';
import { readFlag } from '../lib/partner-feature-flags';
import { canAccessRestaurantMgmt } from '../lib/merchant-capabilities';
import type { Merchant } from '../hooks/useMerchant';
import { FIXTURE_PREP_STATIONS, type PrepStation } from '../lib/venue-ops-presets';

export const prepStationKeys = {
  all: ['prep-stations'] as const,
  merchant: (merchantId: string) => ['prep-stations', merchantId] as const,
};

export function usePrepStations(merchantId: string, merchant?: Merchant | null) {
  const useApi =
    canAccessRestaurantMgmt(merchantId, merchant) || readFlag(merchantId, 'prepStationsV1');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: prepStationKeys.merchant(merchantId),
    queryFn: fetchPrepStations,
    enabled: useApi && Boolean(merchantId),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createPrepStation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: prepStationKeys.merchant(merchantId) });
      toast.success('Prep station added');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; sortOrder?: number; kind?: PrepStation['kind'] };
    }) => updatePrepStation(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: prepStationKeys.merchant(merchantId) });
      toast.success('Prep station updated');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePrepStation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: prepStationKeys.merchant(merchantId) });
      toast.success('Prep station removed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const prepStations: PrepStation[] = useApi
    ? (query.data ?? FIXTURE_PREP_STATIONS)
    : FIXTURE_PREP_STATIONS;

  return {
    prepStations,
    useApi,
    isLoading: useApi && query.isLoading,
    updatePrepStation: (id: string, patch: { name?: string; sortOrder?: number; kind?: PrepStation['kind'] }) => {
      if (!useApi) {
        toast.info('In-store operations is not enabled for this store');
        return;
      }
      updateMutation.mutate({ id, patch });
    },
    createPrepStation: (name: string, kind?: PrepStation['kind']) => {
      if (!useApi) {
        toast.info('In-store operations is not enabled for this store');
        return;
      }
      createMutation.mutate({ name, kind });
    },
    deletePrepStation: (id: string) => {
      if (!useApi) {
        toast.info('In-store operations is not enabled for this store');
        return;
      }
      deleteMutation.mutate(id);
    },
    isSaving:
      createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
