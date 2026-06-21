import { MaterialIcon } from '../signup/components/MaterialIcon';
import { PartnerTab } from '../lib/partner-utils';

interface PartnerBottomNavProps {
  active: PartnerTab;
  onNavigate: (tab: PartnerTab) => void;
}

const NAV_ITEMS: { key: PartnerTab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'orders', label: 'Orders', icon: 'receipt_long' },
  { key: 'menu', label: 'Menu', icon: 'restaurant_menu' },
  { key: 'analytics', label: 'Analytics', icon: 'leaderboard' },
  { key: 'account', label: 'Account', icon: 'person' },
];

export default function PartnerBottomNav({ active, onNavigate }: PartnerBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-[var(--app-bottom-nav-total)] w-full items-center justify-around border-t border-outline-variant bg-surface safe-x safe-b shadow-lg md:hidden">
      {NAV_ITEMS.map((item) => {
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
