import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { getStoreStatus } from '../../lib/partner-utils';
import StoreStatusToggle from '../layout/StoreStatusToggle';

interface AnalyticsMerchantHeaderProps {
  merchant: Merchant;
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: (next: boolean) => void;
  togglePending?: boolean;
  onOpenNav?: () => void;
}

export default function AnalyticsMerchantHeader({
  merchant,
  isAcceptingOrders,
  onToggleAcceptingOrders,
  togglePending = false,
  onOpenNav,
}: AnalyticsMerchantHeaderProps) {
  const storeStatus = getStoreStatus(merchant.is_active, isAcceptingOrders);

  return (
    <header className="safe-t safe-x fixed top-0 z-50 flex h-12 w-full items-center justify-between border-b border-outline-variant bg-surface">
      <div className="flex min-w-0 items-center gap-inset-xs">
        <button
          type="button"
          onClick={onOpenNav}
          className={`btn-touch -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high active:scale-95 lg:hidden ${onOpenNav ? '' : 'invisible'}`}
          aria-label="Open navigation"
          disabled={!onOpenNav}
        >
          <MaterialIcon name="menu" size={24} />
        </button>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-high">
          {merchant.logo_url ? (
            <img src={merchant.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <MaterialIcon name="restaurant" className="text-[20px] text-on-surface-variant" />
          )}
        </div>
        <span className="truncate text-headline-md font-bold text-primary">Roam Dash Merchant</span>
      </div>

      <StoreStatusToggle
        storeStatus={storeStatus}
        isAcceptingOrders={isAcceptingOrders}
        onToggle={onToggleAcceptingOrders}
        pending={togglePending}
      />
    </header>
  );
}
