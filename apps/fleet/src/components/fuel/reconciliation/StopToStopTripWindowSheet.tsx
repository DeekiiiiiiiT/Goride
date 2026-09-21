/**
 * Window-scoped trip list for stop-to-stop OVER-LOG remediation (stays in wizard).
 */
import React, { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Button } from '../../ui/button';
import { ManualTripForm } from '../../trips/ManualTripForm';
import { api } from '../../../services/api';
import { createManualTrip, type ManualTripInput } from '../../../utils/tripFactory';
import type { Trip } from '../../../types/data';
import type { OdometerBucket } from '@roam/fuel-core';
import { toEntryYmd } from '../../../utils/fuelWeekPeriod';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus } from 'lucide-react';

function tripInBucketWindow(trip: Trip, bucket: OdometerBucket): boolean {
  if (trip.vehicleId && trip.vehicleId !== bucket.vehicleId) return false;
  if (trip.status !== 'Completed' && trip.status !== 'Cancelled') return false;
  const ymd = toEntryYmd(trip.date || trip.requestTime || '');
  const start = toEntryYmd(bucket.startDate);
  const end = toEntryYmd(bucket.endDate);
  if (!ymd || !start || !end) return false;
  return ymd >= start && ymd < end;
}

function tripToInitialData(trip: Trip) {
  const tripDate = new Date(trip.requestTime || trip.date);
  const year = tripDate.getFullYear();
  const month = String(tripDate.getMonth() + 1).padStart(2, '0');
  const day = String(tripDate.getDate()).padStart(2, '0');
  const hours = String(tripDate.getHours()).padStart(2, '0');
  const minutes = String(tripDate.getMinutes()).padStart(2, '0');
  let endTime: string | undefined;
  let duration: number | undefined = trip.duration;
  if (trip.dropoffTime) {
    const dropoff = new Date(trip.dropoffTime);
    endTime = `${String(dropoff.getHours()).padStart(2, '0')}:${String(dropoff.getMinutes()).padStart(2, '0')}`;
    if (!duration) {
      duration = Math.round((dropoff.getTime() - tripDate.getTime()) / 60000);
    }
  }
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    endTime,
    duration,
    pickupLocation: trip.pickupLocation || '',
    endLocation: trip.dropoffLocation || '',
    distance: trip.distance || 0,
  };
}

export type StopToStopTripWindowSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: OdometerBucket | null;
  trips: Trip[];
  vehicleLabel: string;
  drivers: { id: string; name: string }[];
  vehicles: { id: string; plate: string }[];
  periodLocked?: boolean;
  onChanged: () => void;
};

export function StopToStopTripWindowSheet(props: StopToStopTripWindowSheetProps) {
  const {
    open,
    onOpenChange,
    bucket,
    trips,
    vehicleLabel,
    drivers,
    vehicles,
    periodLocked = false,
    onChanged,
  } = props;

  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const windowTrips = useMemo(() => {
    if (!bucket) return [];
    return trips
      .filter((t) => tripInBucketWindow(t, bucket))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [trips, bucket]);

  const totalKm = windowTrips.reduce((s, t) => s + (Number(t.distance) || 0), 0);

  const openCreate = () => {
    setEditingTrip(null);
    setFormOpen(true);
  };

  const openEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setFormOpen(true);
  };

  const handleSubmit = async (data: ManualTripInput, driverId?: string) => {
    if (!bucket) return;
    try {
      if (editingTrip) {
        const updated: Trip = {
          ...editingTrip,
          date: data.date,
          requestTime: data.date && data.time ? `${data.date}T${data.time}:00` : editingTrip.requestTime,
          distance: data.distance,
          pickupLocation: data.pickupLocation,
          dropoffLocation: data.dropoffLocation,
          amount: data.amount,
          platform: data.platform as Trip['platform'],
          notes: data.notes,
          vehicleId: data.vehicleId || bucket.vehicleId,
          driverId: driverId || editingTrip.driverId,
        };
        await api.saveTrips([updated]);
        toast.success('Trip updated');
      } else {
        const driver = drivers.find((d) => d.id === driverId);
        const trip = createManualTrip(data, driverId || drivers[0]?.id || 'unknown', driver?.name);
        trip.vehicleId = data.vehicleId || bucket.vehicleId;
        await api.saveTrips([trip]);
        toast.success('Trip added');
      }
      setFormOpen(false);
      setEditingTrip(null);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save trip');
      throw e;
    }
  };

  const handleDelete = async (trip: Trip) => {
    if (!window.confirm(`Delete trip ${trip.platform} ${trip.distance || 0} km?`)) return;
    setBusyId(trip.id);
    try {
      await api.deleteTrip(trip.id);
      toast.success('Trip deleted');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete trip');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b border-slate-200 px-4 py-3 text-left">
            <SheetTitle>Trips — {vehicleLabel}</SheetTitle>
            <SheetDescription>
              {bucket
                ? `${bucket.startDate} → ${bucket.endDate} · ${windowTrips.length} trip${
                    windowTrips.length === 1 ? '' : 's'
                  } · ${totalKm.toFixed(1)} km logged`
                : 'Select a fill window'}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {windowTrips.length === 0 ? (
              <p className="text-sm text-slate-600">
                No trips in this fill window. If OVER-LOG persists, check odometer or personal/company adjustments.
              </p>
            ) : (
              windowTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {trip.platform} · {(Number(trip.distance) || 0).toFixed(1)} km
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {String(trip.date).slice(0, 10)} · {trip.pickupLocation || '—'} →{' '}
                      {trip.dropoffLocation || '—'}
                    </p>
                    <p className="text-xs text-slate-400">{trip.status}</p>
                  </div>
                  {!periodLocked ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2"
                        onClick={() => openEdit(trip)}
                        aria-label="Edit trip"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2 text-rose-700"
                        disabled={busyId === trip.id}
                        onClick={() => void handleDelete(trip)}
                        aria-label="Delete trip"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <SheetFooter className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            {!periodLocked ? (
              <Button type="button" className="min-h-11 gap-1" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add trip in window
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ManualTripForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        isAdmin
        drivers={drivers}
        vehicles={vehicles}
        defaultVehicleId={bucket?.vehicleId}
        editingTrip={editingTrip || undefined}
        initialData={
          editingTrip
            ? tripToInitialData(editingTrip)
            : bucket
              ? { date: bucket.startDate }
              : undefined
        }
      />
    </>
  );
}
