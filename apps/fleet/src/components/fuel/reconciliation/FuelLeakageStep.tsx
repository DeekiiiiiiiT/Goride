/**
 * Unexplained / leakage step — extracted from FuelPeriodWizard.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { CompactVehicleList, type CompactVehicleRow } from './CompactVehicleList';
import { FuelGapAttribution } from './FuelGapAttribution';
import { BucketReconciliationView } from '../BucketReconciliationView';
import { unexplainedLabel } from '../../../utils/fuelReconGlossary';
import type { FuelEntry, MileageAdjustment } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import type { DateRange } from 'react-day-picker';

export type FuelLeakageStepProps = {
  leakage: number;
  leakageRows: CompactVehicleRow[];
  queueIndex: number;
  vehicleSnaps: Array<{ vehicleId: string; misc: number }>;
  weekStart: string;
  weekEnd: string;
  fuelEntries: FuelEntry[];
  trips: Trip[];
  showGapDetail: boolean;
  onToggleGapDetail: () => void;
  bucketVehicle: Vehicle | null;
  vehicles: Vehicle[];
  periodLocked: boolean;
  onBucketVehicleChange: (id: string) => void;
  adjustments: MileageAdjustment[];
  dateRange: DateRange | undefined;
  onRefresh: () => void;
};

export function FuelLeakageStep(props: FuelLeakageStepProps) {
  const {
    leakage,
    leakageRows,
    queueIndex,
    vehicleSnaps,
    weekStart,
    weekEnd,
    fuelEntries,
    trips,
    showGapDetail,
    onToggleGapDetail,
    bucketVehicle,
    vehicles,
    periodLocked,
    onBucketVehicleChange,
    adjustments,
    dateRange,
    onRefresh,
  } = props;

  return (
    <div className="space-y-3">
      <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        Vehicles with {unexplainedLabel(leakage).toLowerCase()} gaps
      </h3>
      <CompactVehicleList rows={leakageRows} />
      <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
        {leakageRows.map((r, idx) => {
          const snap = vehicleSnaps.find((v) => v.vehicleId === r.id);
          return (
            <div
              key={r.id}
              className={
                idx === queueIndex % Math.max(leakageRows.length, 1)
                  ? 'rounded bg-indigo-50/80 p-1'
                  : 'p-1'
              }
            >
              <FuelGapAttribution
                vehicleId={r.id}
                plate={r.title}
                misc={snap?.misc || 0}
                weekStart={weekStart}
                weekEnd={weekEnd}
                fuelEntries={fuelEntries}
                trips={trips}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        Gap acceptance is saved for the org when online. Keys: j/k queue · a accept · e edit · Enter
        continue
      </p>
      {leakageRows.length > 0 && (
        <Button type="button" variant="outline" className="min-h-11" onClick={onToggleGapDetail}>
          {showGapDetail ? 'Hide' : 'Show'} stop-to-stop gap detail
        </Button>
      )}
      {showGapDetail && bucketVehicle && (
        <Card className="rounded border border-slate-200">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">
                Stop-to-Stop — {bucketVehicle.licensePlate || bucketVehicle.id}
              </h3>
              {!periodLocked && (
                <select
                  className="min-h-11 rounded border border-slate-200 px-2 py-1 text-sm"
                  value={bucketVehicle.id}
                  onChange={(e) => onBucketVehicleChange(e.target.value)}
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.licensePlate || v.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <BucketReconciliationView
              vehicle={bucketVehicle}
              trips={trips}
              fuelEntries={fuelEntries}
              adjustments={adjustments}
              dateRange={dateRange}
              periodLocked={periodLocked}
              onRefresh={onRefresh}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
