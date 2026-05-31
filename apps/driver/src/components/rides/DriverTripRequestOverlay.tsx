import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { TripRequestOverlay } from './TripRequestOverlay';

/** Full-screen trip request UI — renders above every driver screen when an offer arrives. */
export function DriverTripRequestOverlay() {
  const { online, offers, activeRide, accept, decline } = useRideDispatchContext();
  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const primaryOffer = online && !showActiveRide && offers.length > 0 ? offers[0] : null;

  useEffect(() => {
    if (!primaryOffer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [primaryOffer?.id]);

  if (!primaryOffer) return null;

  const queueHint =
    offers.length > 1 ? `${offers.length} requests — showing newest` : null;

  return createPortal(
    <TripRequestOverlay
      offer={primaryOffer}
      queueHint={queueHint}
      onAccept={accept}
      onDecline={decline}
    />,
    document.body,
  );
}
