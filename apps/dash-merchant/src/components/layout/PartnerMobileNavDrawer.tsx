import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PARTNER_SIDE_NAV } from '../../lib/partner-nav';
import { PartnerTab } from '../../lib/partner-utils';

const PRIMARY_NAV: { key: PartnerTab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'orders', label: 'Orders', icon: 'receipt_long' },
  { key: 'menu', label: 'Menu', icon: 'restaurant_menu' },
  { key: 'analytics', label: 'Analytics', icon: 'leaderboard' },
  { key: 'account', label: 'Account', icon: 'person' },
  { key: 'earnings', label: 'Earnings', icon: 'payments' },
];

interface PartnerMobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  merchant: Merchant;
  active: PartnerTab;
  allowedTabs: PartnerTab[];
  onNavigate: (tab: PartnerTab) => void;
}

export default function PartnerMobileNavDrawer({
  open,
  onClose,
  merchant,
  active,
  allowedTabs,
  onNavigate,
}: PartnerMobileNavDrawerProps) {
  if (!open) return null;

  const terminalId = `#${merchant.id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;

  const handleNav = (tab: PartnerTab) => {
    onNavigate(tab);
    onClose();
  };

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
          <p className="mb-inset-xs px-inset-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            Main
          </p>
          <ul className="space-y-1">
            {PRIMARY_NAV.filter((item) => allowedTabs.includes(item.key)).map((item) => {
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => handleNav(item.key)}
                    className={`btn-touch flex w-full items-center gap-inset-sm rounded-lg px-inset-sm py-inset-sm text-left text-label-md font-semibold transition-colors ${
                      isActive
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <MaterialIcon name={item.icon} filled={isActive} size={22} />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mb-inset-xs mt-inset-md px-inset-sm text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            More
          </p>
          <ul className="space-y-1">
            {PARTNER_SIDE_NAV.filter((item) => item.key === 'history' || item.key === 'support').map(
              (item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => handleNav(item.tab ?? (item.key === 'history' ? 'orders' : 'account'))}
                    className="btn-touch flex w-full items-center gap-inset-sm rounded-lg px-inset-sm py-inset-sm text-left text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high"
                  >
                    <MaterialIcon name={item.icon} size={22} />
                    {item.label}
                  </button>
                </li>
              ),
            )}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
