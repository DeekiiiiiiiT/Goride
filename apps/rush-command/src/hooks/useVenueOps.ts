import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchVenueOps,
  patchVenueOps,
} from '../lib/partner-api';
import type { Merchant } from '../hooks/useMerchant';
import { canAccessRestaurantMgmt } from '../lib/merchant-capabilities';
import { FIXTURE_VENUE_OPS, type VenueOpsData } from '../lib/venue-ops-presets';
import type { JobStation, VenueStyle } from '../types/team';

export const venueOpsKeys = {
  all: ['venue-ops'] as const,
  merchant: (merchantId: string) => ['venue-ops', merchantId] as const,
};

export function useVenueOps(merchantId: string, merchant?: Merchant | null) {
  // Capability is the only write authorization; feature flags must not unlock API writes.
  const useApi = canAccessRestaurantMgmt(merchantId, merchant);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: venueOpsKeys.merchant(merchantId),
    queryFn: fetchVenueOps,
    enabled: useApi && Boolean(merchantId),
    staleTime: 30_000,
  });

  const patchMutation = useMutation({
    mutationFn: patchVenueOps,
    onSuccess: (data) => {
      queryClient.setQueryData(venueOpsKeys.merchant(merchantId), data);
      toast.success('Operations settings saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const venueOps: VenueOpsData = useApi
    ? (query.data ?? FIXTURE_VENUE_OPS)
    : FIXTURE_VENUE_OPS;

  const updateVenueOps = (patch: {
    venueStyle?: VenueStyle | null;
    enabledStations?: JobStation[];
  }) => {
    if (!useApi) {
      toast.info('In-store operations is not enabled for this store');
      return Promise.reject(new Error('In-store operations not enabled'));
    }
    return patchMutation.mutateAsync(patch);
  };

  return {
    venueOps,
    useApi,
    isLoading: useApi && query.isLoading,
    isError: useApi && query.isError,
    refetch: query.refetch,
    updateVenueOps,
    isSaving: patchMutation.isPending,
  };
}
