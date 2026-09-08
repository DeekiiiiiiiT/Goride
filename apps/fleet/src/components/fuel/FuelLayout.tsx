import React from 'react';
import { cn } from '../ui/utils';

interface FuelLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onAddTransaction?: () => void;
  title?: string;
  description?: string;
  /** When true, omit page H1 — Week Reconciliation hub owns chrome. */
  embedded?: boolean;
}

export function FuelLayout({
  children,
  onAddTransaction,
  title = 'Fuel Management',
  description = 'Track consumption, reconcile expenses, and manage gas cards.',
  embedded = false,
}: FuelLayoutProps) {
  return (
    <div className={cn(embedded ? 'space-y-4' : 'space-y-6')}>
      {!embedded ? (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
        </div>
      ) : null}

      <div className={embedded ? undefined : 'mt-6'}>{children}</div>
    </div>
  );
}
