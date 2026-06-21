import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedOffer } from '@/lib/mockOffers';

const STACKED_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDdh9Wpv5Ywb9gQ0teiomd4-aC6aDe9qvgPW4XE1r26S7luM1q-zh3Qz_dueb4yozJbzJJQpjJhgpjYMftyw_dFjwuEdtKIJS2PP4LiXnQ5mBpnyRVXHfyh-H0so1kfVncJ91dlbL5yjqOzrOPLb27-4pf2Fhp-YQqZuiDndwEWcFNCelL2OKdyzC4BYuzmX9D0TDJ-L0YKrmS3n7TG9qjNvzJvF8kBitB3Mxg3BGo4QzVxG6urU4tThnRASnGJTzrAByF6FC6OZJ0';

type StackedOfferPageProps = {
  offer: StackedOffer;
  initialSeconds?: number;
  onTimerExpire: () => void;
  onDecline: () => void;
  onAccept: () => void;
};

export function StackedOfferPage({
  offer,
  initialSeconds = 45,
  onTimerExpire,
  onDecline,
  onAccept,
}: StackedOfferPageProps) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onTimerExpire();
      return;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, onTimerExpire]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden bg-background">
      <header className="bg-surface shadow-sm fixed top-0 w-full z-50 flex justify-between items-center px-[var(--spacing-edge)] h-14 pt-safe">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center courier-pulse-circle">
            <MaterialIcon name="local_shipping" className="text-primary" filled />
          </div>
          <span className="text-xl font-bold text-primary">New Offer</span>
        </div>
        <div className="bg-warning/10 text-warning px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 border border-warning/20">
          <MaterialIcon name="layers" className="text-sm" />
          {offer.stops.length} DELIVERIES
        </div>
      </header>

      <main className="flex-1 mt-14 relative bg-surface-container-low">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${STACKED_MAP}')` }}
          aria-hidden
        />

        <div className="absolute inset-0 p-[var(--spacing-edge)] flex flex-col justify-between pointer-events-none">
          <div className="self-center mt-2 bg-surface shadow-lg rounded-full px-6 py-3 border border-outline-variant/30 flex items-center gap-2 pointer-events-auto">
            <span className="text-[11px] text-muted uppercase tracking-wider font-medium">Total Est.</span>
            <span className="text-[28px] leading-9 font-bold text-on-surface">J${offer.totalEarnings}</span>
          </div>

          <div className="self-end mb-[400px] bg-surface/90 backdrop-blur-md shadow-md rounded-xl p-3 border border-outline-variant/20 flex flex-col items-end pointer-events-auto">
            <div className="flex items-center gap-1 text-on-surface text-xs font-semibold uppercase tracking-wide">
              <MaterialIcon name="route" className="text-base text-muted" />
              {offer.totalDistanceKm} km
            </div>
            <div className="flex items-center gap-1 text-on-surface text-xs font-semibold uppercase tracking-wide mt-1">
              <MaterialIcon name="timer" className="text-base text-muted" />~{offer.estMinutes} min
            </div>
            <div className="text-[10px] text-muted mt-1">{seconds}s left</div>
          </div>
        </div>
      </main>

      <div className="bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.08)] rounded-t-xl absolute bottom-0 w-full z-40 flex flex-col max-h-[530px]">
        <div className="w-full flex justify-center py-2">
          <div className="w-12 h-1 bg-outline-variant rounded-full" />
        </div>

        <div className="px-[var(--spacing-edge)] pb-[var(--spacing-edge)] overflow-y-auto flex-1">
          <div className="flex flex-col gap-2 mt-2">
            {offer.stops.map((stop, index) => (
              <React.Fragment key={stop.id}>
                {index > 0 && (
                  <div className="flex justify-center -my-2 z-10">
                    <div className="bg-surface border border-outline-variant rounded-full w-6 h-6 flex items-center justify-center">
                      <MaterialIcon name="arrow_downward" className="text-base text-muted" />
                    </div>
                  </div>
                )}
                <div className="bg-surface border border-outline-variant/50 rounded-lg p-4 flex items-center shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface text-xl font-semibold mr-4">
                    {stop.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-on-surface truncate">{stop.restaurant}</h3>
                    <p className="text-[11px] text-muted flex items-center gap-1 mt-1">
                      <MaterialIcon
                        name={index === 0 ? 'location_on' : 'map'}
                        className="text-sm"
                      />
                      {stop.distanceLabel}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="text-xl font-semibold text-on-surface">J${stop.earnings}</span>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="mt-4 bg-surface-container-low rounded-lg p-3 border border-outline-variant/30 flex items-center gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar">
            <MaterialIcon name="my_location" className="text-muted text-lg" />
            <span className="text-[11px] text-muted font-medium">You</span>
            <MaterialIcon name="chevron_right" className="text-outline-variant text-base" />
            <span className="text-[11px] text-on-surface font-semibold">Rest A</span>
            <MaterialIcon name="chevron_right" className="text-outline-variant text-base" />
            <span className="text-[11px] text-on-surface font-semibold">Rest B</span>
            <MaterialIcon name="chevron_right" className="text-outline-variant text-base" />
            <span className="text-[11px] text-muted">Cust A</span>
            <MaterialIcon name="chevron_right" className="text-outline-variant text-base" />
            <span className="text-[11px] text-muted">Cust B</span>
          </div>

          <div className="flex gap-4 mt-6 pb-safe">
            <button
              type="button"
              onClick={onDecline}
              className="flex-1 min-h-14 bg-surface text-muted border border-outline-variant rounded-xl text-xl font-semibold active:scale-95 transition-transform shadow-sm"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex-[2] min-h-14 bg-primary text-on-primary rounded-xl text-xl font-semibold active:scale-95 transition-transform shadow-[0_6px_12px_rgba(16,185,129,0.2)]"
            >
              Accept Both
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
