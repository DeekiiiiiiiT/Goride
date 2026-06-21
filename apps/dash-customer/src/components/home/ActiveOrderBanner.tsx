import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type ActiveOrderBannerProps = {
  onTrack: () => void;
};

export function ActiveOrderBanner({ onTrack }: ActiveOrderBannerProps) {
  return (
    <button
      type="button"
      onClick={onTrack}
      className="w-full bg-surface-container-lowest rounded-[24px] shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4 flex flex-col gap-4 relative overflow-hidden group active:scale-[0.98] transition-transform duration-200 text-left"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary-container/10 to-transparent pointer-events-none" />
      <div className="flex justify-between items-start relative z-10 w-full">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold tracking-wide text-primary uppercase">
            Your order is on the way!
          </span>
          <h2 className="text-xl font-semibold text-on-surface">
            Arriving in <span className="text-primary font-bold">15 min</span>
          </h2>
        </div>
        <div className="w-12 h-12 bg-primary-container/20 rounded-full flex items-center justify-center text-primary">
          <MaterialIcon name="local_shipping" filled />
        </div>
      </div>

      <div className="w-full flex items-center justify-between relative z-10 mt-1">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-surface-variant -translate-y-1/2 z-0" />
        <div className="absolute top-1/2 left-0 w-1/2 h-0.5 bg-primary -translate-y-1/2 z-0" />

        <div className="flex flex-col items-center gap-1 z-10 relative bg-surface-container-lowest px-1">
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <MaterialIcon name="check" className="text-[10px] text-on-primary font-bold" />
          </div>
          <span className="text-[10px] text-on-surface-variant">Preparing</span>
        </div>
        <div className="flex flex-col items-center gap-1 z-10 relative bg-surface-container-lowest px-1">
          <div className="w-4 h-4 rounded-full bg-primary dash-progress-dot-active border-2 border-surface-container-lowest" />
          <span className="text-[10px] text-primary font-bold">On the way</span>
        </div>
        <div className="flex flex-col items-center gap-1 z-10 relative bg-surface-container-lowest px-1">
          <div className="w-4 h-4 rounded-full bg-surface-variant border-2 border-surface-container-lowest" />
          <span className="text-[10px] text-outline">Arriving</span>
        </div>
      </div>

      <div className="mt-1 pt-3 border-t border-surface-variant w-full flex justify-between items-center text-on-surface-variant relative z-10">
        <span className="text-sm">Sushi Masa - Order #8492</span>
        <MaterialIcon name="chevron_right" className="text-sm" />
      </div>
    </button>
  );
}
