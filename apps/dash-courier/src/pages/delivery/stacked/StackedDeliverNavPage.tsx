import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { StackedProgressStepper } from '@/components/delivery/StackedProgressStepper';
import { SlideToArrive } from '@/components/delivery/SlideToArrive';
import type { StackedRouteStop, StackedStopId } from '@/lib/mockStackedRoute';
import { STACKED_DELIVER_MAP } from '@/lib/mockStackedRoute';

type StackedDeliverNavPageProps = {
  stop: StackedRouteStop;
  completedStopIds: StackedStopId[];
  deliveryIndex: 1 | 2;
  onBack: () => void;
  onHelp?: () => void;
  onMessage: () => void;
  onNavigate: () => void;
  onComplete: () => void;
};

export function StackedDeliverNavPage({
  stop,
  completedStopIds,
  deliveryIndex,
  onBack,
  onHelp,
  onMessage,
  onNavigate,
  onComplete,
}: StackedDeliverNavPageProps) {
  const customerFirst = stop.customerName ?? 'Customer';

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface shadow-soft flex justify-between items-center px-[var(--spacing-edge)] h-14 pt-safe shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Close"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant"
        >
          <MaterialIcon name="close" />
        </button>
        <h1 className="text-xl font-bold text-primary">Stacked Order</h1>
        <button
          type="button"
          onClick={onHelp}
          aria-label="Help"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant"
        >
          <MaterialIcon name="help" />
        </button>
      </header>

      <main className="flex-1 relative min-h-0 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={STACKED_DELIVER_MAP}
            alt=""
            className="w-full h-full object-cover opacity-60 mix-blend-multiply"
          />
        </div>

        <div className="absolute top-4 left-[var(--spacing-edge)] right-[var(--spacing-edge)] z-10 space-y-4">
          <div className="bg-surface/90 backdrop-blur-md rounded-xl shadow-soft p-4 border border-surface-variant">
            <StackedProgressStepper
              activeStopId={stop.id}
              completedStopIds={completedStopIds}
            />
          </div>

          <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
            <div className="flex items-stretch">
              <div className="w-1 bg-primary shrink-0" />
              <div className="p-4 flex-grow flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-primary font-bold uppercase tracking-wider mb-1">
                    Current Stop
                  </p>
                  <h2 className="text-xl font-semibold text-on-surface">
                    {deliveryIndex === 1
                      ? `Deliver to ${customerFirst} first`
                      : `Deliver to ${customerFirst}`}
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {deliveryIndex === 1 ? 'Closest destination' : 'Final delivery'}
                  </p>
                </div>
                {stop.etaMinutes != null && (
                  <div className="bg-primary-container text-on-primary-container px-2 py-1.5 rounded-lg flex items-center shrink-0">
                    <MaterialIcon name="directions_bike" className="text-base" />
                    <span className="text-xs font-semibold ml-1">{stop.etaMinutes} min</span>
                  </div>
                )}
              </div>
            </div>
            {stop.nextPreview && deliveryIndex === 1 && (
              <div className="bg-surface-container-low px-4 py-2 border-t border-surface-variant flex items-center">
                <MaterialIcon name="schedule" className="text-muted text-lg mr-2" />
                <span className="text-sm text-muted">{stop.nextPreview}</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="bg-surface rounded-t-[24px] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] z-30 shrink-0 max-h-[55vh] flex flex-col">
        <div className="w-full flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>

        <div className="px-[var(--spacing-edge)] pb-safe overflow-y-auto flex-1">
          <div className="flex justify-between items-start mb-6 gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-on-surface">{stop.name}</h2>
              <p className="text-base text-on-surface-variant mt-1 flex items-center">
                <MaterialIcon name="location_on" className="text-lg mr-1 shrink-0" />
                <span className="truncate">{stop.address}</span>
              </p>
            </div>
            <button
              type="button"
              className="bg-surface-container w-12 h-12 rounded-full flex items-center justify-center text-primary shrink-0"
            >
              <MaterialIcon name="call" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              type="button"
              onClick={onMessage}
              className="bg-surface-container-high text-on-surface text-xs font-semibold uppercase tracking-wide h-12 rounded-lg flex items-center justify-center active:scale-95"
            >
              <MaterialIcon name="chat" className="mr-2" />
              Message
            </button>
            <button
              type="button"
              onClick={onNavigate}
              className="bg-secondary-container text-on-secondary-container text-xs font-semibold uppercase tracking-wide h-12 rounded-lg flex items-center justify-center active:scale-95"
            >
              <MaterialIcon name="navigation" className="mr-2" />
              Navigate
            </button>
          </div>

          <div className="bg-surface-container-lowest border border-surface-variant rounded-xl p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-surface-container-high rounded-lg flex items-center justify-center text-on-surface-variant">
                <MaterialIcon name="shopping_bag" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface">
                  {stop.itemCount ?? 0} Items
                </p>
                <p className="text-sm text-on-surface-variant">{stop.instructions}</p>
              </div>
            </div>
            <MaterialIcon name="chevron_right" className="text-on-surface-variant" />
          </div>

          <SlideToArrive
            variant="complete"
            label={`Swipe to Complete D${deliveryIndex}`}
            onComplete={onComplete}
          />
        </div>
      </div>
    </div>
  );
}
