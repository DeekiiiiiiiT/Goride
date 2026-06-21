import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type DashTab = 'home' | 'search' | 'orders' | 'account';

type DashBottomNavProps = {
  activeTab: DashTab;
  onTabChange: (tab: DashTab) => void;
  ordersBadge?: boolean;
};

const TABS: { id: DashTab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'orders', label: 'Orders', icon: 'shopping_bag' },
  { id: 'account', label: 'Account', icon: 'person' },
];

export function DashBottomNav({ activeTab, onTabChange, ordersBadge }: DashBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center py-2 safe-x safe-b bg-surface shadow-[0px_-4px_20px_rgba(0,0,0,0.04)] rounded-t-xl border-t border-surface-container-high max-w-[75rem] mx-auto w-full">
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative btn-touch flex flex-col items-center justify-center min-w-[4rem] px-2 rounded-lg transition-colors duration-150 active:scale-90 ${
              active ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            <MaterialIcon
              name={tab.icon}
              className="text-2xl mb-0.5"
              filled={active}
            />
            <span className="text-xs font-medium">{tab.label}</span>
            {tab.id === 'orders' && ordersBadge && (
              <span className="absolute top-1 right-3 w-2 h-2 bg-tertiary rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
