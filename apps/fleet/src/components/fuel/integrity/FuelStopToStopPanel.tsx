/**
 * Fuel Integrity → Stop-to-stop tab — week/vehicle tank + odometer gap detail.
 */
import { useEffect, useMemo, useState } from 'react';
import { BucketReconciliationView } from '../BucketReconciliationView';
import type { FuelEntry, MileageAdjustment } from '../../../types/fuel';
import type { Trip, FinancialTransaction } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import type { DateRange } from 'react-day-picker';

export type FuelStopToStopPanelProps = {
  vehicles: Vehicle[];
  fuelEntries: FuelEntry[];
  trips: Trip[];
  adjustments?: MileageAdjustment[];
  transactions?: FinancialTransaction[];
  dateRange: DateRange | undefined;
  periodLocked?: boolean;
  preferredVehicleId?: string | null;
  tripsLoading?: boolean;
  onRefresh?: () => void;
};

export function FuelStopToStopPanel({
  vehicles,
  fuelEntries,
  trips,
  adjustments = [],
  transactions = [],
  dateRange,
  periodLocked = false,
  preferredVehicleId = null,
  tripsLoading = false,
  onRefresh,
}: FuelStopToStopPanelProps) {
  const [vehicleId, setVehicleId] = useState<string>(() => {
    if (preferredVehicleId && vehicles.some((v) => v.id === preferredVehicleId)) {
      return preferredVehicleId;
    }
    return vehicles[0]?.id || '';
  });

  useEffect(() => {
    if (preferredVehicleId && vehicles.some((v) => v.id === preferredVehicleId)) {
      setVehicleId(preferredVehicleId);
      return;
    }
    if (!vehicles.some((v) => v.id === vehicleId)) {
      setVehicleId(vehicles[0]?.id || '');
    }
  }, [preferredVehicleId, vehicles, vehicleId]);

  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) || null,
    [vehicles, vehicleId],
  );

  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-800">No vehicles in scope for this week</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Vehicle
          <select
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            aria-label="Vehicle for stop-to-stop"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.licensePlate || v.id}
                {v.model ? ` · ${v.model}` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500 sm:max-w-md">
          Tank and odometer windows for the selected week. Charge Gap stays available when the
          panel reconciles and the week is open.
        </p>
      </div>

      {tripsLoading && (
        <div
          role="status"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          Loading trips for this week…
        </div>
      )}

      {vehicle ? (
        <BucketReconciliationView
          vehicle={vehicle}
          fuelEntries={fuelEntries}
          trips={trips}
          transactions={transactions}
          adjustments={adjustments}
          dateRange={dateRange}
          periodLocked={periodLocked}
          onRefresh={onRefresh}
        />
      ) : null}
    </div>
  );
}
