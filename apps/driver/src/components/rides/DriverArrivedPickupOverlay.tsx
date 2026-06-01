import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { ArrivedPickupPanel } from './ArrivedPickupPanel';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';

/** Arrived-at-pickup UI with PIN entry — shown above all driver tabs. */
export function DriverArrivedPickupOverlay() {
  const { activeRide, advance, trackingError, activeRideWaitTime } = useRideDispatchContext();

  const show = Boolean(
    activeRide &&
      isDriverActiveRideStatus(activeRide.status) &&
      activeRide.status === 'driver_arrived_pickup',
  );

  if (!show || !activeRide) return null;

  return (
    <DriverTripFullscreenShell
      show={show}
      rideKey={activeRide.id}
      ariaLabel="Arrived at pickup"
      zIndex={155}
    >
      <ArrivedPickupPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        waitTimeInfo={activeRideWaitTime}
      />
    </DriverTripFullscreenShell>
  );
}
