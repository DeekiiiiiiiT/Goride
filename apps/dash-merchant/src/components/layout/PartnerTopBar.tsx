import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';

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
    <header className="relative z-20 flex h-16 w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-margin-tablet py-xs shadow-sm">
      <div className="flex items-center gap-sm">
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
          <h1 className="text-headline-md font-bold text-primary">Roam Dash Partner</h1>
        )}
      </div>

      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs rounded-full border border-outline-variant bg-surface-container-low px-xs py-[4px]">
          <span className="hidden text-label-md font-semibold text-on-surface md:inline">{toggleLabel}</span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={isAcceptingOrders}
              disabled={togglePending}
              onChange={(event) => onToggleAcceptingOrders(event.target.checked)}
            />
            <div className="peer h-6 w-11 rounded-full bg-surface-variant after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-full peer-disabled:opacity-50" />
          </label>
          <span className="ml-1 mr-2 text-label-md font-semibold text-primary-container">
            {isAcceptingOrders ? 'Open' : 'Paused'}
          </span>
        </div>

        <div className="flex items-center gap-sm text-on-surface-variant">
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
            className="ml-xs flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant active:scale-95"
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
