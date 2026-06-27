import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import {
  CAPABILITY_IN_STORE,
  hasCapability,
} from '../../lib/merchant-capabilities';

interface RestaurantMgmtOptInCardProps {
  merchant: Merchant;
  onOpenRestaurantMgmt: () => void;
}

export default function RestaurantMgmtOptInCard({
  merchant,
  onOpenRestaurantMgmt,
}: RestaurantMgmtOptInCardProps) {
  const enabled = hasCapability(merchant, CAPABILITY_IN_STORE);

  if (!enabled) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex gap-inset-md p-inset-md">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/15 text-primary-container">
          <MaterialIcon name="point_of_sale" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-title-md font-semibold text-on-surface">Restaurant Management</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            POS, inventory, reports, and store settings for in-store operations.
          </p>
          <button
            type="button"
            onClick={onOpenRestaurantMgmt}
            className="mt-inset-sm flex min-h-[44px] items-center gap-1 rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary transition-transform active:scale-[0.98]"
          >
            Open Restaurant Management
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      </div>
    </section>
  );
}
