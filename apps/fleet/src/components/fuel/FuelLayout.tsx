import React from 'react';
import { cn } from '../ui/utils';

interface FuelLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  /** Hide subtitle under md — used to declutter Transaction Logs on phones. */
  hideDescriptionOnMobile?: boolean;
  /** When true, omit page H1 — Week Reconciliation hub owns chrome. */
  embedded?: boolean;
  /** Optional header actions (e.g. Log Receipt / Add fill-up on Transaction Logs). */
  headerActions?: React.ReactNode;
}

export function FuelLayout({
  children,
  title = 'Fuel Management',
  description = 'Track consumption, reconcile expenses, and manage gas cards.',
  hideDescriptionOnMobile = false,
  embedded = false,
  headerActions,
}: FuelLayoutProps) {
  return (
    <div className={cn(embedded ? 'space-y-4' : 'space-y-6')}>
      {!embedded ? (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            <p
              className={cn(
                'text-sm text-slate-500 mt-1',
                hideDescriptionOnMobile && 'hidden md:block',
              )}
            >
              {description}
            </p>
          </div>
          {headerActions ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0">{headerActions}</div>
          ) : null}
        </div>
      ) : null}

      <div className={embedded ? undefined : 'mt-6'}>{children}</div>
    </div>
  );
}
