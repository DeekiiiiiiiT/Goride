import type { RestaurantMgmtSection } from '../restaurant-mgmt/RestaurantMgmtHub';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { readFlag } from '../../lib/partner-feature-flags';

const ADMIN_MODULES: {
  section: RestaurantMgmtSection;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    section: 'inventory',
    label: 'Inventory Management',
    description: 'Ingredients, stock levels, and recipes',
    icon: 'inventory_2',
  },
  {
    section: 'reports',
    label: 'Advanced Reports',
    description: 'In-store sales today and this week',
    icon: 'bar_chart',
  },
  {
    section: 'settings',
    label: 'Store Settings',
    description: 'Printer, receipts, and in-store display options',
    icon: 'settings',
  },
];

interface OperationsHubAdminLinksProps {
  merchantId: string;
  onOpenSection: (section: RestaurantMgmtSection) => void;
  onOpenEnterpriseInventory?: () => void;
}

export default function OperationsHubAdminLinks({
  merchantId,
  onOpenSection,
  onOpenEnterpriseInventory,
}: OperationsHubAdminLinksProps) {
  const showEnterprise = readFlag(merchantId, 'enterpriseInventoryV1') && Boolean(onOpenEnterpriseInventory);
  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div>
        <h2 className="text-title-md font-semibold text-on-background">Admin modules</h2>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Back-office tools for owners. Day-to-day sales run on POS tablets.
        </p>
      </div>
      <div className="space-y-inset-sm">
        {showEnterprise && (
          <button
            type="button"
            onClick={onOpenEnterpriseInventory}
            className="flex w-full items-center gap-inset-md rounded-lg border border-primary-container/30 bg-primary-container/5 p-inset-md text-left transition-colors hover:border-primary-container/40 active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
              <MaterialIcon name="corporate_fare" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-semibold text-on-background">Enterprise Inventory</p>
                <span className="rounded-full bg-primary-container/20 px-2 py-0.5 text-label-sm font-semibold text-on-primary-container">
                  New
                </span>
              </div>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">
                Ledger, receiving, blind counts, multi-location
              </p>
            </div>
            <MaterialIcon name="chevron_right" className="shrink-0 text-on-surface-variant" />
          </button>
        )}
        {ADMIN_MODULES.map((module) => (
          <button
            key={module.section}
            type="button"
            onClick={() => onOpenSection(module.section)}
            className="flex w-full items-center gap-inset-md rounded-lg border border-outline-variant bg-surface p-inset-md text-left transition-colors hover:border-primary-container/40 active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
              <MaterialIcon name={module.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-semibold text-on-background">{module.label}</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-label-sm font-semibold text-amber-900">
                  Admin only
                </span>
              </div>
              <p className="mt-0.5 text-label-sm text-on-surface-variant">{module.description}</p>
            </div>
            <MaterialIcon name="chevron_right" className="shrink-0 text-on-surface-variant" />
          </button>
        ))}
      </div>
    </section>
  );
}
