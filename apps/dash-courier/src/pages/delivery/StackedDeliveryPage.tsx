import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryStepper } from '@/components/ui/DeliveryStepper';
import { SlideToArrive } from '@/components/delivery/SlideToArrive';
import type { StackedDelivery } from '@/lib/mockStackedDelivery';
import { STACKED_MAP } from '@/lib/mockStackedDelivery';

type StackedDeliveryPageProps = {
  delivery: StackedDelivery;
  onBack: () => void;
  onArrived: () => void;
};

export function StackedDeliveryPage({ delivery, onBack, onArrived }: StackedDeliveryPageProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden bg-background">
      <div className="absolute inset-0 z-0 bg-surface-container">
        <img src={STACKED_MAP} alt="" className="w-full h-full object-cover opacity-80 mix-blend-multiply" />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800" aria-hidden>
          <path
            d="M 150 600 C 180 500, 250 400, 200 250 L 220 200"
            fill="none"
            stroke="#10b981"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="6"
            className="drop-shadow-md"
          />
          <g transform="translate(150, 600)">
            <circle cx="0" cy="0" fill="#10b981" r="12" stroke="#ffffff" strokeWidth="3" />
            <path d="M -4 0 L -1 3 L 5 -3" fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="2" />
          </g>
          <g transform="translate(220, 200)">
            <circle className="animate-pulse shadow-lg" cx="0" cy="0" fill="#006c49" r="16" stroke="#ffffff" strokeWidth="4" />
            <circle cx="0" cy="0" fill="#ffffff" r="6" />
          </g>
        </svg>
      </div>

      <div className="relative z-10 pt-safe">
        <div className="bg-surface shadow-soft rounded-b-xl mx-[var(--spacing-edge)] mt-[var(--spacing-edge)] p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center w-full">
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface"
            >
              <MaterialIcon name="arrow_back" />
            </button>
            <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-full">
              <MaterialIcon name="error" className="text-warning text-base" />
              <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Stacked Order
              </span>
            </div>
            <button
              type="button"
              aria-label="Help"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-primary"
            >
              <MaterialIcon name="help" />
            </button>
          </div>

          <div className="mt-1">
            <p className="text-[11px] text-muted uppercase">
              Next Stop • {delivery.nextStopDistance}
            </p>
            <h1 className="text-xl font-semibold text-on-surface mt-1">
              Pick up from {delivery.restaurant}
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">{delivery.address}</p>
          </div>

          <div className="mt-2 pt-2 border-t border-surface-variant">
            <DeliveryStepper steps={delivery.steps} />
          </div>
        </div>
      </div>

      <div className="flex-grow pointer-events-none" />

      <div className="relative z-20 pb-safe w-full px-[var(--spacing-edge)] mb-[var(--spacing-edge)]">
        <div className="bg-white/95 backdrop-blur-md rounded-t-xl rounded-b-sm shadow-primary p-4 border-b-2 border-primary-container flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Current Load</h3>
          <ul className="flex flex-col gap-1 mt-1">
            {delivery.load.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <li className="h-px bg-surface-variant w-full my-1" />}
                <li
                  className={`flex items-center justify-between py-1 ${item.dimmed ? 'opacity-70' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-semibold text-on-surface-variant">
                      {item.id}
                    </div>
                    <p className={`text-sm ${item.dimmed ? 'font-medium text-on-surface-variant' : 'font-semibold text-on-surface'}`}>
                      {item.customer}
                      {item.closest && (
                        <span className="font-normal text-muted ml-1">(Closest)</span>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] bg-surface-container-high text-on-surface-variant px-2 py-1 rounded-full">
                    {item.restaurant}
                  </span>
                </li>
              </React.Fragment>
            ))}
          </ul>
        </div>
        <div className="mt-1">
          <SlideToArrive variant="stacked" onComplete={onArrived} />
        </div>
      </div>
    </div>
  );
}
