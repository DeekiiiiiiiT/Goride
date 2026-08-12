import React, { useEffect, useState } from 'react';
import { Car } from 'lucide-react';
import { cn } from '@roam/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { useDriverProfileExtras } from '../../hooks/useDriverProfileExtras';
import { api } from '../../services/api';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function MyVehicle() {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const { vehicle, loading } = useDriverProfileExtras(driverRecord, user);
  const [ledgerKm, setLedgerKm] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const vid = vehicle?.id || vehicle?.licensePlate;
      if (!vid) {
        setLedgerKm(null);
        return;
      }
      try {
        const current = await api.getOdometerCurrent(String(vid));
        if (!cancelled && current?.km > 0) setLedgerKm(current.km);
      } catch {
        if (!cancelled) setLedgerKm(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [vehicle?.id, vehicle?.licensePlate]);

  const title = vehicle
    ? `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || 'Assigned vehicle'
    : null;
  const plate =
    (vehicle?.licensePlate as string | undefined) ||
    (vehicle?.plateNumber as string | undefined) ||
    '—';
  const color = (vehicle?.color as string | undefined) || '—';
  const odometer =
    ledgerKm != null
      ? ledgerKm.toLocaleString()
      : vehicle?.odometer != null
        ? Number(vehicle.odometer).toLocaleString()
        : vehicle?.currentOdometer != null
          ? Number(vehicle.currentOdometer).toLocaleString()
          : vehicle?.metrics && typeof vehicle.metrics === 'object' && (vehicle.metrics as any).odometer != null
            ? Number((vehicle.metrics as any).odometer).toLocaleString()
            : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Vehicle</h1>

      {loading ? (
        <div className={cn(cardClass, 'p-8 text-center text-sm text-slate-500 dark:text-slate-400')}>
          Loading vehicle…
        </div>
      ) : !vehicle ? (
        <div className={cn(cardClass, 'p-8 text-center')}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Car className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">No vehicle on file</h3>
          <p className="mx-auto max-w-xs text-sm text-slate-600 dark:text-slate-400">
            When a vehicle is assigned to your account, it will show up here.
          </p>
        </div>
      ) : (
        <div className={cn(cardClass, 'p-5')}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
              {vehicle.image ? (
                <img src={String(vehicle.image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <Car className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{plate}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Color</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{color}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Mileage</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {odometer != null ? `${odometer} km` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
