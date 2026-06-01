import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { OnTripPanel } from './OnTripPanel';

/** Full-screen on-trip UI above all driver tabs. */
export function DriverOnTripOverlay() {
  const { activeRide, advance, trackingError, gpsAccuracyM } = useRideDispatchContext();

  const show = Boolean(
    activeRide && isDriverActiveRideStatus(activeRide.status) && activeRide.status === 'on_trip',
  );

  if (!show || !activeRide) return null;

  return (
    <DriverTripFullscreenShell show={show} rideKey={activeRide.id} ariaLabel="On trip">
      <OnTripPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        gpsAccuracyM={gpsAccuracyM}
      />
    </DriverTripFullscreenShell>
  );
}
