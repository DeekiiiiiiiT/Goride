import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getStoreTabletPairing,
  regeneratePairingCode,
  updateStoreTabletFlags,
} from '../../lib/partner-api';
import { setFlag } from '../../lib/partner-feature-flags';
import StoreTabletSettingsPanel from './StoreTabletSettingsPanel';

interface StoreTabletSettingsSectionProps {
  merchantId: string;
}

export default function StoreTabletSettingsSection({
  merchantId,
}: StoreTabletSettingsSectionProps) {
  const queryClient = useQueryClient();
  const pairingQuery = useQuery({
    queryKey: ['store-tablet-pairing', merchantId],
    queryFn: getStoreTabletPairing,
  });

  const flagsMutation = useMutation({
    mutationFn: updateStoreTabletFlags,
    onSuccess: (data) => {
      setFlag(merchantId, 'staffOperationsV1', data.staffOperationsEnabled);
      setFlag(merchantId, 'staffStationPinV1', data.staffStationPinEnabled);
      queryClient.setQueryData(['store-tablet-pairing', merchantId], data);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: regeneratePairingCode,
    onSuccess: (data) => {
      queryClient.setQueryData(['store-tablet-pairing', merchantId], data);
      toast.success('Pairing code regenerated — re-pair all tablets');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (pairingQuery.isLoading) {
    return (
      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md">
        <p className="text-body-sm text-on-surface-variant">Loading store tablet settings…</p>
      </section>
    );
  }

  if (pairingQuery.isError || !pairingQuery.data) {
    return (
      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md">
        <p className="text-body-sm text-error">Could not load store tablet settings</p>
        <button
          type="button"
          onClick={() => void pairingQuery.refetch()}
          className="mt-inset-sm text-label-sm text-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  const data = pairingQuery.data;

  return (
    <StoreTabletSettingsPanel
      data={{
        storeName: data.storeName,
        pairingCode: data.pairingCode,
        stationLinks: data.stationLinks,
        staffOperationsEnabled: data.staffOperationsEnabled,
        staffStationPinEnabled: data.staffStationPinEnabled,
      }}
      onRegenerate={() => regenerateMutation.mutate()}
      isRegenerating={regenerateMutation.isPending}
      onToggleStaffOps={(enabled) => {
        setFlag(merchantId, 'staffOperationsV1', enabled);
        flagsMutation.mutate({ staffOperationsEnabled: enabled });
      }}
      onToggleStaffPin={(enabled) => {
        setFlag(merchantId, 'staffStationPinV1', enabled);
        flagsMutation.mutate({ staffStationPinEnabled: enabled });
      }}
    />
  );
}
