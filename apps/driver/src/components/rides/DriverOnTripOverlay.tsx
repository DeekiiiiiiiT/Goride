import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { OnTripPanel } from './OnTripPanel';

/** Full-screen on-trip UI above all driver tabs. */
export function DriverOnTripOverlay() {
  const { activeRide, advance, trackingError, gpsAccuracyM } = useRideDispatchContext();

  const show =
    activeRide && isDriverActiveRideStatus(activeRide.status) && activeRide.status === 'on_trip';

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
      aria-label="On trip"
    >
      <OnTripPanel
        ride={activeRide}
        onAdvance={advance}
        trackingError={trackingError}
        gpsAccuracyM={gpsAccuracyM}
      />
    </div>,
    document.body,
  );
}
