/**
 * Unexplained / leakage step — extracted from FuelPeriodWizard.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { CompactVehicleList, type CompactVehicleRow } from './CompactVehicleList';
import { FuelGapAttribution } from './FuelGapAttribution';
import { BucketReconciliationView } from '../BucketReconciliationView';
import { residualVsSpendPhrase, unexplainedLabel } from '../../../utils/fuelReconGlossary';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import {
  FUEL_RESIDUAL_DISPOSITIONS,
  isOverExplainedFuelWeek,
  type FuelResidualDisposition,
} from '@roam/fuel-core';
import type { FuelEntry, MileageAdjustment } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import type { DateRange } from 'react-day-picker';

export type FuelLeakageStepProps = {
  leakage: number;
  /** Total fuel spend for the week — required for the residual magnitude gate (H-2). */
  totalSpend: number;
  leakageRows: CompactVehicleRow[];
  queueIndex: number;
  vehicleSnaps: Array<{
    vehicleId: string;
    misc: number;
    report?: {
      actualFuelLiters?: number;
      efficiency?: number;
    };
  }>;
  leakageDisposition: FuelResidualDisposition | '';
  onLeakageDispositionChange: (value: FuelResidualDisposition) => void;
  /** Accept reason — shown next to disposition (U-13 UX). */
  acceptNote: string;
  onAcceptNoteChange: (value: string) => void;
  onAcceptNoteBlur?: () => void;
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
  transactions?: import('../../../types/data').FinancialTransaction[];
  /** R-1: dedicated accept for fills without odometer (names $). */
  unattributedFill?: number;
  needsUnattributedAck?: boolean;
  unattributedReviewed?: boolean;
  unattributedNote?: string;
  onUnattributedNoteChange?: (value: string) => void;
  onAckUnattributed?: () => void;
};

export function FuelLeakageStep(props: FuelLeakageStepProps) {
  const {
    leakage,
    totalSpend,
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
    leakageDisposition,
    onLeakageDispositionChange,
    acceptNote,
    onAcceptNoteChange,
    onAcceptNoteBlur,
    transactions = [],
    unattributedFill = 0,
    needsUnattributedAck = false,
    unattributedReviewed = false,
    unattributedNote = '',
    onUnattributedNoteChange,
    onAckUnattributed,
  } = props;

  const overExplained = isOverExplainedFuelWeek(totalSpend, leakage);
  const overPct =
    totalSpend > 0 ? Math.round((Math.abs(leakage) / totalSpend) * 100) : null;

  return (
    <div className="space-y-3">
      {needsUnattributedAck && !periodLocked && (
        <div className="space-y-3 rounded-lg border border-slate-300 bg-white px-3 py-3">
          {unattributedReviewed ? (
            <p className="text-sm text-slate-700">
              Fills without odometer accepted: {formatFuelMoney(unattributedFill)}.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">
                Accept fills without odometer: {formatFuelMoney(unattributedFill)}
              </p>
              <p className="text-[12px] text-slate-500">
                Separate from unexplained misc — this accept only clears the fills-without-odometer
                gate.
              </p>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reason{' '}
                  <span className="font-normal normal-case text-slate-400">(8+ characters)</span>
                </span>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={unattributedNote}
                  onChange={(e) => onUnattributedNoteChange?.(e.target.value)}
                  placeholder="Why are you accepting fills logged without odometer?"
                />
              </label>
              <Button
                type="button"
                className="min-h-11"
                disabled={!onAckUnattributed || unattributedNote.trim().length < 8}
                onClick={() => onAckUnattributed?.()}
              >
                Accept fills without odometer: {formatFuelMoney(unattributedFill)}
              </Button>
            </>
          )}
        </div>
      )}
      {overExplained && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-950"
        >
          {overExplained && leakage < 0
            ? `Over-explained is ${residualVsSpendPhrase(overPct)} — this week is not fit to finalize until inputs are fixed (modelled costs exceed gas-card spend).`
            : `${unexplainedLabel(leakage)} is ${residualVsSpendPhrase(overPct)} — this week is not fit to finalize until inputs are fixed (fuel spend is not fully explained by distance categories).`}
        </div>
      )}
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
                estimateLiters={snap?.report?.actualFuelLiters}
                estimateKmPerLiter={snap?.report?.efficiency}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        {overExplained
          ? leakage < 0
            ? 'Do not accept this week — modelled costs exceed spend. Fix odometer / efficiency data first.'
            : 'Investigate missing litres, odometer, or card misuse. Accept requires an 8+ character reason in the step note.'
          : 'Accept acknowledges leftover fuel spend; the unexplained amount stays on the week (not zeroed). Type a reason (8+ chars) in the step note, then accept. Keys: j/k queue · a accept · e edit · Enter continue'}
      </p>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Residual disposition
          </span>
          <select
            className="min-h-11 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            value={leakageDisposition}
            disabled={periodLocked}
            onChange={(e) =>
              onLeakageDispositionChange(e.target.value as FuelResidualDisposition)
            }
          >
            <option value="">Select why fuel is unexplained…</option>
            {FUEL_RESIDUAL_DISPOSITIONS.map((code) => (
              <option key={code} value={code}>
                {code.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Accept reason <span className="font-normal normal-case text-slate-400">(required, 8+ characters)</span>
          </span>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={acceptNote}
            disabled={periodLocked}
            onChange={(e) => onAcceptNoteChange(e.target.value)}
            onBlur={onAcceptNoteBlur}
            placeholder="Why are you accepting this unexplained amount?"
            aria-required
          />
        </label>
        <p className="text-[11px] text-slate-500">
          Choose a disposition and type a reason here, then use Mark reviewed &amp; continue above.
        </p>
      </div>
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
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="sr-only">Vehicle for gap detail</span>
                  <select
                    aria-label="Vehicle for gap detail"
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
                </label>
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
              transactions={transactions}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
