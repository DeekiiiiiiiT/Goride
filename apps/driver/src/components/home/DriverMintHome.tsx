import React from 'react';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useDriver } from '../../contexts/DriverContext';
import { DriverHomeDashboard } from './DriverHomeDashboard';
import { FleetStartTripLauncher } from './FleetStartTripLauncher';

export function DriverMintHome() {
  const { activeRide } = useRideDispatchContext();
  const { isFleetDriver } = useDriver();
  const enRouteToPickup =
    activeRide?.status === 'driver_assigned' || activeRide?.status === 'driver_en_route_pickup';
  const onTrip = activeRide?.status === 'on_trip';
  const arrivedAtPickup = activeRide?.status === 'driver_arrived_pickup';
  const awaitingCash = activeRide?.status === 'awaiting_cash_settlement';
  const tripFlowActive = enRouteToPickup || onTrip || arrivedAtPickup || awaitingCash;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <DriverHomeDashboard
        tripFlowActive={tripFlowActive}
        startTripSlot={isFleetDriver && !tripFlowActive ? <FleetStartTripLauncher /> : null}
      />
    </div>
  );
}
