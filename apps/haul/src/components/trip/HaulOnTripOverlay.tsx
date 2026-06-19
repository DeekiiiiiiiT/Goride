import React from 'react';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { HaulTripShell } from './HaulTripShell';
import { HaulOnTripView } from './HaulOnTripView';

export function HaulOnTripOverlay() {
  const { activeRide, advance } = useRideDispatchContext();

  const show = Boolean(
    activeRide && isDriverActiveRideStatus(activeRide.status) && activeRide.status === 'on_trip',
  );

  if (!show || !activeRide) return null;

  return (
    <HaulTripShell show={show} rideKey={activeRide.id} ariaLabel="Delivering">
      <HaulOnTripView ride={activeRide} onAdvance={advance} />
    </HaulTripShell>
  );
}
