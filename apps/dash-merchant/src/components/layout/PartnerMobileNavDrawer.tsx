import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  getPartnerDrawerPrimaryItems,
  PARTNER_SIDE_NAV,
  PartnerNavItem,
} from '../../lib/partner-nav';
import { PartnerTab } from '../../lib/partner-utils';

const DRAWER_MORE_ITEMS = PARTNER_SIDE_NAV.filter(
  (item) => item.key === 'history' || item.key === 'support',
);

interface PartnerMobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  merchant: Merchant;
  active: PartnerTab;
  allowedTabs: PartnerTab[];
  bottomNavVisible: boolean;
  onNavigate: (tab: PartnerTab) => void;
}

function TabNavButton({
  item,
  isActive,
  onClick,
}: {
  item: PartnerNavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-touch flex w-full items-center gap-inset-sm rounded-lg px-inset-sm py-inset-sm text-left text-label-md font-semibold transition-colors ${
        isActive
          ? 'bg-secondary-container text-on-secondary-container'
          : 'text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      <MaterialIcon name={item.icon} filled={isActive} size={22} />
      {item.label}
    </button>
  );
}

function MoreNavButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-touch flex w-full items-center gap-inset-sm rounded-lg px-inset-sm py-inset-sm text-left text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"
    >
      <MaterialIcon name={icon} size={22} />
      {label}
    </button>
  );
}

export default function PartnerMobileNavDrawer({
  open,
  onClose,
  merchant,
  active,
  allowedTabs,
  bottomNavVisible,
  onNavigate,
}: PartnerMobileNavDrawerProps) {
  if (!open) return null;

  const terminalId = `#${merchant.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const primaryItems = getPartnerDrawerPrimaryItems(bottomNavVisible, allowedTabs);

  const handleNav = (tab: PartnerTab) => {
    onNavigate(tab);
    onClose();
  };

  const handleMoreNav = (key: 'history' | 'support') => {
    handleNav(key === 'history' ? 'orders' : 'account');
  };

  const renderMoreItems = () => (
    <ul className="space-y-1">
      {DRAWER_MORE_ITEMS.map((item) => (
        <li key={item.key}>
          <MoreNavButton
            label={item.label}
            icon={item.icon}
            onClick={() => handleMoreNav(item.key as 'history' | 'support')}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className="safe-t safe-b absolute left-0 top-0 flex h-full w-[min(18rem,85vw)] flex-col border-r border-outline-variant bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-margin-mobile py-inset-sm">
          <div className="min-w-0">
            <p className="truncate text-headline-md font-bold text-primary">{merchant.name || 'Roam Dash'}</p>
            <p className="text-body-sm text-on-surface-variant">Terminal ID: {terminalId}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-touch flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
            aria-label="Close menu"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-margin-mobile py-inset-sm">
          {bottomNavVisible ? (
            <>
              <p className="mb-inset-xs px-inset-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                More
              </p>
              <ul className="space-y-1">
                {primaryItems.map((item) => (
                  <li key={item.key}>
                    <TabNavButton
                      item={item}
                      isActive={active === item.key}
                      onClick={() => handleNav(item.key)}
                    />
                  </li>
                ))}
                {DRAWER_MORE_ITEMS.map((item) => (
                  <li key={item.key}>
                    <MoreNavButton
                      label={item.label}
                      icon={item.icon}
                      onClick={() => handleMoreNav(item.key as 'history' | 'support')}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mb-inset-xs px-inset-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                Main
              </p>
              <ul className="space-y-1">
                {primaryItems.map((item) => (
                  <li key={item.key}>
                    <TabNavButton
                      item={item}
                      isActive={active === item.key}
                      onClick={() => handleNav(item.key)}
                    />
                  </li>
                ))}
              </ul>

              <p className="mb-inset-xs mt-inset-md px-inset-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                More
              </p>
              {renderMoreItems()}
            </>
          )}
        </nav>
      </aside>
    </div>
  );
}
