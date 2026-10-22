import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { ManualTripForm } from '../trips/ManualTripForm';
import { TripMapDialog } from '../trips/TripMapDialog';
import { DeleteConfirmationDialog } from '../trips/DeleteConfirmationDialog';
import { api } from '../../services/api';
import { createManualTrip, type ManualTripInput } from '../../utils/tripFactory';
import { usePermissions } from '../../hooks/usePermissions';
import type { Trip } from '../../types/data';

type ColumnConfig = {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
};

function tripToFormInitial(trip: Trip) {
  const raw = trip.requestTime || trip.date;
  const tripDate = raw ? new Date(raw) : new Date();
  const valid = !Number.isNaN(tripDate.getTime());
  const date = valid
    ? `${tripDate.getFullYear()}-${String(tripDate.getMonth() + 1).padStart(2, '0')}-${String(tripDate.getDate()).padStart(2, '0')}`
    : String(raw || '').slice(0, 10);
  const time = valid
    ? `${String(tripDate.getHours()).padStart(2, '0')}:${String(tripDate.getMinutes()).padStart(2, '0')}`
    : '00:00';
  let endTime: string | undefined;
  if (trip.dropoffTime) {
    const dropoff = new Date(trip.dropoffTime);
    if (!Number.isNaN(dropoff.getTime())) {
      endTime = `${String(dropoff.getHours()).padStart(2, '0')}:${String(dropoff.getMinutes()).padStart(2, '0')}`;
    }
  }
  const route = Array.isArray(trip.route) ? trip.route : [];
  return {
    date,
    time,
    endTime,
    duration: trip.duration,
    pickupLocation: trip.pickupLocation || '',
    endLocation: trip.dropoffLocation || '',
    distance: trip.distance || 0,
    route,
    pickupCoords: trip.startLat != null && trip.startLng != null ? { lat: trip.startLat, lon: trip.startLng } : undefined,
    dropoffCoords: trip.endLat != null && trip.endLng != null ? { lat: trip.endLat, lon: trip.endLng } : undefined,
  };
}

function routeForMap(trip: Trip): Trip['route'] {
  const route = trip.route as unknown;
  if (Array.isArray(route)) return route;
  if (route && typeof route === 'object' && Array.isArray((route as { points?: unknown }).points)) {
    return (route as { points: Trip['route'] }).points;
  }
  return [];
}

/** Trip Ledger plus log, edit, delete, and route for trips recorded in the app. */
export function TripLedgerWithManualAdd({ columnConfig }: { columnConfig?: ColumnConfig[] }) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can('transactions.edit');
  const [open, setOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [mapTrip, setMapTrip] = useState<Trip | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [deleteTrip, setDeleteTrip] = useState<Trip | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'options'],
    queryFn: async () => {
      const rows = await api.getDrivers();
      return rows.map((d: { id: string; name?: string; driverName?: string }) => ({
        id: d.id,
        name: d.name || d.driverName || 'Unknown',
      }));
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'options'],
    queryFn: async () => {
      const rows = await api.getVehicles();
      return rows.map((v: { id: string; plateNumber?: string; licensePlate?: string }) => ({
        id: v.id,
        plate: v.plateNumber || v.licensePlate || v.id,
      }));
    },
  });

  const refreshTrips = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ledger', 'trips'] }),
      queryClient.invalidateQueries({ queryKey: ['tripLedgerStats'] }),
      queryClient.invalidateQueries({ queryKey: ['trips'] }),
      queryClient.invalidateQueries({ queryKey: ['tripStats'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['trip-analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['trip-analytics-table'] }),
    ]);
  }, [queryClient]);

  const loadStored = useCallback(async (id: string) => {
    return api.getStoredTrip(id);
  }, []);

  const handleSubmit = async (data: ManualTripInput, driverId?: string) => {
    if (!driverId) {
      toast.error('Driver must be selected');
      throw new Error('Driver must be selected');
    }
    const driverName = drivers.find((d: { id: string; name: string }) => d.id === driverId)?.name || 'Unknown';
    if (editingTrip) {
      const fresh = createManualTrip(data, driverId, driverName);
      const updated: Trip = {
        ...editingTrip,
        ...fresh,
        id: editingTrip.id,
        batchId: editingTrip.batchId || fresh.batchId,
        isManual: editingTrip.isManual ?? fresh.isManual,
        route: Array.isArray(fresh.route) && fresh.route.length > 0 ? fresh.route : editingTrip.route,
      };
      await api.saveTrips([updated]);
      toast.success('Trip updated');
    } else {
      const trip = createManualTrip(data, driverId, driverName);
      const saved = await api.saveTrips([trip]);
      if (saved?.duplicatesKept) toast.message('That trip is already logged');
      else toast.success('Manual trip logged');
    }
    setEditingTrip(null);
    await refreshTrips();
  };

  const onEdit = useCallback(async (trip: Trip) => {
    try {
      const loaded = await loadStored(trip.id);
      setEditingTrip(loaded.trip);
      setOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open that trip');
    }
  }, [loadStored]);

  const onViewRoute = useCallback(async (trip: Trip) => {
    try {
      const loaded = await loadStored(trip.id);
      setMapTrip({ ...loaded.trip, route: routeForMap(loaded.trip) });
      setMapOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open that route');
    }
  }, [loadStored]);

  const onDelete = useCallback(async (trip: Trip) => {
    try {
      const loaded = await loadStored(trip.id);
      setDeleteTrip(loaded.trip);
      setWeekOpen(loaded.weekOpen);
      setDeleteOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open that trip');
    }
  }, [loadStored]);

  const confirmDelete = async () => {
    if (!deleteTrip) return;
    setDeleting(true);
    try {
      const result = await api.deleteTrip(deleteTrip.id);
      if (result.weekRebuilt) toast.success('Trip deleted. This fare and its cash came off the open pay week.');
      else toast.success('Trip deleted');
      setDeleteOpen(false);
      setDeleteTrip(null);
      await refreshTrips();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not delete that trip');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <TripLedgerPage
        columnConfig={columnConfig}
        rowActions={{
          onViewRoute,
          ...(canEdit ? { onEdit, onDelete } : {}),
        }}
        headerActions={
          <button
            type="button"
            onClick={() => { setEditingTrip(null); setOpen(true); }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            title="Fleet books only — not Roam driver wallet"
          >
            <Plus className="h-4 w-4" />
            Log Manual Trip
          </button>
        }
      />
      <ManualTripForm
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditingTrip(null);
        }}
        onSubmit={handleSubmit}
        isAdmin
        drivers={drivers}
        vehicles={vehicles}
        editingTrip={editingTrip || undefined}
        initialData={editingTrip ? tripToFormInitial(editingTrip) : undefined}
      />
      <TripMapDialog trip={mapTrip} open={mapOpen} onOpenChange={setMapOpen} />
      <DeleteConfirmationDialog
        trip={deleteTrip}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => { void confirmDelete(); }}
        isDeleting={deleting}
        weekOpen={weekOpen}
      />
    </>
  );
}
