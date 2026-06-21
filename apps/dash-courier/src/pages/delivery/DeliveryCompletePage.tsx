import React, { useEffect } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { fireConfetti } from '@/lib/confetti';

type DeliveryCompletePageProps = {
  delivery: ActiveDelivery;
  onBackToDash: () => void;
};

export function DeliveryCompletePage({ delivery, onBackToDash }: DeliveryCompletePageProps) {
  const { earnings, tripDistanceKm, tripMinutes } = delivery;

  useEffect(() => {
    fireConfetti();
  }, []);

  return (
    <div className="fixed inset-0 z-[90] bg-background flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-col items-center justify-center px-[var(--spacing-edge)] pt-8 pb-32 overflow-y-auto">
        <div className="mb-6 courier-scale-in flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-success/10 flex items-center justify-center mb-4 relative overflow-hidden">
            <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" style={{ animationDuration: '2s' }} />
            <svg className="text-success z-10" fill="none" height="48" viewBox="0 0 48 48" width="48" aria-hidden>
              <path
                className="courier-check-path"
                d="M40 14L18 36L8 26"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            </svg>
          </div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface text-center">
            Delivery Complete!
          </h1>
          <div className="flex items-center gap-2 mt-2 text-muted text-sm">
            <span className="flex items-center gap-1">
              <MaterialIcon name="route" className="text-lg" />
              {tripDistanceKm} km
            </span>
            <span className="w-1 h-1 rounded-full bg-outline-variant" />
            <span className="flex items-center gap-1">
              <MaterialIcon name="schedule" className="text-lg" />
              {tripMinutes} min
            </span>
          </div>
        </div>

        <div className="w-full bg-surface rounded-xl p-4 shadow-soft mb-6 courier-slide-up-1">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-variant">
            <h2 className="text-xl font-semibold text-on-surface">Earnings Summary</h2>
            <MaterialIcon name="payments" className="text-success" filled />
          </div>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Base pay</span>
              <span>J${earnings.basePay}</span>
            </div>
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Distance bonus</span>
              <span>J${earnings.distanceBonus}</span>
            </div>
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span className="flex items-center gap-1">
                Tip <MaterialIcon name="thumb_up" className="text-sm text-primary" />
              </span>
              <span>J${earnings.tip}</span>
            </div>
            <div className="flex justify-between text-sm text-on-surface-variant opacity-50">
              <span>Peak pay</span>
              <span>J${earnings.peakPay}</span>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-surface-variant text-2xl font-semibold text-primary">
            <span>Total</span>
            <span className="font-bold">J${earnings.total}</span>
          </div>
        </div>

        <div className="w-full bg-surface-container-low rounded-lg p-2 flex items-start gap-2 courier-slide-up-2 mb-8">
          <MaterialIcon name="info" className="text-muted text-xl mt-0.5 shrink-0" />
          <p className="text-sm text-muted italic">
            Tip may be updated by customer within 1 hour.
          </p>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface p-[var(--spacing-edge)] shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-50 pb-safe courier-slide-up-3">
        <button
          type="button"
          onClick={onBackToDash}
          className="w-full max-w-md mx-auto h-14 bg-primary text-on-primary rounded-lg text-xl font-semibold flex items-center justify-center gap-2 shadow-primary active:scale-95"
        >
          Back to Dash
          <MaterialIcon name="arrow_forward" />
        </button>
      </div>
    </div>
  );
}
