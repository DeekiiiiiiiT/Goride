import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { StackedProgressStepper } from '@/components/delivery/StackedProgressStepper';
import type { StackedRouteStop, StackedStopId } from '@/lib/mockStackedRoute';
import { STACKED_ROUTE_MAP } from '@/lib/mockStackedRoute';

type StackedPickupNavPageProps = {
  stop: StackedRouteStop;
  completedStopIds: StackedStopId[];
  onBack: () => void;
  onHelp?: () => void;
  onNavigate: () => void;
  onArrived: () => void;
};

export function StackedPickupNavPage({
  stop,
  completedStopIds,
  onBack,
  onHelp,
  onNavigate,
  onArrived,
}: StackedPickupNavPageProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface shadow-soft flex items-center justify-between px-[var(--spacing-edge)] h-14 pt-safe shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Menu"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-primary"
        >
          <MaterialIcon name="menu" />
        </button>
        <h1 className="text-lg font-bold text-primary">Active Delivery (2 orders)</h1>
        <button
          type="button"
          aria-label="Account"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-primary"
        >
          <MaterialIcon name="account_circle" filled />
        </button>
      </header>

      <main className="flex-1 relative min-h-0">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-90"
          style={{ backgroundImage: `url('${STACKED_ROUTE_MAP}')` }}
          aria-hidden
        />

        <div className="absolute top-0 left-0 w-full z-10 px-[var(--spacing-edge)] pt-4 flex flex-col gap-4 pointer-events-none">
          <div className="bg-surface rounded-xl shadow-soft p-4 pointer-events-auto">
            <StackedProgressStepper
              activeStopId={stop.id}
              completedStopIds={completedStopIds}
              compact
            />
          </div>

          <div className="bg-primary text-on-primary rounded-xl shadow-soft p-4 pointer-events-auto border-l-4 border-primary-fixed">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-fixed-dim">
              Next Stop
            </span>
            <h2 className="text-xl font-bold mt-1">Pick up from {stop.name}</h2>
            {stop.expectedBy && (
              <div className="flex items-center gap-2 text-primary-container mt-2">
                <MaterialIcon name="schedule" className="text-sm" />
                <span className="text-sm">Expected by {stop.expectedBy}</span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onHelp}
          className="absolute bottom-52 right-[var(--spacing-edge)] w-12 h-12 bg-surface text-primary rounded-full shadow-[0_6px_12px_rgba(0,108,73,0.1)] flex items-center justify-center z-20 border border-surface-variant active:scale-90 transition-transform"
        >
          <MaterialIcon name="help" />
        </button>
      </main>

      <div className="bg-surface rounded-t-[24px] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] z-30 shrink-0 pb-safe">
        <div className="w-full flex justify-center pt-2 pb-1">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>
        <div className="px-[var(--spacing-edge)] pb-6 pt-2 flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-on-surface">{stop.name}</h3>
              <p className="text-sm text-muted mt-0.5 truncate">
                {stop.address} • Order #{stop.orderId}
              </p>
            </div>
            <button
              type="button"
              className="bg-surface-container-low p-2.5 rounded-full text-primary shrink-0"
            >
              <MaterialIcon name="phone" />
            </button>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onNavigate}
              className="flex-1 min-h-14 bg-surface text-on-surface border border-outline-variant rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <MaterialIcon name="navigation" />
              Navigate
            </button>
            <button
              type="button"
              onClick={onArrived}
              className="flex-[2] min-h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wide shadow-[0_6px_12px_rgba(0,108,73,0.1)] active:scale-95 transition-all"
            >
              I&apos;ve Arrived
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
