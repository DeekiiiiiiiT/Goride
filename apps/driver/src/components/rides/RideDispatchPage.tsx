import React from 'react';
import { useRideDispatch } from '../../hooks/useRideDispatch';
import { RideOfferCard } from './RideOfferCard';
import { ActiveRidePanel } from './ActiveRidePanel';

export function RideDispatchPage() {
  const {
    online,
    offers,
    activeRide,
    toggleOnline,
    accept,
    decline,
    advance,
    trackingError,
    gpsAccuracyM,
    isTracking,
  } = useRideDispatch();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 px-4 py-6 max-w-lg mx-auto space-y-6">
      <PageHeader online={online} toggleOnline={toggleOnline} />

      {!online && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Go online to broadcast your location to the matcher and receive ride offers.
        </p>
      )}

      {online && !activeRide && offers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming offers</h2>
          <ul className="space-y-2">
            {offers.map((o) => (
              <RideOfferCard key={o.id} offer={o} onAccept={accept} onDecline={decline} />
            ))}
          </ul>
        </section>
      )}

      {activeRide && (
        <ActiveRidePanel
          ride={activeRide}
          onAdvance={advance}
          trackingError={trackingError}
          gpsAccuracyM={gpsAccuracyM}
          isTracking={isTracking}
        />
      )}

      {activeRide && !online && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Trip in progress — location sync resumes when you are online.
        </p>
      )}
    </div>
  );
}

function PageHeader({
  online,
  toggleOnline,
}: {
  online: boolean;
  toggleOnline: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Passenger rides</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Roam passenger dispatch</p>
      </div>
      <button
        type="button"
        onClick={toggleOnline}
        className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
          online
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
        }`}
      >
        {online ? 'Online' : 'Go online'}
      </button>
    </div>
  );
}
