import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import { getStoreStatus } from '../../lib/partner-utils';
import StoreStatusToggle from './StoreStatusToggle';

type PartnerTopBarVariant = 'merchant' | 'brand';

interface PartnerTopBarProps {
  merchant: Merchant;
  variant?: PartnerTopBarVariant;
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: (next: boolean) => void;
  toggleLabel?: string;
  togglePending?: boolean;
  notificationCount?: number;
  onSettings?: () => void;
}

export default function PartnerTopBar({
  merchant,
  variant = 'merchant',
  isAcceptingOrders,
  onToggleAcceptingOrders,
  toggleLabel = 'Status Toggle',
  togglePending = false,
  notificationCount = 0,
  onSettings,
}: PartnerTopBarProps) {
  return (
    <header className="safe-t relative z-20 flex h-14 w-full shrink-0 items-center justify-between gap-inset-sm border-b border-outline-variant bg-surface px-margin-mobile py-inset-xs shadow-sm lg:h-16 lg:px-margin-tablet">
      <div className="flex min-w-0 items-center gap-inset-sm">
        {variant === 'merchant' ? (
          <>
            {merchant.logo_url ? (
              <img
                src={merchant.logo_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-variant text-primary">
                <MaterialIcon name="storefront" size={18} />
              </div>
            )}
            <h1 className="text-headline-md font-bold tracking-tight text-primary">{merchant.name}</h1>
          </>
        ) : (
          <h1 className="truncate text-headline-md font-bold text-primary">Roam Dash Partner</h1>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-inset-xs lg:gap-inset-md">
        <StoreStatusToggle
          storeStatus={getStoreStatus(merchant.is_active, isAcceptingOrders)}
          isAcceptingOrders={isAcceptingOrders}
          onToggle={onToggleAcceptingOrders}
          pending={togglePending}
          size="md"
          showHeading
          headingLabel={toggleLabel}
        />

        <div className="flex items-center gap-inset-xs text-on-surface-variant lg:gap-inset-sm">
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container-low active:scale-95"
            aria-label="Notifications"
          >
            <MaterialIcon name="notifications" />
            {notificationCount > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-surface bg-error" />
            )}
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container-low active:scale-95"
            aria-label="Settings"
          >
            <MaterialIcon name="settings" />
          </button>
          <button
            type="button"
            className="ml-inset-xs flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant active:scale-95"
            aria-label="Account"
          >
            {merchant.logo_url ? (
              <img src={merchant.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <MaterialIcon name="person" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
