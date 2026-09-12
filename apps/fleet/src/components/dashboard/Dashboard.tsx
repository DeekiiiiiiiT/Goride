import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { applyDriverAssignmentChange } from '../../utils/vehicleDriverAssignmentHistory';
import { isVehicleParked } from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import {
  DashboardDriverTable,
  type DashboardDriverRow,
} from './DashboardDriverTable';
import {
  DashboardAssignVehicleDialog,
  type AssignableVehicleOption,
} from './DashboardAssignVehicleDialog';

type Props = {
  onSelectDriver?: (driverId: string) => void;
};

function vehicleLabel(v: {
  year?: string | number;
  make?: string;
  model?: string;
}): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ').trim();
}

export function Dashboard({ onSelectDriver }: Props) {
  const queryClient = useQueryClient();
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);

  const { data: rosterPayload, isLoading: rosterLoading } = useQuery({
    queryKey: ['driversRoster'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const vehicleList = useMemo(
    () => (Array.isArray(vehicles) ? vehicles : []),
    [vehicles],
  );

  const byDriverId = useMemo(() => {
    const map = new Map<string, any>();
    for (const v of vehicleList) {
      const driverId = v?.currentDriverId;
      if (driverId && typeof driverId === 'string' && !map.has(driverId)) {
        map.set(driverId, v);
      }
    }
    return map;
  }, [vehicleList]);

  const rows: DashboardDriverRow[] = useMemo(() => {
    const roster = rosterPayload?.data ?? [];

    return roster.map((driver) => {
      const assigned = byDriverId.get(driver.id);
      const fromVehicle = assigned ? vehicleLabel(assigned) : '';
      const fromRoster =
        typeof driver.vehicle === 'string' &&
        driver.vehicle.trim() &&
        driver.vehicle.toLowerCase() !== 'unassigned'
          ? driver.vehicle.trim()
          : '';

      return {
        id: driver.id,
        name: driver.name || 'Unknown Driver',
        avatarUrl: driver.avatarUrl,
        phone: driver.phone || '—',
        email: driver.email || '',
        status: driver.status || 'Active',
        vehicleId: assigned?.id,
        vehicleLabel: fromVehicle || fromRoster || 'Unassigned',
        licensePlate: assigned?.licensePlate || '',
        vehicleImage: assigned?.image || undefined,
      };
    });
  }, [rosterPayload, byDriverId]);

  const assignDriver = useMemo(
    () => rows.find((r) => r.id === assignDriverId) ?? null,
    [rows, assignDriverId],
  );

  const assignableVehicles: AssignableVehicleOption[] = useMemo(
    () =>
      vehicleList.map((v: any) => ({
        id: v.id,
        label: vehicleLabel(v) || v.licensePlate || v.id,
        licensePlate: v.licensePlate || '',
        image: v.image,
        currentDriverName: v.currentDriverName,
        parked: isVehicleParked(v),
      })),
    [vehicleList],
  );

  const refreshAssignmentCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] }),
      queryClient.invalidateQueries({ queryKey: ['drivers'] }),
    ]);
  };

  const clearVehicleDriver = async (vehicle: any) => {
    // Empty strings so JSON.stringify keeps the clear (undefined fields get dropped).
    const updated = {
      ...vehicle,
      currentDriverId: '',
      currentDriverName: '',
      driverAssignmentHistory: applyDriverAssignmentChange(vehicle, null, ''),
    };
    await api.saveVehicle(updated);
  };

  const handleUnassignVehicle = async (driverId: string) => {
    const vehicle = byDriverId.get(driverId);
    if (!vehicle) {
      toast.info('This driver has no vehicle to unassign.');
      return;
    }

    setBusyDriverId(driverId);
    try {
      await clearVehicleDriver(vehicle);
      await refreshAssignmentCaches();
      toast.success('Vehicle unassigned');
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Could not unassign vehicle');
      }
    } finally {
      setBusyDriverId(null);
    }
  };

  const handleConfirmAssign = async (vehicleId: string) => {
    if (!assignDriverId) return;
    const driver = rows.find((r) => r.id === assignDriverId);
    if (!driver) return;

    const nextVehicle = vehicleList.find((v: any) => v.id === vehicleId);
    if (!nextVehicle) {
      toast.error('Vehicle not found');
      return;
    }
    if (isVehicleParked(nextVehicle)) {
      toast.warning('Vehicle is parked', {
        description: 'Pending catalog approval — cannot assign yet.',
      });
      return;
    }

    setBusyDriverId(assignDriverId);
    try {
      const previous = byDriverId.get(assignDriverId);
      if (previous && previous.id !== vehicleId) {
        await clearVehicleDriver(previous);
      }

      const updated = {
        ...nextVehicle,
        currentDriverId: assignDriverId,
        currentDriverName: driver.name,
        status: 'Active',
        driverAssignmentHistory: applyDriverAssignmentChange(
          nextVehicle,
          assignDriverId,
          driver.name,
        ),
      };
      await api.saveVehicle(updated);
      await refreshAssignmentCaches();
      toast.success('Vehicle assigned', {
        description: `${driver.name} → ${vehicleLabel(nextVehicle) || nextVehicle.licensePlate}`,
      });
      setAssignDriverId(null);
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Could not assign vehicle');
      }
    } finally {
      setBusyDriverId(null);
    }
  };

  const loading = rosterLoading || vehiclesLoading;

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Dashboard
      </h2>

      <DashboardDriverTable
        rows={rows}
        onOpenDriver={onSelectDriver}
        onAssignVehicle={(driverId) => setAssignDriverId(driverId)}
        onUnassignVehicle={handleUnassignVehicle}
        assignmentBusyDriverId={busyDriverId}
      />

      <DashboardAssignVehicleDialog
        open={Boolean(assignDriverId)}
        onOpenChange={(open) => {
          if (!open && !busyDriverId) setAssignDriverId(null);
        }}
        driverName={assignDriver?.name || ''}
        vehicles={assignableVehicles}
        currentVehicleId={assignDriver?.vehicleId}
        busy={Boolean(busyDriverId)}
        onConfirm={handleConfirmAssign}
      />
    </div>
  );
}
