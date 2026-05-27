import React from 'react';
import { Radio } from 'lucide-react';
import { useRideDispatch } from '../../hooks/useRideDispatch';
import { RideOfferCard } from './RideOfferCard';
import { ActiveRidePanel } from './ActiveRidePanel';

export function RideDispatchHome() {
  const {
    online,
    offers,
    activeRide,
    toggleOnline,
    accept,
    decline,
    advance,
    vehicleReady,
    presenceError,
    trackingError,
    gpsAccuracyM,
    isTracking,
  } = useRideDispatch();

  const showWaiting = online && offers.length === 0 && !activeRide;

  return (
    <div className="flex flex-1 flex-col gap-4 min-h-0">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <DispatchStatusHeader online={online} />
        <button
          type="button"
          onClick={toggleOnline}
          disabled={!vehicleReady && !online}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
            online
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
              : 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
          }`}
        >
          {online ? 'Online' : 'Go online'}
        </button>
      </div>

      {!online && presenceError && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center px-2">{presenceError}</p>
      )}

      {!online && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
          Go online to receive Roam ride requests from passengers nearby.
        </p>
      )}

      {showWaiting && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Waiting for ride requests</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            Stay on this screen. You will be notified when a passenger books nearby.
          </p>
        </div>
      )}

      {online && offers.length > 0 && (
        <section className="space-y-2 shrink-0">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-0.5">
            Incoming offers
          </h2>
          <ul className="space-y-2">
            {offers.map((o) => (
              <RideOfferCard key={o.id} offer={o} onAccept={accept} onDecline={decline} compact />
            ))}
          </ul>
        </section>
      )}

      {activeRide && (
        <div className="shrink-0">
          <ActiveRidePanel
            ride={activeRide}
            onAdvance={advance}
            compact
            trackingError={trackingError}
            gpsAccuracyM={gpsAccuracyM}
            isTracking={isTracking}
          />
        </div>
      )}
    </div>
  );
}

function DispatchStatusHeader({ online }: { online: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Radio
        className={`h-4 w-4 shrink-0 ${online ? 'text-emerald-500' : 'text-slate-400'}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {online ? 'Listening for trips' : 'You are offline'}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          Roam passenger dispatch
        </p>
      </div>
    </div>
  );
}
