import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { CachedDelivery } from '@/lib/mockCachedDelivery';

type OfflineModePageProps = {
  delivery: CachedDelivery;
  onRetry: () => void;
  onProfileClick?: () => void;
};

export function OfflineModePage({ delivery, onRetry, onProfileClick }: OfflineModePageProps) {
  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col overflow-hidden select-none">
      <div className="w-full bg-warning text-on-primary text-xs font-semibold uppercase tracking-wide py-2 px-[var(--spacing-edge)] flex items-center justify-center gap-1 shadow-md">
        <MaterialIcon name="wifi_off" className="text-base" filled />
        <span>No internet connection</span>
      </div>

      <header className="w-full bg-surface shadow-sm flex items-center justify-between px-[var(--spacing-edge)] h-14">
        <button
          type="button"
          className="text-primary p-2 rounded-full hover:bg-surface-container-low active:scale-95 transition-colors"
          aria-label="Menu"
        >
          <MaterialIcon name="menu" />
        </button>
        <h1 className="text-xl font-bold text-primary">Roam Dash Courier</h1>
        <button
          type="button"
          onClick={onProfileClick}
          className="text-primary p-2 rounded-full hover:bg-surface-container-low active:scale-95 transition-colors"
          aria-label="Profile"
        >
          <MaterialIcon name="account_circle" filled />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-6 pb-24 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center mt-4">
          <div className="w-24 h-24 rounded-full bg-surface-container-highest flex items-center justify-center mb-4 relative">
            <MaterialIcon name="cloud_off" className="text-[48px] text-muted" />
            <div className="absolute inset-0 border-4 border-warning rounded-full opacity-50 courier-pulse-amber" />
          </div>
          <h2 className="text-2xl font-semibold text-on-surface mb-1">You&apos;re offline</h2>
          <p className="text-sm text-muted max-w-[280px]">
            New offers are paused until you&apos;re back online.
          </p>
        </div>

        <div className="w-full flex justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="bg-primary text-on-primary text-xs font-semibold uppercase tracking-wide h-12 px-8 rounded-full shadow-[0_6px_12px_rgba(0,108,73,0.1)] active:scale-95 transition-transform flex items-center gap-2"
          >
            <MaterialIcon name="refresh" className="text-lg" />
            Retry connection
          </button>
        </div>

        <div className="w-full border-t border-surface-variant" />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Active Delivery (Cached)
            </h3>
            <span className="text-[11px] text-muted">Last updated {delivery.lastUpdated}</span>
          </div>

          <div className="bg-surface rounded-xl p-4 shadow-soft border-l-4 border-warning flex flex-col gap-4 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none courier-cached-pattern"
              aria-hidden
            />

            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <MaterialIcon name="restaurant" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{delivery.restaurant}</p>
                  <p className="text-[11px] text-muted">Order #{delivery.orderId}</p>
                </div>
              </div>
              <div className="bg-warning/10 text-warning px-2 py-1 rounded-full text-[11px] font-medium flex items-center gap-1">
                <MaterialIcon name="history" className="text-sm" />
                Cached
              </div>
            </div>

            <div className="flex items-start gap-4 relative z-10 bg-surface-container-lowest p-2 rounded-lg border border-surface-variant">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mt-1 shrink-0">
                <MaterialIcon name="person" className="text-base" filled />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">
                  Dropoff to {delivery.customerName}
                </p>
                <p className="text-base font-medium text-on-surface leading-tight">
                  {delivery.dropoffAddress}
                </p>
                <p className="text-sm text-muted mt-1">{delivery.dropoffNote}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 w-full bg-surface rounded-t-xl shadow-[0_-4px_12px_rgba(0,108,73,0.1)] h-16 flex justify-around items-center px-4 pb-safe opacity-50 grayscale pointer-events-none">
        <div className="flex flex-col items-center text-on-surface-variant w-16">
          <MaterialIcon name="payments" className="mb-1" />
          <span className="text-[11px] font-medium">Earnings</span>
        </div>
        <div className="flex flex-col items-center bg-primary-container text-on-primary-container rounded-full px-4 py-1">
          <MaterialIcon name="local_shipping" className="mb-1" filled />
          <span className="text-[11px] font-bold">Deliveries</span>
        </div>
        <div className="flex flex-col items-center text-on-surface-variant w-16">
          <MaterialIcon name="sensors_off" className="mb-1" />
          <span className="text-[11px] font-medium">Status</span>
        </div>
        <div className="flex flex-col items-center text-on-surface-variant w-16">
          <MaterialIcon name="person" className="mb-1" />
          <span className="text-[11px] font-medium">Profile</span>
        </div>
      </nav>
    </div>
  );
}
