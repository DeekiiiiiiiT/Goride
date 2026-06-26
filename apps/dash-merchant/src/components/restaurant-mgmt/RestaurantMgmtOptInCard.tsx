import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import {
  CAPABILITY_IN_STORE,
  hasCapability,
} from '../../lib/merchant-capabilities';
import { readFlag } from '../../lib/partner-feature-flags';
import { enableCapability } from '../../lib/restaurant-mgmt-api';

interface RestaurantMgmtOptInCardProps {
  merchant: Merchant;
  onOpenRestaurantMgmt: () => void;
}

export default function RestaurantMgmtOptInCard({
  merchant,
  onOpenRestaurantMgmt,
}: RestaurantMgmtOptInCardProps) {
  const queryClient = useQueryClient();
  const [enabling, setEnabling] = useState(false);
  const enabled = hasCapability(merchant, CAPABILITY_IN_STORE);
  const previewOnly =
    readFlag(merchant.id, 'restaurantMgmtPreviewV1') && !enabled;

  const handleEnable = async () => {
    if (enabled || previewOnly) {
      onOpenRestaurantMgmt();
      return;
    }
    setEnabling(true);
    try {
      await enableCapability();
      await queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
      toast.success('In-store operations enabled');
      onOpenRestaurantMgmt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable in-store operations');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex gap-inset-md p-inset-md">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/15 text-primary-container">
          <MaterialIcon name="point_of_sale" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-title-md font-semibold text-on-surface">Restaurant Management</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Run in-store POS, track inventory, print receipts, and view in-store sales alongside Roam
            delivery.
          </p>
          <button
            type="button"
            disabled={enabling}
            onClick={handleEnable}
            className="mt-inset-sm flex min-h-[44px] items-center gap-1 rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {enabled
              ? 'Open Restaurant Management'
              : previewOnly
                ? 'Try Restaurant Management'
                : 'Enable In-Store Operations'}
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      </div>
    </section>
  );
}
