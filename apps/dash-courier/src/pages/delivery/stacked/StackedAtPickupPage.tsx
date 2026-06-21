import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedRouteStop } from '@/lib/mockStackedRoute';

type StackedAtPickupPageProps = {
  stop: StackedRouteStop;
  onBack: () => void;
  onConfirmPickup: () => void;
};

export function StackedAtPickupPage({ stop, onBack, onConfirmPickup }: StackedAtPickupPageProps) {
  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface shadow-sm flex justify-between items-center px-[var(--spacing-edge)] h-14 pt-safe shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="text-primary p-2 -ml-2 rounded-full hover:bg-surface-container-high"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <span className="bg-primary-container text-on-primary-container text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full">
          At Restaurant
        </span>
        <div className="w-10" aria-hidden />
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-6 pb-32">
        <section className="bg-surface rounded-xl shadow-soft p-4 border-l-4 border-primary">
          <h2 className="text-xl font-semibold text-on-surface">{stop.name}</h2>
          <p className="text-sm text-muted mt-1 flex items-center gap-1">
            <MaterialIcon name="location_on" className="text-base" />
            {stop.address}
          </p>
          <p className="text-sm text-muted mt-2">Order #{stop.orderId}</p>
        </section>

        <p className="text-sm text-muted text-center px-4">
          Confirm you have picked up the order for this stop before continuing.
        </p>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface p-[var(--spacing-edge)] pb-safe border-t border-surface-variant shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={onConfirmPickup}
          className="w-full min-h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wider shadow-[0_6px_12px_rgba(0,108,73,0.1)] active:scale-[0.98]"
        >
          Confirm Pickup
        </button>
      </div>
    </div>
  );
}
