import React from 'react';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { HaulTripShell } from './HaulTripShell';
import { HaulDeliveryCompleteView } from './HaulDeliveryCompleteView';

export function HaulDeliveryCompleteOverlay() {
  const { digitalTripComplete, dismissDigitalTripComplete } = useRideDispatchContext();

  if (!digitalTripComplete) return null;

  return (
    <HaulTripShell show rideKey={digitalTripComplete.id} ariaLabel="Delivery complete">
      <HaulDeliveryCompleteView ride={digitalTripComplete} onDone={dismissDigitalTripComplete} />
    </HaulTripShell>
  );
}
