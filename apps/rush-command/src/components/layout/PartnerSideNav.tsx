import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import { PARTNER_SIDE_NAV, PartnerSideNavKey } from '../../lib/partner-nav';
import { PartnerTab } from '../../lib/partner-utils';

interface PartnerSideNavProps {
  merchant: Merchant;
  activeKey: PartnerSideNavKey;
  onNavigate: (tab: PartnerTab) => void;
  onHistory?: () => void;
  onSupport?: () => void;
  onGoOffline?: () => void;
  showRestaurantInfo?: boolean;
  compact?: boolean;
}

export default function PartnerSideNav({
  merchant,
  activeKey,
  onNavigate,
  onHistory,
  onSupport,
  onGoOffline,
  showRestaurantInfo = false,
  compact = false,
}: PartnerSideNavProps) {
  const terminalId = `#${merchant.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;

  const handleNav = (key: PartnerSideNavKey, tab?: PartnerTab) => {
    if (key === 'history') {
      onHistory?.();
      return;
    }
    if (key === 'support') {
      onSupport?.();
      return;
    }
    if (tab) onNavigate(tab);
  };

  return (
    <nav
      className={`flex h-full shrink-0 flex-col border-r border-outline-variant bg-surface-container-low py-inset-md px-inset-sm ${
        compact ? 'w-20' : 'w-[4.5rem] xl:w-64'
      }`}
    >
      {showRestaurantInfo && !compact && (
        <div className="mb-inset-lg hidden items-center gap-inset-xs px-2 xl:flex">
          {merchant.logo_url ? (
            <img
              src={merchant.logo_url}
              alt=""
              className="h-10 w-10 rounded-lg border border-outline-variant object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface-variant text-primary">
              <MaterialIcon name="storefront" size={20} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-headline-md font-bold text-primary">{merchant.name}</h2>
            <p className="text-body-sm text-on-surface-variant">Terminal ID: {terminalId}</p>
          </div>
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-inset-xs">
        {PARTNER_SIDE_NAV.map((item) => {
          const isActive = activeKey === item.key;

          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => handleNav(item.key, item.tab)}
                className={`flex w-full items-center gap-inset-sm rounded-lg px-inset-sm py-inset-sm text-label-md font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant'
                } ${compact ? 'justify-center' : ''}`}
              >
                <MaterialIcon name={item.icon} filled={isActive} size={22} />
                {!compact && <span className="hidden xl:inline">{item.label}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {onGoOffline && !compact && (
        <button
          type="button"
          onClick={onGoOffline}
          className="mt-auto flex w-full items-center justify-center gap-inset-sm rounded-lg border border-outline-variant px-inset-md py-inset-sm text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant xl:justify-center"
          aria-label="Go offline"
        >
          <MaterialIcon name="power_settings_new" size={20} />
          <span className="hidden xl:inline">Go Offline</span>
        </button>
      )}
    </nav>
  );
}
