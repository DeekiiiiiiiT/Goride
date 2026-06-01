import React from 'react';
import { createPortal } from 'react-dom';
import type { RideRequestRow } from '@roam/types/rides';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { EnRoutePickupPanel } from './EnRoutePickupPanel';

function isEnRouteToPickup(status: RideRequestRow['status']): boolean {
  return status === 'driver_assigned' || status === 'driver_en_route_pickup';
}

/** Full-screen en-route UI above all driver tabs while heading to pickup. */
export function DriverEnRouteOverlay() {
  const { activeRide, advance, trackingError, gpsAccuracyM, activeRideWaitTime, rideLocationLive } =
    useRideDispatchContext();

  const show = Boolean(
    activeRide &&
      isDriverActiveRideStatus(activeRide.status) &&
      isEnRouteToPickup(activeRide.status),
  );

  if (!show || !activeRide) return null;

  return (
    <DriverTripFullscreenShell show={show} rideKey={activeRide.id} ariaLabel="En route to pickup">
      <EnRoutePickupPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        gpsAccuracyM={gpsAccuracyM}
        waitTimeInfo={activeRideWaitTime}
        rideLocationLive={rideLocationLive}
      />
    </DriverTripFullscreenShell>
  );
}
