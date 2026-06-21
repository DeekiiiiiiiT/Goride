import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { AnalyticsNavTab } from '../../types/analytics';
import { PartnerTab } from '../../lib/partner-utils';

interface AnalyticsSubNavProps {
  activeTab: AnalyticsNavTab;
  onSelectTab: (tab: AnalyticsNavTab) => void;
  onNavigate: (page: PartnerTab) => void;
}

export default function AnalyticsSubNav({
  activeTab,
  onSelectTab,
  onNavigate,
}: AnalyticsSubNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-outline-variant bg-surface px-xs pb-safe md:hidden">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center p-xs text-on-surface-variant transition-colors hover:text-primary"
      >
        <MaterialIcon name="dashboard" className="mb-1" />
        <span className="text-label-sm">Overview</span>
      </button>
      <button
        type="button"
        onClick={() => onNavigate('menu')}
        className="flex min-h-[48px] min-w-[48px] flex-col items-center justify-center p-xs text-on-surface-variant transition-colors hover:text-primary"
      >
        <MaterialIcon name="restaurant_menu" className="mb-1" />
        <span className="text-label-sm">Menu</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectTab('reviews')}
        className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center rounded-xl p-xs transition-transform duration-150 ${
          activeTab === 'reviews'
            ? 'scale-95 bg-primary-container text-on-primary-container'
            : 'text-on-surface-variant hover:text-primary'
        }`}
      >
        <MaterialIcon name="star" filled={activeTab === 'reviews'} className="mb-1" />
        <span className="text-label-sm">Reviews</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectTab('health')}
        className={`flex min-h-[48px] min-w-[64px] flex-col items-center justify-center rounded-xl p-xs transition-transform duration-150 ${
          activeTab === 'health'
            ? 'scale-95 bg-primary-container text-on-primary-container'
            : 'text-on-surface-variant hover:text-primary'
        }`}
      >
        <MaterialIcon name="analytics" filled={activeTab === 'health'} className="mb-1" />
        <span className="text-label-sm">Health</span>
      </button>
    </nav>
  );
}
