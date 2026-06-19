import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { HaulTripShell } from './HaulTripShell';
import { HaulArrivedPickupView } from './HaulArrivedPickupView';

export function HaulArrivedPickupOverlay() {
  const { activeRide, advance } = useRideDispatchContext();

  const show = Boolean(
    activeRide &&
      isDriverActiveRideStatus(activeRide.status) &&
      activeRide.status === 'driver_arrived_pickup',
  );

  if (!show || !activeRide) return null;

  return (
    <HaulTripShell show={show} rideKey={activeRide.id} ariaLabel="Arrived at pickup" zIndex={155}>
      <HaulArrivedPickupView ride={activeRide} onAdvance={advance} />
    </HaulTripShell>
  );
}
