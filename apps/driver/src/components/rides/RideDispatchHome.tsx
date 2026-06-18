import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { isNativeCapacitorPlatform } from '@roam/types';
import { useDispatchConfig } from '@roam/hauler-dispatch';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { ActiveRidePanel } from './ActiveRidePanel';
import { OnlineGaugeSlider } from './OnlineGaugeSlider';
import { PermissionOnboardingSheet } from '../PermissionOnboardingSheet';

type Props = {
  /** Mint home embeds dispatch without the large bottom slider. */
  embedded?: boolean;
};

export function RideDispatchHome({ embedded = false }: Props) {
  const { ui } = useDispatchConfig();
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
          variant={embedded ? 'inline' : 'modal'}
        />

        {!embedded && !online && presenceError && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center px-2 shrink-0">
            {presenceError}
          </p>
        )}

        {presenceError && embedded && (
          <p className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">
            {presenceError}
          </p>
        )}

        {!permissionOnboardingOpen && !online && locationGoOnlineBlocked && (
          <div
            className={
              embedded
                ? 'shrink-0 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-center'
                : 'shrink-0 space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-center dark:bg-amber-950/40'
            }
          >
            <p
              className={
                embedded
                  ? 'text-sm text-slate-300'
                  : 'text-sm text-amber-800 dark:text-amber-300'
              }
            >
              {isNativeCapacitorPlatform()
                ? 'Location is required to go online. Allow precise location — ideally “Allow all the time” on Android.'
                : 'Location is required to go online. Allow it above or enable location in your browser settings.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                className={
                  embedded
                    ? 'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400'
                    : 'rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white'
                }
                onClick={() => void toggleOnline()}
              >
                {ui.goOnlineLabel}
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

        {embedded && !permissionOnboardingOpen && !online && !locationGoOnlineBlocked && !showActiveRide && (
          <div className="shrink-0 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-center">
            <p className="text-sm text-slate-400">{ui.idleOfflineMessage}</p>
            <button
              type="button"
              disabled={goingOnline || goOnlineDisabled}
              className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void toggleOnline()}
            >
              {goingOnline ? 'Going online…' : ui.goOnlineLabel}
            </button>
          </div>
        )}

        {!embedded && !online && !locationGoOnlineBlocked && !showActiveRide && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4 shrink-0">
            {ui.idleOfflineMessage}
          </p>
        )}

        {showWaiting && (
          <div
            className={
              embedded
                ? 'flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 py-10 text-center'
                : 'flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center'
            }
          >
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  embedded ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            <p
              className={
                embedded
                  ? 'text-sm font-medium text-slate-200'
                  : 'text-sm font-medium text-slate-700 dark:text-slate-200'
              }
            >
              {ui.waitingTitle}
            </p>
            <p className="text-xs text-slate-500 max-w-xs">{ui.waitingDescription}</p>
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
