import React from 'react';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverTripFullscreenShell } from './DriverTripFullscreenShell';
import { DriverDigitalTripCompleteView } from './DriverDigitalTripCompleteView';

/** Full-screen trip complete summary for card / digital payment trips. */
export function DriverDigitalTripCompleteOverlay() {
  const { digitalTripComplete, dismissDigitalTripComplete } = useRideDispatchContext();

  if (!digitalTripComplete) return null;

  return (
    <DriverTripFullscreenShell
      show
      rideKey={digitalTripComplete.id}
      ariaLabel="Trip complete"
    >
      <DriverDigitalTripCompleteView ride={digitalTripComplete} onDone={dismissDigitalTripComplete} />
    </DriverTripFullscreenShell>
  );
}
