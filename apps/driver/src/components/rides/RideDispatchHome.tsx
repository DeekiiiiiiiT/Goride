import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { RideOfferCard } from './RideOfferCard';
import { ActiveRidePanel } from './ActiveRidePanel';
import { OnlineGaugeSlider } from './OnlineGaugeSlider';
import { PermissionOnboardingSheet } from '../PermissionOnboardingSheet';

type Props = {
  /** Mint home embeds dispatch without the large bottom slider. */
  embedded?: boolean;
};

export function RideDispatchHome({ embedded = false }: Props) {
  const {
    online,
    offers,
    activeRide,
    activeRideWaitTime,
    toggleOnline,
    accept,
    decline,
    advance,
    vehicleReady,
    presenceError,
    trackingError,
    gpsAccuracyM,
    isTracking,
    permissions,
    permissionOnboardingOpen,
    setPermissionOnboardingOpen,
    locationGoOnlineBlocked,
  } = useRideDispatchContext();

  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const showWaiting = online && offers.length === 0 && !showActiveRide;
  const goOnlineDisabled = (!vehicleReady && !online) || (locationGoOnlineBlocked && !online);

  return (
    <>
      <div
        className={`flex flex-col gap-4 min-h-0 ${
          embedded ? '' : 'driver-scroll-pad-for-slider flex-1'
        }`}
      >
        <PermissionOnboardingSheet
          permissions={permissions}
          open={permissionOnboardingOpen}
          onClose={() => setPermissionOnboardingOpen(false)}
        />

        {!embedded && !online && presenceError && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center px-2 shrink-0">
            {presenceError}
          </p>
        )}

        {presenceError && embedded && (
          <p className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {presenceError}
          </p>
        )}

        {!online && locationGoOnlineBlocked && (
          <p className="text-sm text-amber-700 dark:text-amber-400 text-center px-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl py-3 shrink-0">
            Location permission is required to go online. Use Allow above or enable location for this
            site in browser settings.
          </p>
        )}

        {embedded && showWaiting && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center dark:border-slate-700 dark:bg-slate-800/50">
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

        {!embedded && !online && !locationGoOnlineBlocked && !showActiveRide && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4 shrink-0">
            Slide the gauge below to receive Roam ride requests from passengers nearby.
          </p>
        )}

        {!embedded && showWaiting && (
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

        {online && !showActiveRide && offers.length > 0 && (
          <section className={`space-y-2 shrink-0 ${embedded ? '' : 'flex flex-1 flex-col justify-center px-1 py-2'}`}>
            {!embedded && (
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-0.5">
                Incoming offers
              </h2>
            )}
            <ul className={`space-y-2 ${embedded ? '' : 'space-y-3 w-full max-w-md mx-auto'}`}>
              {offers.map((o) => (
                <RideOfferCard key={o.id} offer={o} onAccept={accept} onDecline={decline} compact />
              ))}
            </ul>
          </section>
        )}

        {showActiveRide && (
          <div className="shrink-0">
            <ActiveRidePanel
              ride={activeRide}
              onAdvance={advance}
              compact
              trackingError={trackingError}
              gpsAccuracyM={gpsAccuracyM}
              isTracking={isTracking}
              waitTimeInfo={activeRideWaitTime}
            />
          </div>
        )}
      </div>

      {!embedded && (
        <OnlineGaugeSlider
          online={online}
          onToggle={toggleOnline}
          disabled={goOnlineDisabled}
          className="fixed left-0 right-0 z-[45] driver-online-slider-anchor"
        />
      )}
    </>
  );
}
