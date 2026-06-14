import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { isNativeCapacitorPlatform } from '@roam/types';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
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
    goingOnline,
    offers,
    activeRide,
    activeRideWaitTime,
    toggleOnline,
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
    openLocationSettings,
  } = useRideDispatchContext();

  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const enRouteToPickup =
    showActiveRide &&
    (activeRide.status === 'driver_assigned' || activeRide.status === 'driver_en_route_pickup');
  const onTrip = showActiveRide && activeRide.status === 'on_trip';
  const arrivedAtPickup = showActiveRide && activeRide.status === 'driver_arrived_pickup';
  const awaitingCashSettlement =
    showActiveRide && activeRide.status === 'awaiting_cash_settlement';
  const showActiveRidePanel =
    showActiveRide && !enRouteToPickup && !onTrip && !arrivedAtPickup && !awaitingCashSettlement;
  const showWaiting = online && offers.length === 0 && !showActiveRide;
  const goOnlineDisabled = !vehicleReady && !online;

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
          <div className="shrink-0 space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-center dark:bg-amber-950/40">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {isNativeCapacitorPlatform()
                ? 'Location is required to go online. Allow precise location — ideally “Allow all the time” on Android.'
                : 'Location permission is required to go online. Use Allow above or enable location in your browser settings.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void toggleOnline()}
              >
                {isNativeCapacitorPlatform() ? 'Allow location & go online' : 'Allow location & go online'}
              </button>
              {isNativeCapacitorPlatform() && (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 dark:border-amber-700 dark:text-amber-200"
                  onClick={() => void openLocationSettings()}
                >
                  Open location settings
                </button>
              )}
            </div>
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

        {showActiveRidePanel && (
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
          goingOnline={goingOnline}
          onToggle={toggleOnline}
          disabled={goOnlineDisabled}
          className="fixed left-0 right-0 z-[45] driver-online-slider-anchor"
        />
      )}
    </>
  );
}
