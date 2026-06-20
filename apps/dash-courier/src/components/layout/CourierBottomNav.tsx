import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type CourierTab = 'home' | 'activity' | 'earnings' | 'account';

type CourierBottomNavProps = {
  active: CourierTab;
  onChange: (tab: CourierTab) => void;
  disabled?: boolean;
};

const TABS: { id: CourierTab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'activity', label: 'Activity', icon: 'history' },
  { id: 'earnings', label: 'Earnings', icon: 'payments' },
  { id: 'account', label: 'Account', icon: 'person' },
];

export function CourierBottomNav({ active, onChange, disabled = false }: CourierBottomNavProps) {
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center h-16 safe-x safe-b px-2 bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.04)] rounded-t-xl transition-opacity ${
        disabled ? 'opacity-50 grayscale pointer-events-none' : ''
      }`}
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`btn-touch flex flex-col items-center justify-center rounded-full px-3 py-1 min-w-[68px] min-h-[44px] transition-all active:scale-90 duration-200 ${
              isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'text-muted hover:text-primary'
            }`}
          >
            <MaterialIcon name={tab.icon} className="text-xl" filled={isActive} />
            <span className="text-[11px] font-medium mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
