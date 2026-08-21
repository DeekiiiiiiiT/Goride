import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import {
  getAllowedSideNavItems,
  PARTNER_SIDE_NAV,
  PartnerSideNavKey,
} from '../../lib/partner-nav';
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
  allowedTabs?: PartnerTab[];
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
  allowedTabs,
}: PartnerSideNavProps) {
  const terminalId = `#${merchant.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const items = allowedTabs ? getAllowedSideNavItems(allowedTabs) : PARTNER_SIDE_NAV;

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
      className={`flex h-full shrink-0 flex-col border-r border-outline-variant bg-surface-container-low py-inset-md ${
        // Icon rail is narrow — keep side padding light so hover squares can center
        compact ? 'w-20 px-inset-xs' : 'w-[4.5rem] px-inset-xs xl:w-64 xl:px-inset-sm'
      }`}
      aria-label="Partner desktop navigation"
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

      <ul className="flex flex-1 flex-col items-center gap-inset-xs xl:items-stretch">
        {items.map((item) => {
          const isActive = activeKey === item.key;

          return (
            <li key={item.key} className={compact ? 'w-full' : 'xl:w-full'}>
              <button
                type="button"
                onClick={() => handleNav(item.key, item.tab)}
                className={`flex items-center justify-center rounded-lg text-label-md font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:bg-surface-variant'
                } ${
                  compact
                    ? 'h-11 w-full'
                    : 'h-11 w-11 xl:h-auto xl:w-full xl:justify-start xl:gap-inset-sm xl:px-inset-sm xl:py-inset-sm'
                }`}
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
          className="mt-auto mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant xl:mx-0 xl:h-auto xl:w-full xl:gap-inset-sm xl:px-inset-md xl:py-inset-sm"
          aria-label="Go offline"
        >
          <MaterialIcon name="power_settings_new" size={20} />
          <span className="hidden xl:inline">Go Offline</span>
        </button>
      )}
    </nav>
  );
}
