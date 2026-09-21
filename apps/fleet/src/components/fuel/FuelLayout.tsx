import React from 'react';
import { cn } from '../ui/utils';
import { FuelServiceLineTabs } from './FuelServiceLineTabs';

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
  /** Optional per-tab counts for the service-line strip. */
  serviceLineCounts?: Partial<Record<'all' | 'rideshare' | 'delivery', number>>;
}

/**
 * Fuel page chrome. Expects FuelServiceLineProvider above (FuelManagement wraps it)
 * so tabs and table filters share one ?line= lens.
 */
export function FuelLayout({
  children,
  title = 'Fuel Management',
  description = 'Track consumption, reconcile expenses, and manage gas cards.',
  hideDescriptionOnMobile = false,
  embedded = false,
  headerActions,
  serviceLineCounts,
}: FuelLayoutProps) {
  return (
    <div className={cn(embedded ? 'space-y-4' : 'space-y-6')}>
      {/* Desktop only — mobile AppLayout top bar already shows the page title */}
      {!embedded ? (
        <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

      {/* Service-line lens — Dashboard slate pills; dual-line orgs only */}
      <FuelServiceLineTabs
        counts={serviceLineCounts}
        className={cn(embedded ? 'mb-2' : 'md:mt-2')}
      />

      <div className={embedded ? undefined : 'md:mt-4'}>{children}</div>
    </div>
  );
}
