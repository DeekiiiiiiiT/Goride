import React from 'react';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { DriverHomeDashboard } from './DriverHomeDashboard';

export function DriverMintHome() {
  const { activeRide } = useRideDispatchContext();
  const enRouteToPickup =
    activeRide?.status === 'driver_assigned' || activeRide?.status === 'driver_en_route_pickup';
  const onTrip = activeRide?.status === 'on_trip';
  const arrivedAtPickup = activeRide?.status === 'driver_arrived_pickup';
  const awaitingCash = activeRide?.status === 'awaiting_cash_settlement';
  const tripFlowActive = enRouteToPickup || onTrip || arrivedAtPickup || awaitingCash;

  return (
    <div className="flex min-h-[calc(100dvh-8rem-env(safe-area-inset-bottom,0px))] flex-col">
      <DriverHomeDashboard tripFlowActive={tripFlowActive} />
    </div>
  );
}
