import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { EnterpriseInventoryView } from '../../types/enterprise-inventory';

const NAV: { key: EnterpriseInventoryView; label: string; icon: string }[] = [
  { key: 'hub', label: 'Overview', icon: 'dashboard' },
  { key: 'items', label: 'Items', icon: 'inventory_2' },
  { key: 'purchase-orders', label: 'Orders', icon: 'local_shipping' },
  { key: 'count', label: 'Counts', icon: 'fact_check' },
  { key: 'variance', label: 'Variance', icon: 'analytics' },
];

interface InventoryHubChromeProps {
  activeView: EnterpriseInventoryView;
  onViewChange: (view: EnterpriseInventoryView) => void;
  onBack: () => void;
  parentLabel?: string;
  title?: string;
  children: React.ReactNode;
}

export default function InventoryHubChrome({
  activeView,
  onViewChange,
  onBack,
  parentLabel = 'Enterprise Inventory',
  title = 'Enterprise Inventory',
  children,
}: InventoryHubChromeProps) {
  const navKey = NAV.some((n) => n.key === activeView) ? activeView : 'hub';

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
        <div className="flex h-14 items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-label-sm text-on-surface-variant">Restaurant Management · {parentLabel}</p>
            <h1 className="truncate text-headline-md font-bold text-on-surface">{title}</h1>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-label-sm font-semibold text-amber-900">
            Admin
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-margin-mobile pb-inset-xs md:px-margin-tablet">
          {NAV.map((item) => {
            const active = navKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onViewChange(item.key)}
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
