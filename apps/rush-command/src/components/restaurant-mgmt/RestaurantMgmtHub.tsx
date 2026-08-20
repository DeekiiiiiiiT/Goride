import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export type RestaurantMgmtModule = 'pos' | 'inventory' | 'reports' | 'settings';

/** @deprecated Use RestaurantMgmtModule — kept for Operations Hub deep links */
export type RestaurantMgmtSection = RestaurantMgmtModule;

const SECTION_TITLES: Record<RestaurantMgmtModule, string> = {
  pos: 'POS Register',
  inventory: 'Inventory',
  reports: 'Reports',
  settings: 'Store settings',
};

interface RestaurantMgmtHubProps {
  section: RestaurantMgmtModule;
  sectionTitle?: string;
  onBackToPicker: () => void;
  children: ReactNode;
}

export default function RestaurantMgmtHub({
  section,
  sectionTitle,
  onBackToPicker,
  children,
}: RestaurantMgmtHubProps) {
  const title = sectionTitle ?? SECTION_TITLES[section];

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="safe-t shrink-0 border-b border-outline-variant bg-surface">
        <div className="flex h-14 items-center gap-inset-sm px-margin-mobile md:px-margin-tablet">
          <button
            type="button"
            onClick={onBackToPicker}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
            aria-label="Back to Restaurant Management"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-label-sm text-on-surface-variant">Restaurant Management</p>
            <h1 className="truncate text-headline-md font-bold text-on-surface">{title}</h1>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-[var(--app-bottom-nav-total)]">{children}</main>
    </div>
  );
}
