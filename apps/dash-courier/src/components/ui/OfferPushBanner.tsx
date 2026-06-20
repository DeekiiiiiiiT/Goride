import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type OfferPushBannerProps = {
  restaurant: string;
  earnings: number;
  secondsLeft: number;
  onTap: () => void;
  onDismiss: () => void;
};

export function OfferPushBanner({
  restaurant,
  earnings,
  secondsLeft,
  onTap,
  onDismiss,
}: OfferPushBannerProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="fixed top-0 left-0 right-0 z-[100] mx-3 mt-safe bg-surface rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-surface-variant overflow-hidden text-left active:scale-[0.99] transition-transform animate-in slide-in-from-top"
    >
      <div className="flex items-stretch">
        <div className="w-1 bg-primary shrink-0" />
        <div className="flex-1 p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center shrink-0">
            <MaterialIcon name="local_shipping" className="text-primary" filled />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              New delivery offer
            </p>
            <p className="text-sm font-semibold text-on-surface truncate">{restaurant}</p>
            <p className="text-xs text-muted">
              J${earnings} · {secondsLeft}s to respond
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-2 text-muted hover:text-on-surface shrink-0"
            aria-label="Dismiss"
          >
            <MaterialIcon name="close" className="text-lg" />
          </button>
        </div>
      </div>
    </button>
  );
}
