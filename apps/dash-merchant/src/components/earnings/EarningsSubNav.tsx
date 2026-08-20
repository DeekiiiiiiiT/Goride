import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PartnerTab } from '../../lib/partner-utils';

interface EarningsSubNavProps {
  onNavigate: (page: PartnerTab) => void;
  activeTab?: 'earnings' | 'history';
  onSelectTab?: (tab: 'earnings' | 'history') => void;
}

export default function EarningsSubNav({
  onNavigate,
  activeTab = 'earnings',
  onSelectTab,
}: EarningsSubNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-[var(--app-bottom-nav-total)] w-full items-center justify-around border-t border-outline-variant bg-surface px-2 safe-x safe-b shadow-sm md:hidden">
      <button
        type="button"
        onClick={() => onNavigate('orders')}
        className="flex min-w-[64px] flex-col items-center justify-center px-4 py-1 text-on-surface-variant transition-transform active:scale-90 hover:bg-surface-container-low"
      >
        <MaterialIcon name="assignment" className="mb-1" />
        <span className="text-label-md">Orders</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectTab?.('earnings')}
        className={`flex min-w-[64px] flex-col items-center justify-center rounded-xl px-4 py-1 transition-transform active:scale-90 ${
          activeTab === 'earnings'
            ? 'bg-primary-container/20 text-primary'
            : 'text-on-surface-variant hover:bg-surface-container-low'
        }`}
      >
        <MaterialIcon name="payments" filled={activeTab === 'earnings'} className="mb-1" />
        <span className="text-label-md">Earnings</span>
      </button>
      <button
        type="button"
        onClick={() => onSelectTab?.('history')}
        className={`flex min-w-[64px] flex-col items-center justify-center rounded-xl px-4 py-1 transition-transform active:scale-90 ${
          activeTab === 'history'
            ? 'bg-primary-container/20 text-primary'
            : 'text-on-surface-variant hover:bg-surface-container-low'
        }`}
      >
        <MaterialIcon name="receipt_long" filled={activeTab === 'history'} className="mb-1" />
        <span className="text-label-md">History</span>
      </button>
      <button
        type="button"
        onClick={() => onNavigate('account')}
        className="flex min-w-[64px] flex-col items-center justify-center px-4 py-1 text-on-surface-variant transition-transform active:scale-90 hover:bg-surface-container-low"
      >
        <MaterialIcon name="settings" className="mb-1" />
        <span className="text-label-md">Settings</span>
      </button>
    </nav>
  );
}
