import { MaterialIcon } from '../signup/components/MaterialIcon';
import { PARTNER_BOTTOM_NAV_ITEMS } from '../lib/partner-nav';
import { PartnerTab } from '../lib/partner-utils';

interface PartnerBottomNavProps {
  active: PartnerTab;
  onNavigate: (tab: PartnerTab) => void;
  allowedTabs?: PartnerTab[];
}

export default function PartnerBottomNav({ active, onNavigate, allowedTabs }: PartnerBottomNavProps) {
  const items = allowedTabs
    ? PARTNER_BOTTOM_NAV_ITEMS.filter((item) => allowedTabs.includes(item.key))
    : PARTNER_BOTTOM_NAV_ITEMS;
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-[var(--app-bottom-nav-total)] w-full items-center justify-around border-t border-outline-variant bg-surface safe-x safe-b shadow-lg lg:hidden">
      {items.map((item) => {
        const isActive = active === item.key;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate(item.key)}
            className={`btn-touch flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl px-3 py-1 text-label-md font-semibold transition-all duration-200 active:scale-90 ${
              isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <MaterialIcon name={item.icon} filled={isActive} size={22} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
