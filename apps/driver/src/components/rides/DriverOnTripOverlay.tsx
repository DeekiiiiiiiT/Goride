import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { OnTripPanel } from './OnTripPanel';
import { DriverTollToast } from '@roam/toll-ui';

/** Full-screen on-trip UI above all driver tabs. */
export function DriverOnTripOverlay() {
  const { activeRide, advance, trackingError, gpsAccuracyM, rideLocationLive, driverTollToast, dismissDriverTollToast } =
    useRideDispatchContext();

  const show = Boolean(
    activeRide && isDriverActiveRideStatus(activeRide.status) && activeRide.status === 'on_trip',
  );

  if (!show || !activeRide) return null;

  return (
    <DriverTripFullscreenShell show={show} rideKey={activeRide.id} ariaLabel="On trip">
      {driverTollToast ? (
        <div className="absolute left-4 right-4 top-4 z-50 safe-x">
          <DriverTollToast
            plazaName={driverTollToast.plazaName}
            amountMinor={driverTollToast.amountMinor}
            currency={activeRide.currency ?? 'JMD'}
            tripTotalMinor={driverTollToast.tripTotalMinor}
            onDismiss={dismissDriverTollToast}
          />
        </div>
      ) : null}
      <OnTripPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        gpsAccuracyM={gpsAccuracyM}
        rideLocationLive={rideLocationLive}
      />
    </DriverTripFullscreenShell>
  );
}
