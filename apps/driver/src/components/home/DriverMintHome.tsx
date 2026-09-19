import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useDriver } from '../../contexts/DriverContext';
import { DriverHomeDashboard } from './DriverHomeDashboard';
import { FleetStartTripLauncher } from './FleetStartTripLauncher';
import { loadMyFleetInvites } from '../../lib/driverRoamTagService';
import { api } from '../../services/api';
import type { VehicleCustodyStatus } from '../../hooks/useWeeklyCheckIn';
import { Button } from '@roam/ui';

type Props = {
  onOpenFleetInvites?: () => void;
  custodyStatus?: VehicleCustodyStatus;
  assignedVehicleId?: string | null;
  onCustodyConfirmed?: () => void;
};

export function DriverMintHome({
  onOpenFleetInvites,
  custodyStatus = 'none',
  assignedVehicleId = null,
  onCustodyConfirmed,
}: Props) {
  const { activeRide } = useRideDispatchContext();
  const { isFleetDriver, profile } = useDriver();
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [confirmBusy, setConfirmBusy] = useState(false);
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

  const onConfirmCustody = async () => {
    if (!assignedVehicleId) return;
    setConfirmBusy(true);
    try {
      await api.confirmVehicleCustody(assignedVehicleId);
      toast.success('Vehicle confirmed — you can complete weekly check-in when due');
      onCustodyConfirmed?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not confirm custody');
    } finally {
      setConfirmBusy(false);
    }
  };

  const custodyBanner =
    isFleetDriver && !tripFlowActive
      ? custodyStatus === 'handed_over' && assignedVehicleId
        ? (
            <div className="mx-6 mb-2 mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Confirm you have the vehicle
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200/80">
                Fleet marked this car as handed over. Confirm only when you physically have it.
              </p>
              <Button
                type="button"
                className="mt-3 w-full bg-[#004ac6] hover:bg-[#003da3]"
                disabled={confirmBusy}
                onClick={() => void onConfirmCustody()}
              >
                {confirmBusy ? 'Confirming…' : 'I have this vehicle'}
              </Button>
            </div>
          )
        : custodyStatus === 'assigned'
          ? (
              <div className="mx-6 mb-2 mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Vehicle assigned — waiting for hand-over
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Your fleet must mark the vehicle as handed over before check-in is required.
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
