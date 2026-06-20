import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToArrive } from '@/components/delivery/SlideToArrive';
import { NavigationPickerSheet } from '@/components/ui/NavigationPickerSheet';
import { toast } from '@/lib/toast';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';
import { NAV_MAP } from '@/lib/mockActiveDelivery';

type ActiveDeliveryNavPageProps = {
  delivery: ActiveDelivery;
  onArrived: () => void;
};

export function ActiveDeliveryNavPage({ delivery, onArrived }: ActiveDeliveryNavPageProps) {
  const [navPickerOpen, setNavPickerOpen] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden bg-surface-container">
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img src={NAV_MAP} alt="" className="object-cover w-full h-full opacity-80" />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 400 800"
          aria-hidden
        >
          <defs>
            <filter id="route-shadow" height="140%" width="140%" x="-20%" y="-20%">
              <feDropShadow dx="0" dy="4" floodColor="#22C55E" floodOpacity="0.3" stdDeviation="6" />
            </filter>
          </defs>
          <path
            d="M 120,650 C 180,550 150,450 220,380 S 280,250 320,180"
            fill="none"
            filter="url(#route-shadow)"
            stroke="#22C55E"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="8"
          />
          <g transform="translate(120, 650)">
            <circle className="opacity-20 animate-pulse" cx="0" cy="0" fill="#10b981" r="16" />
            <circle className="shadow-md" cx="0" cy="0" fill="#006c49" r="8" stroke="#ffffff" strokeWidth="3" />
          </g>
          <g transform="translate(320, 180)">
            <path
              d="M0,0 C-8,-10 -14,-18 -14,-26 A14,14 0 1,1 14,-26 C14,-18 8,-10 0,0 Z"
              fill="#1e1b19"
            />
            <circle cx="0" cy="-26" fill="#ffffff" r="5" />
          </g>
        </svg>
      </div>

      <div className="absolute top-0 inset-x-0 pt-safe px-[var(--spacing-edge)] z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-surface/95 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-4 flex flex-col pointer-events-auto border border-surface-variant/50 backdrop-blur-sm mt-2">
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                <p className="text-[11px] text-primary uppercase tracking-widest font-bold">
                  Pick up from
                </p>
              </div>
              <h1 className="text-xl font-semibold text-on-surface truncate">{delivery.restaurant}</h1>
              <p className="text-sm text-muted mt-0.5 truncate">{delivery.pickupAddress}</p>
            </div>
            <div className="flex flex-col items-end shrink-0 border-l border-surface-variant pl-4">
              <div className="bg-primary-container/20 rounded-lg px-3 py-1.5 flex flex-col items-center min-w-[56px]">
                <span className="text-xl font-bold text-primary leading-tight">{delivery.etaMinutes}</span>
                <span className="text-[11px] text-primary uppercase font-medium">min</span>
              </div>
              <p className="text-[11px] text-muted mt-1.5 font-semibold">{delivery.distanceKm} km</p>
            </div>
          </div>
        </div>

        <div className="bg-surface/95 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-4 flex items-center gap-4 pointer-events-auto border-l-4 border-l-success backdrop-blur-sm">
          <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center text-success shrink-0">
            <MaterialIcon name="turn_right" className="text-[28px]" filled />
          </div>
          <p className="text-lg leading-6 text-on-surface font-semibold tracking-tight flex-1">
            {delivery.turnInstruction}
          </p>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col justify-end pointer-events-none">
        <div className="bg-surface rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] pointer-events-auto border-t border-surface-variant/30 flex flex-col">
          <div className="w-full flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
          </div>
          <div className="px-[var(--spacing-edge)] pb-6 pt-2 flex flex-col gap-6">
            <div className="flex justify-between items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-on-surface">Order #{delivery.orderId}</h2>
                  <MaterialIcon name="expand_less" className="text-muted text-xl" />
                </div>
                <p className="text-sm text-muted mt-0.5 flex items-center gap-1">
                  <MaterialIcon name="shopping_bag" className="text-base" />
                  {delivery.itemCount} items
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavPickerOpen(true)}
                className="flex items-center gap-1 px-4 py-2 rounded-full border border-outline-variant text-on-surface text-xs font-semibold uppercase tracking-wide hover:bg-surface-container active:scale-95 shrink-0"
              >
                <MaterialIcon name="map" className="text-lg text-primary" />
                Open in Maps
              </button>
            </div>
            <SlideToArrive onComplete={onArrived} />
          </div>
        </div>
      </div>

      <NavigationPickerSheet
        open={navPickerOpen}
        destination={delivery.restaurant}
        onSelect={(app) => toast.info(`Opening ${app}`, delivery.pickupAddress)}
        onClose={() => setNavPickerOpen(false)}
      />
    </div>
  );
}
