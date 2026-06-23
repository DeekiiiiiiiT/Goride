import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { getStoreStatus } from '../../lib/partner-utils';

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
    <header className="safe-t fixed top-0 z-50 flex h-12 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile">
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

      <button
        type="button"
        disabled={togglePending}
        onClick={() => onToggleAcceptingOrders(!isAcceptingOrders)}
        className={`flex h-8 items-center gap-1 rounded-full px-2 text-label-sm font-semibold transition-colors ${
          storeStatus === 'open'
            ? 'bg-primary-container/15 text-primary-container'
            : 'bg-surface-container text-on-surface-variant'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            storeStatus === 'open' ? 'bg-primary-container' : 'bg-outline'
          }`}
        />
        {storeStatus === 'open' ? 'Open' : 'Paused'}
      </button>
    </header>
  );
}
