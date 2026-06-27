import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { RestaurantMgmtModule } from '../restaurant-mgmt/RestaurantMgmtHub';

interface OperationsHubAdminLinksProps {
  onOpenRestaurantMgmt: () => void;
}

export default function OperationsHubAdminLinks({
  onOpenRestaurantMgmt,
}: OperationsHubAdminLinksProps) {
  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div>
        <h2 className="text-title-md font-semibold text-on-background">Admin modules</h2>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Back-office tools for owners. Day-to-day sales run on POS tablets.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenRestaurantMgmt}
        className="flex w-full items-center gap-inset-md rounded-lg border border-outline-variant bg-surface p-inset-md text-left transition-colors hover:border-primary-container/40 active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/15 text-primary-container">
          <MaterialIcon name="restaurant" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body-sm font-semibold text-on-background">Restaurant Management</p>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-label-sm font-semibold text-amber-900">
              Admin only
            </span>
          </div>
          <p className="mt-0.5 text-label-sm text-on-surface-variant">
            POS, inventory, reports, and store settings
          </p>
        </div>
        <MaterialIcon name="chevron_right" className="shrink-0 text-on-surface-variant" />
      </button>
    </section>
  );
}

// Re-export for deep links from other callers
export type { RestaurantMgmtModule };
