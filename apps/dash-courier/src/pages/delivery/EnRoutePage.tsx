import React, { useEffect } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToArrive } from '@/components/delivery/SlideToArrive';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { EN_ROUTE_MAP } from '@/lib/mockActiveDelivery';

type EnRoutePageProps = {
  delivery: ActiveDelivery;
  onArrived: () => void;
  onConnectionLost?: () => void;
};

export function EnRoutePage({ delivery, onArrived, onConnectionLost }: EnRoutePageProps) {
  useEffect(() => {
    if (!onConnectionLost) return undefined;
    const timer = window.setTimeout(onConnectionLost, 6000);
    return () => window.clearTimeout(timer);
  }, [onConnectionLost]);

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0 bg-surface-variant pointer-events-none">
        <div
          className="w-full h-full bg-cover bg-center opacity-90"
          style={{ backgroundImage: `url('${EN_ROUTE_MAP}')` }}
        />
        <svg className="absolute inset-0 w-full h-full drop-shadow-md pointer-events-none" preserveAspectRatio="none" viewBox="0 0 400 850" aria-hidden>
          <path
            d="M 200 450 C 200 350, 150 250, 180 180"
            fill="none"
            stroke="#10b981"
            strokeLinecap="round"
            strokeWidth="6"
            className="opacity-80"
          />
        </svg>
        <div className="absolute left-[45%] top-[50%] w-6 h-6 bg-primary rounded-full border-4 border-surface shadow-md z-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-primary courier-status-pulse" />
        </div>
        <div className="absolute left-[41%] top-[18%] flex flex-col items-center z-10">
          <div className="w-8 h-8 bg-on-surface rounded-full flex items-center justify-center shadow-lg mb-1 relative">
            <MaterialIcon name="home" className="text-surface text-lg" filled />
            <div className="absolute -bottom-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-on-surface" />
          </div>
        </div>
      </div>

      <div className="relative z-20 flex flex-col w-full flex-1">
        <div className="w-full bg-inverse-surface shadow-md rounded-b-[24px] pt-safe pb-4 px-[var(--spacing-edge)] flex items-center gap-4">
          <div className="w-12 h-12 bg-surface/10 rounded-full flex items-center justify-center shrink-0">
            <MaterialIcon name="turn_right" className="text-inverse-on-surface text-[32px]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[28px] leading-9 font-bold text-inverse-on-surface mb-1">
              {delivery.dropoffTurnDistance}
            </div>
            <div className="text-sm text-surface-variant opacity-80 truncate">
              {delivery.dropoffTurnInstruction}
            </div>
          </div>
        </div>

        <div className="mx-[var(--spacing-edge)] mt-6 bg-surface rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.08)] p-4 border border-outline-variant/20 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary-fixed rounded-full w-fit">
            <MaterialIcon name="visibility" className="text-sm text-secondary" />
            <span className="text-[11px] text-secondary tracking-wide font-medium">
              {delivery.customerFirstName} can see your location
            </span>
          </div>
          <div className="flex justify-between items-start pt-1 gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted uppercase tracking-wider mb-0.5">Deliver to</div>
              <div className="text-xl font-semibold text-on-surface">{delivery.customerFirstName}</div>
              <div className="text-sm text-on-surface-variant mt-1 leading-snug">{delivery.dropoffAddress}</div>
            </div>
            <div className="flex flex-col items-end shrink-0 border-l border-outline-variant/30 pl-4">
              <div className="text-2xl font-semibold text-primary">{delivery.dropoffEtaMinutes} min</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted mt-0.5">
                ({delivery.dropoffDistanceKm} km)
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="w-full bg-surface rounded-t-[32px] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] pt-3 pb-safe border-t border-outline-variant/10">
          <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full mx-auto mb-5" />
          <div className="px-[var(--spacing-edge)] flex flex-col gap-6 pb-4">
            <div className="bg-surface-bright rounded-xl p-4 border border-outline-variant/30 flex gap-4 items-start">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0">
                <MaterialIcon name="speaker_notes" className="text-tertiary text-lg" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                  Delivery Instructions
                </div>
                <div className="text-sm text-on-surface font-medium leading-relaxed">
                  {delivery.deliveryInstructions}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 h-[52px] bg-secondary-fixed text-on-secondary-fixed-variant rounded-xl flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide active:scale-95"
              >
                <MaterialIcon name="call" className="text-xl" filled />
                Call
              </button>
              <button
                type="button"
                className="flex-1 h-[52px] bg-secondary-fixed text-on-secondary-fixed-variant rounded-xl flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide active:scale-95"
              >
                <MaterialIcon name="chat" className="text-xl" filled />
                Message
              </button>
              <button
                type="button"
                aria-label="Open in Maps"
                className="w-[52px] h-[52px] bg-surface-container border border-outline-variant/50 text-on-surface rounded-xl flex items-center justify-center active:scale-95"
              >
                <MaterialIcon name="map" className="text-[22px]" />
              </button>
            </div>

            <SlideToArrive variant="en-route" onComplete={onArrived} />
          </div>
        </div>
      </div>
    </div>
  );
}
