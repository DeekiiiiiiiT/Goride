import React from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { HaulTripShell } from './HaulTripShell';
import { HaulEnRoutePickupView } from './HaulEnRoutePickupView';

function isEnRouteToPickup(status: RideRequestRow['status']): boolean {
  return status === 'driver_assigned' || status === 'driver_en_route_pickup';
}

export function HaulEnRouteOverlay() {
  const { activeRide, advance, rideLocationLive } = useRideDispatchContext();

  const show = Boolean(
    activeRide && isDriverActiveRideStatus(activeRide.status) && isEnRouteToPickup(activeRide.status),
  );

  if (!show || !activeRide) return null;

  return (
    <HaulTripShell show={show} rideKey={activeRide.id} ariaLabel="En route to pickup">
      <HaulEnRoutePickupView
        ride={activeRide}
        onAdvance={advance}
        distanceToPickupMeters={rideLocationLive?.distance_to_pickup_m}
      />
    </HaulTripShell>
  );
}
