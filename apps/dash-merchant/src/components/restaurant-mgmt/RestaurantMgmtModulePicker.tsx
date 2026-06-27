import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { RestaurantMgmtModule } from './RestaurantMgmtHub';

const MODULES: {
  key: RestaurantMgmtModule;
  label: string;
  description: string;
  icon: string;
  adminOnly?: boolean;
}[] = [
  {
    key: 'pos',
    label: 'POS Register',
    description: 'In-store checkout and payments',
    icon: 'point_of_sale',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock, receiving, counts, transfers, and recipes',
    icon: 'inventory_2',
    adminOnly: true,
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'In-store sales today and this week',
    icon: 'bar_chart',
    adminOnly: true,
  },
  {
    key: 'settings',
    label: 'Store settings',
    description: 'Printer, receipts, and display options',
    icon: 'settings',
    adminOnly: true,
  },
];

interface RestaurantMgmtModulePickerProps {
  merchantId: string;
  hidePos?: boolean;
  onSelect: (module: RestaurantMgmtModule) => void;
  onBack: () => void;
}

export default function RestaurantMgmtModulePicker({
  merchantId: _merchantId,
  hidePos,
  onSelect,
  onBack,
}: RestaurantMgmtModulePickerProps) {
  const modules = MODULES.filter((m) => !(hidePos && m.key === 'pos'));

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
          <div>
            <h1 className="text-headline-md font-bold text-on-surface">Restaurant Management</h1>
            <p className="text-label-sm text-on-surface-variant">Choose a module</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-[var(--app-bottom-nav-total)]">
        <div className="mx-auto max-w-lg space-y-inset-md p-margin-mobile md:max-w-2xl md:p-margin-tablet">
          <div className="grid gap-inset-sm sm:grid-cols-2">
            {modules.map((module) => (
              <button
                key={module.key}
                type="button"
                onClick={() => onSelect(module.key)}
                className="flex flex-col items-start gap-inset-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:border-primary-container/40 hover:bg-surface-container-low active:scale-[0.99]"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
                    <MaterialIcon name={module.icon} className="text-[22px]" />
                  </div>
                  {module.adminOnly && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-label-sm font-semibold text-amber-900">
                      Admin
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-title-md font-semibold text-on-surface">{module.label}</p>
                  <p className="mt-0.5 text-body-sm text-on-surface-variant">{module.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
