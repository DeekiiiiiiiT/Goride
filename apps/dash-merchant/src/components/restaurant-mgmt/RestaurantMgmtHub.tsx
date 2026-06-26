import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export type RestaurantMgmtSection = 'pos' | 'inventory' | 'reports' | 'settings';

const NAV: { key: RestaurantMgmtSection; label: string; icon: string }[] = [
  { key: 'pos', label: 'POS', icon: 'point_of_sale' },
  { key: 'inventory', label: 'Inventory', icon: 'inventory_2' },
  { key: 'reports', label: 'Reports', icon: 'bar_chart' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

interface RestaurantMgmtHubProps {
  activeSection: RestaurantMgmtSection;
  onSectionChange: (section: RestaurantMgmtSection) => void;
  onBack: () => void;
  children: ReactNode;
}

export default function RestaurantMgmtHub({
  activeSection,
  onSectionChange,
  onBack,
  children,
}: RestaurantMgmtHubProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
        <div className="flex h-14 items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
            aria-label="Back to account"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-bold text-on-surface">Restaurant Management</h1>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-margin-mobile pb-inset-xs md:px-margin-tablet">
          {NAV.map((item) => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSectionChange(item.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-label-md font-semibold transition-colors ${
                  active
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <MaterialIcon name={item.icon} className="text-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
