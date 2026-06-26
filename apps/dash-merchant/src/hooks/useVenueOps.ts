import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  applyVenueOpsTemplate,
  fetchVenueOps,
  patchVenueOps,
} from '../lib/partner-api';
import { readFlag } from '../lib/partner-feature-flags';
import { FIXTURE_VENUE_OPS, type VenueOpsData } from '../lib/venue-ops-presets';
import type { JobStation, VenueStyle } from '../types/team';

export const venueOpsKeys = {
  all: ['venue-ops'] as const,
  merchant: (merchantId: string) => ['venue-ops', merchantId] as const,
};

export function useVenueOps(merchantId: string) {
  const useApi = readFlag(merchantId, 'venueOpsV2');
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

  const templateMutation = useMutation({
    mutationFn: applyVenueOpsTemplate,
    onSuccess: (data) => {
      queryClient.setQueryData(venueOpsKeys.merchant(merchantId), data);
      toast.success('Venue template applied');
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
      toast.info('Enable venue operations preview to save changes');
      return;
    }
    patchMutation.mutate(patch);
  };

  const applyTemplate = (venueStyle: Exclude<VenueStyle, 'custom'>) => {
    if (!useApi) {
      toast.info('Enable venue operations preview to apply templates');
      return;
    }
    templateMutation.mutate(venueStyle);
  };

  return {
    venueOps,
    useApi,
    isLoading: useApi && query.isLoading,
    isError: useApi && query.isError,
    refetch: query.refetch,
    updateVenueOps,
    applyTemplate,
    isSaving: patchMutation.isPending || templateMutation.isPending,
  };
}
