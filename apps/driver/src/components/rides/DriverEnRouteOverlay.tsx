import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { RideRequestRow } from '@roam/types/rides';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { EnRoutePickupPanel } from './EnRoutePickupPanel';

function isEnRouteToPickup(status: RideRequestRow['status']): boolean {
  return status === 'driver_assigned' || status === 'driver_en_route_pickup';
}

/** Full-screen en-route UI above all driver tabs while heading to pickup. */
export function DriverEnRouteOverlay() {
  const { activeRide, advance, trackingError, gpsAccuracyM, activeRideWaitTime } =
    useRideDispatchContext();

  const show =
    activeRide &&
    isDriverActiveRideStatus(activeRide.status) &&
    isEnRouteToPickup(activeRide.status);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show, activeRide?.id]);

  if (!show || !activeRide) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 top-14 z-[150] flex flex-col bg-[#f7f9fb] dark:bg-slate-950"
      style={{ bottom: 'var(--driver-bottom-nav-total)' }}
      role="region"
      aria-label="En route to pickup"
    >
      <EnRoutePickupPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        gpsAccuracyM={gpsAccuracyM}
        waitTimeInfo={activeRideWaitTime}
      />
    </div>,
    document.body,
  );
}
