import { Merchant } from '../hooks/useMerchant';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { getStoreStatus, StoreStatus } from '../lib/partner-utils';

interface PartnerHeaderProps {
  merchant: Merchant;
  notificationCount?: number;
  onNotificationsClick: () => void;
  onSettingsClick: () => void;
  onStatusClick?: () => void;
}

const STATUS_STYLES: Record<
  StoreStatus,
  { label: string; className: string; dotClass: string }
> = {
  open: {
    label: 'OPEN',
    className: 'bg-primary-container text-on-primary-container',
    dotClass: 'bg-on-primary-container animate-pulse',
  },
  paused: {
    label: 'PAUSED',
    className: 'bg-warning/20 text-[#d97706] border border-warning',
    dotClass: 'bg-warning',
  },
  closed: {
    label: 'CLOSED',
    className: 'bg-error-container text-on-error-container',
    dotClass: 'bg-on-error-container',
  },
};

export default function PartnerHeader({
  merchant,
  notificationCount = 0,
  onNotificationsClick,
  onSettingsClick,
  onStatusClick,
}: PartnerHeaderProps) {
  const status = getStoreStatus(merchant.is_active, merchant.is_accepting_orders);
  const statusStyle = STATUS_STYLES[status];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-outline-variant bg-surface font-headline-md text-primary shadow-sm">
      <div className="mx-auto flex h-16 w-full max-w-screen-xl items-center justify-between px-margin-mobile md:px-margin-tablet">
        <div className="flex min-w-0 items-center gap-inset-xs">
          {merchant.logo_url ? (
            <img
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              src={merchant.logo_url}
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container">
              <MaterialIcon name="store" filled className="text-on-primary-container" size={18} />
            </div>
          )}
          <span className="truncate text-headline-md font-semibold text-primary">
            {merchant.name}
          </span>
        </div>

        <div className="flex items-center gap-inset-sm">
          <button
            type="button"
            onClick={onStatusClick}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-label-md font-semibold transition-colors duration-150 hover:opacity-90 active:scale-95 ${statusStyle.className}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusStyle.dotClass}`} />
            {statusStyle.label}
          </button>

          <button
            type="button"
            onClick={onNotificationsClick}
            className="relative rounded-full p-2 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low active:scale-95"
            aria-label="Notifications"
          >
            <MaterialIcon name="notifications" filled />
            {notificationCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-error text-label-sm font-medium text-on-error">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onSettingsClick}
            className="rounded-full p-2 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low active:scale-95"
            aria-label="Settings"
          >
            <MaterialIcon name="settings" />
          </button>
        </div>
      </div>
    </header>
  );
}
