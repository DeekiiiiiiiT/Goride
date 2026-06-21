import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PartnerTab } from '../../lib/partner-utils';

interface EarningsSubNavProps {
  onNavigate: (page: PartnerTab) => void;
}

export default function EarningsSubNav({ onNavigate }: EarningsSubNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-20 w-full items-center justify-around border-t border-outline-variant bg-surface px-2 pb-safe shadow-sm md:hidden">
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
        className="flex min-w-[64px] flex-col items-center justify-center rounded-xl bg-primary-container/20 px-4 py-1 text-primary transition-transform active:scale-90"
      >
        <MaterialIcon name="payments" filled className="mb-1" />
        <span className="text-label-md">Earnings</span>
      </button>
      <button
        type="button"
        onClick={() => onNavigate('orders')}
        className="flex min-w-[64px] flex-col items-center justify-center px-4 py-1 text-on-surface-variant transition-transform active:scale-90 hover:bg-surface-container-low"
      >
        <MaterialIcon name="receipt_long" className="mb-1" />
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
