import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { ArrivedPickupPanel } from './ArrivedPickupPanel';

/** Arrived-at-pickup UI with PIN entry — shown above all driver tabs. */
export function DriverArrivedPickupOverlay() {
  const { activeRide, advance, trackingError, activeRideWaitTime } = useRideDispatchContext();

  const show =
    activeRide &&
    isDriverActiveRideStatus(activeRide.status) &&
    activeRide.status === 'driver_arrived_pickup';

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
      className="fixed inset-x-0 top-14 z-[155] flex flex-col bg-[#f7f9fb] dark:bg-slate-950"
      style={{ bottom: 'var(--driver-bottom-nav-total)' }}
      role="region"
      aria-label="Arrived at pickup"
    >
      <ArrivedPickupPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        waitTimeInfo={activeRideWaitTime}
      />
    </div>,
    document.body,
  );
}
