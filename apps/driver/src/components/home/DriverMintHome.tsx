import React, { useEffect, useState } from 'react';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useDriver } from '../../contexts/DriverContext';
import { DriverHomeDashboard } from './DriverHomeDashboard';
import { FleetStartTripLauncher } from './FleetStartTripLauncher';
import { loadMyFleetInvites } from '../../lib/driverRoamTagService';
import type { VehicleCustodyStatus } from '../../hooks/useWeeklyCheckIn';

type Props = {
  onOpenFleetInvites?: () => void;
  custodyStatus?: VehicleCustodyStatus;
  assignedVehicleId?: string | null;
};

export function DriverMintHome({
  onOpenFleetInvites,
  custodyStatus = 'none',
  assignedVehicleId = null,
}: Props) {
  const { activeRide } = useRideDispatchContext();
  const { isFleetDriver, profile } = useDriver();
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const enRouteToPickup =
    activeRide?.status === 'driver_assigned' || activeRide?.status === 'driver_en_route_pickup';
  const tripFlowActive = Boolean(activeRide) || enRouteToPickup;

  useEffect(() => {
    if (!isFleetDriver) return;
    void loadMyFleetInvites().then((rows) => setPendingInviteCount(rows.length));
  }, [isFleetDriver]);

  // handed_over is handled by the forced Vehicle Handover modal — no empty tap confirm.
  const custodyBanner =
    isFleetDriver && !tripFlowActive
      ? custodyStatus === 'assigned'
        ? (
            <div className="mx-6 mb-2 mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Vehicle assigned — waiting for hand-over
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Your fleet must mark the vehicle as handed over before Vehicle Handover proof is required.
              </p>
            </div>
          )
        : !assignedVehicleId || custodyStatus === 'none'
          ? (
              <div className="mx-6 mb-2 mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Waiting for a vehicle assignment
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Your fleet hasn’t assigned a vehicle yet. The app stays fully usable until then.
                </p>
              </div>
            )
          : null
      : null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
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
      {custodyBanner}
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
