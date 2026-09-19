import React, { useEffect, useState } from 'react';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useDriver } from '../../contexts/DriverContext';
import { DriverHomeDashboard } from './DriverHomeDashboard';
import { FleetStartTripLauncher } from './FleetStartTripLauncher';
import { loadMyFleetInvites } from '../../lib/driverRoamTagService';

type Props = {
  onOpenFleetInvites?: () => void;
};

export function DriverMintHome({ onOpenFleetInvites }: Props) {
  const { activeRide } = useRideDispatchContext();
  const { isFleetDriver, profile } = useDriver();
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const enRouteToPickup =
    activeRide?.status === 'driver_assigned' || activeRide?.status === 'driver_en_route_pickup';
  const onTrip = activeRide?.status === 'on_trip';
  const arrivedAtPickup = activeRide?.status === 'driver_arrived_pickup';
  const awaitingCash = activeRide?.status === 'awaiting_cash_settlement';
  const tripFlowActive = enRouteToPickup || onTrip || arrivedAtPickup || awaitingCash;

  useEffect(() => {
    if (isFleetDriver) {
      setPendingInviteCount(0);
      return;
    }
    void loadMyFleetInvites().then((rows) => setPendingInviteCount(rows.length));
  }, [isFleetDriver]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {pendingInviteCount > 0 && !tripFlowActive && onOpenFleetInvites ? (
        <button
          type="button"
          onClick={onOpenFleetInvites}
          className="mx-6 mb-2 mt-2 rounded-2xl bg-[#004ac6] px-4 py-3 text-left text-white shadow-sm"
        >
          <p className="text-sm font-semibold">
            {pendingInviteCount === 1
              ? '1 fleet invite waiting'
              : `${pendingInviteCount} fleet invites waiting`}
          </p>
          <p className="text-xs text-white/80">Tap to Accept or Decline</p>
        </button>
      ) : null}
      <DriverHomeDashboard
        tripFlowActive={tripFlowActive}
        startTripSlot={
          isFleetDriver && !tripFlowActive && profile?.manualStartTripEnabled !== false ? (
            <FleetStartTripLauncher />
          ) : null
        }
      />
    </div>
  );
}
