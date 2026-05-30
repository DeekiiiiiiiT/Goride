import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatch } from '../../hooks/useRideDispatch';
import { RideOfferCard } from './RideOfferCard';
import { ActiveRidePanel } from './ActiveRidePanel';
import { OnlineGaugeSlider } from './OnlineGaugeSlider';
import { PermissionOnboardingSheet } from '../PermissionOnboardingSheet';

/** Space for compact online slider (~6.5rem) + bottom nav (h-16) + safe area */
const BOTTOM_CHROME_OFFSET =
  'calc(10.75rem + env(safe-area-inset-bottom, 0px))';

export function RideDispatchHome() {
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
  } = useRideDispatch();

  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const showWaiting = online && offers.length === 0 && !showActiveRide;
  const goOnlineDisabled = (!vehicleReady && !online) || (locationGoOnlineBlocked && !online);

  return (
    <>
      <div
        className="flex flex-1 flex-col gap-4 min-h-0"
        style={{ paddingBottom: BOTTOM_CHROME_OFFSET }}
      >
        <PermissionOnboardingSheet
          permissions={permissions}
          open={permissionOnboardingOpen}
          onClose={() => setPermissionOnboardingOpen(false)}
        />

        {!online && presenceError && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center px-2 shrink-0">
            {presenceError}
          </p>
        )}

        {!online && locationGoOnlineBlocked && (
          <p className="text-sm text-amber-700 dark:text-amber-400 text-center px-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl py-3 shrink-0">
            Location permission is required to go online. Use Allow above or enable location for this
            site in browser settings.
          </p>
        )}

        {!online && !locationGoOnlineBlocked && !showActiveRide && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4 shrink-0">
            Slide the gauge below to receive Roam ride requests from passengers nearby.
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

        {online && !showActiveRide && offers.length > 0 && (
          <section className="flex flex-1 flex-col justify-center shrink-0 px-1 py-2">
            <ul className="space-y-3 w-full max-w-md mx-auto">
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

      <OnlineGaugeSlider
        online={online}
        onToggle={toggleOnline}
        disabled={goOnlineDisabled}
        className="fixed left-0 right-0 z-30 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]"
      />
    </>
  );
}
