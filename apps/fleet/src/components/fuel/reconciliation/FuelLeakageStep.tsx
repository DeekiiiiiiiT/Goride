/**
 * Fuel gaps step — money residual accept + stop-to-stop mileage Fix (two modes, one step).
 */
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { CompactVehicleList, type CompactVehicleRow } from './CompactVehicleList';
import { FuelGapAttribution } from './FuelGapAttribution';
import { BucketReconciliationView } from '../BucketReconciliationView';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { residualVsSpendPhrase, unexplainedLabel } from '../../../utils/fuelReconGlossary';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { formatJMDDelta } from '../../../utils/formatJMD';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import {
  FUEL_RESIDUAL_DISPOSITIONS,
  isOverExplainedFuelWeek,
  LEFTOVER_BUCKETS,
  openPriorWeeksCarryMessage,
  type FuelResidualDisposition,
  type LeftoverBucket,
} from '@roam/fuel-core';
import { pathForDriverDetail } from '../../../navigation/pageRegistry';
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
      referenceKmPerLiter?: number | null;
      referenceDegraded?: boolean;
      referenceReason?: string;
      clockAssumed?: boolean;
      kmSources?: Array<{ category?: string; km?: number; confidence?: string; note?: string }>;
      routingHealth?: { ok?: boolean; message?: string };
      openPriorWeeks?: string[];
      varianceBalance?: {
        creditIn?: number;
        runningBalance?: number;
        billable?: number;
        driverAdded?: number;
      };
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
  /** When stop-to-stop blocks Finalize — open in-wizard Fix sheet. */
  stopToStopBlocking?: boolean;
  stopToStopSummary?: string;
  onFixStopToStop?: () => void;
  /** Under-explained residual needs disposition (false when residual ≈ 0). */
  showDispositionForm?: boolean;
  bucketVehicle: Vehicle | null;
  vehicles: Vehicle[];
  periodLocked: boolean;
  onBucketVehicleChange: (id: string) => void;
  adjustments: MileageAdjustment[];
  dateRange: DateRange | undefined;
  onRefresh: () => void;
  transactions?: import('../../../types/data').FinancialTransaction[];
  bucketRemediation?: import('../BucketReconciliationView').BucketRemediationCallbacks;
  /** R-1: dedicated accept for fills without odometer (names $). */
  unattributedFill?: number;
  needsUnattributedAck?: boolean;
  unattributedReviewed?: boolean;
  unattributedNote?: string;
  onUnattributedNoteChange?: (value: string) => void;
  onAckUnattributed?: () => void;
  /** Commute cannot be measured until a home pin exists. */
  homeMissing?: boolean;
  /** Drivers whose commute is still unexplained. */
  homeDrivers?: { id: string; name: string }[];
  /** Commute is using the street address, not a confirmed home. */
  streetHomeDrivers?: { id: string; name: string }[];
  periodId?: string;
  onSaveLeftoverOverride?: (override: {
    mode: 'company' | 'percentage' | 'fixed';
    driverPercent: number;
    driverFixedAmount: number;
    appliesTo: LeftoverBucket[];
    note: string;
  }) => Promise<void>;
  /** Mark unexplained residual reviewed and advance (disposition form CTA). */
  onMarkLeakageReviewed?: () => void;
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
    stopToStopBlocking = false,
    stopToStopSummary,
    onFixStopToStop,
    showDispositionForm = false,
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
    bucketRemediation,
    unattributedFill = 0,
    needsUnattributedAck = false,
    unattributedReviewed = false,
    unattributedNote = '',
    onUnattributedNoteChange,
    onAckUnattributed,
    homeMissing = false,
    homeDrivers = [],
    streetHomeDrivers = [],
    onMarkLeakageReviewed,
    periodId,
    onSaveLeftoverOverride,
  } = props;
  const [leftoverMode, setLeftoverMode] = useState<'company' | 'percentage' | 'fixed'>('company');
  const [leftoverPercent, setLeftoverPercent] = useState(0);
  const [leftoverFixed, setLeftoverFixed] = useState(0);
  const [leftoverBuckets, setLeftoverBuckets] = useState<LeftoverBucket[]>(
    LEFTOVER_BUCKETS.map((bucket) => bucket.id),
  );
  const [leftoverNote, setLeftoverNote] = useState('');
  const [savingLeftover, setSavingLeftover] = useState(false);
  const referenceNumbers = vehicleSnaps
    .map((snap) => Number(snap.report?.referenceKmPerLiter))
    .filter((value) => value > 0);
  const referenceOutOfBand = vehicleSnaps.some((snap) => snap.report?.referenceReason === 'reference_out_of_band');
  const referenceTooThin = vehicleSnaps.some((snap) =>
    snap.report?.referenceDegraded && snap.report?.referenceReason !== 'reference_out_of_band',
  );
  const clockAssumed = vehicleSnaps.some((snap) => snap.report?.clockAssumed);
  const sourceNotes = vehicleSnaps.flatMap((snap) => snap.report?.kmSources || [])
    .filter((source) => (source.category === 'reposition' || source.category === 'commute') && source.note);
  const routingHealth = vehicleSnaps.map((snap) => snap.report?.routingHealth).find((health) => health?.message);
  const openPriorWeeks = [...new Set(vehicleSnaps.flatMap((snap) => snap.report?.openPriorWeeks || []))];
  const openPriorMessage = openPriorWeeksCarryMessage(openPriorWeeks);
  const varianceRows = vehicleSnaps.filter((snap) => snap.report?.varianceBalance);

  const overExplained = isOverExplainedFuelWeek(totalSpend, leakage);
  const moneyResidualActive = Math.abs(leakage) > FUEL_SPEND_EPS;
  const overPct =
    totalSpend > 0 ? Math.round((Math.abs(leakage) / totalSpend) * 100) : null;

  return (
    <div className="space-y-3">
      {referenceNumbers.length > 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          Usual economy for this car: {referenceNumbers.map((value) => value.toFixed(1)).join(', ')} km/L.
        </p>
      )}
      {referenceOutOfBand && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This car’s usual economy came out impossible, so the driver was not charged for unexplained fuel.
        </p>
      )}
      {referenceTooThin && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          There isn’t enough earlier fuel history to know this car’s usual economy, so the driver was not charged for unexplained fuel.
        </p>
      )}
      {routingHealth?.message && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${
          routingHealth.ok
            ? 'border-slate-200 bg-slate-50 text-slate-800'
            : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}>
          {routingHealth.message}
        </p>
      )}
      {openPriorMessage && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {openPriorMessage}
        </p>
      )}
      {varianceRows.map((snap) => {
        const balance = snap.report?.varianceBalance;
        if (!balance) return null;
        const plate = vehicles.find((vehicle) => vehicle.id === snap.vehicleId)?.licensePlate;
        const creditIn = Number(balance.creditIn) || 0;
        const driverAdded = Number(balance.driverAdded) || 0;
        const covered = creditIn < 0 && snap.misc > 0 && Number(balance.billable) === 0;
        return (
          <div key={`balance-${snap.vehicleId}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {plate && <p className="font-medium text-slate-900">{plate}</p>}
            <p>Carried from recent weeks: {formatJMDDelta(creditIn, 2)}</p>
            <p>This week’s fuel difference: {formatJMDDelta(snap.misc, 2)}</p>
            <p>Added to the driver’s fuel share: {formatFuelMoney(driverAdded)}</p>
            {covered && (
              <p>Recent weeks already explain this, so nothing is added to the driver’s share.</p>
            )}
          </div>
        );
      })}
      {clockAssumed && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A fill has no time. We treated it as the end of that day. Add a time or link the gas card.
        </p>
      )}
      {sourceNotes.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600">
          {sourceNotes.map((source, index) => (
            <li key={`${source.category}-${index}`}>
              {source.category === 'commute' ? 'Commute' : 'Reposition'}: {source.note}.
            </li>
          ))}
        </ul>
      )}
      {homeMissing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Home is not set. Commute stays unexplained until you pin a home on the driver profile.
          {homeDrivers.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {homeDrivers.map((driver) => (
                <a
                  key={driver.id}
                  className="inline-flex min-h-11 items-center font-medium underline"
                  href={pathForDriverDetail(driver.id, 'profile')}
                >
                  {driver.name}
                </a>
              ))}
            </span>
          )}
        </p>
      )}
      {streetHomeDrivers.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Commute is using the street address on file, not a confirmed home.
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {streetHomeDrivers.map((driver) => (
              <a
                key={driver.id}
                className="inline-flex min-h-11 items-center font-medium underline"
                href={pathForDriverDetail(driver.id, 'profile')}
              >
                {driver.name}
              </a>
            ))}
          </span>
        </p>
      )}
      {periodId && onSaveLeftoverOverride && !periodLocked && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-sm font-medium text-slate-800">Change leftover for this week</p>
          <p className="text-[12px] text-slate-500">
            Optional — only save if you mean to charge the driver a share of leftover. This is not
            the Accept unexplained step below.
          </p>
          <select
            className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
            value={leftoverMode}
            onChange={(e) => setLeftoverMode(e.target.value as 'company' | 'percentage' | 'fixed')}
          >
            <option value="company">Company pays all</option>
            <option value="percentage">Driver pays a percent</option>
            <option value="fixed">Driver pays a fixed amount</option>
          </select>
          <div className="space-y-1">
            {LEFTOVER_BUCKETS.map((bucket) => (
              <label key={bucket.id} className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={leftoverBuckets.includes(bucket.id)}
                  onChange={() => {
                    setLeftoverBuckets((current) =>
                      current.includes(bucket.id)
                        ? current.filter((id) => id !== bucket.id)
                        : [...current, bucket.id],
                    );
                  }}
                />
                {bucket.label}
              </label>
            ))}
          </div>
          {leftoverMode === 'percentage' && (
            <input
              type="number"
              min={0}
              max={100}
              className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
              value={leftoverPercent}
              onChange={(e) => setLeftoverPercent(Number(e.target.value) || 0)}
            />
          )}
          {leftoverMode === 'fixed' && (
            <input
              type="number"
              min={0}
              className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm"
              value={leftoverFixed}
              onChange={(e) => setLeftoverFixed(Number(e.target.value) || 0)}
            />
          )}
          <textarea
            className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={leftoverNote}
            onChange={(e) => setLeftoverNote(e.target.value)}
            placeholder="Why this week is different (8+ characters)"
          />
          <Button
            type="button"
            variant="outline"
            disabled={savingLeftover || leftoverNote.trim().length < 8 || leftoverBuckets.length === 0}
            onClick={() => {
              setSavingLeftover(true);
              void onSaveLeftoverOverride({
                mode: leftoverMode,
                driverPercent: leftoverPercent,
                driverFixedAmount: leftoverFixed,
                appliesTo: leftoverBuckets,
                note: leftoverNote.trim(),
              })
                .catch(() => {})
                .finally(() => setSavingLeftover(false));
            }}
          >
            Save this week’s leftover split
          </Button>
        </div>
      )}
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

      {overExplained && moneyResidualActive && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-950"
        >
          {leakage < 0
            ? `Over-explained is ${residualVsSpendPhrase(overPct)} — this week is not fit to finalize until inputs are fixed (modelled costs exceed gas-card spend).`
            : `${unexplainedLabel(leakage)} is ${residualVsSpendPhrase(overPct)} — this week is not fit to finalize until inputs are fixed (fuel spend is not fully explained by distance categories).`}
        </div>
      )}

      {moneyResidualActive ? (
        <>
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
          {showDispositionForm ? (
            <p className="text-[11px] text-slate-400">
              Accept acknowledges leftover fuel spend; the unexplained amount stays on the week (not
              zeroed). Choose a disposition and reason below, then press Mark reviewed &amp; continue.
            </p>
          ) : overExplained ? (
            <p className="text-[11px] text-slate-400">
              Do not accept this week — modelled costs exceed spend. Fix odometer / efficiency data
              first.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {stopToStopBlocking
            ? 'Money residual clear — mileage still needs Fix below before Finalize will unlock.'
            : 'Nothing left on this step for money residual.'}
        </div>
      )}

      {showDispositionForm ? (
        <div className="space-y-3 rounded-lg border border-slate-900 bg-white px-3 py-3 shadow-sm">
          <p className="text-sm font-medium text-slate-900">
            Accept unexplained fuel (required to continue)
          </p>
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
              Accept reason{' '}
              <span className="font-normal normal-case text-slate-400">(required, 8+ characters)</span>
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
            Choose a disposition and type a reason, then press Mark reviewed &amp; continue.
          </p>
          {onMarkLeakageReviewed ? (
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={
                periodLocked ||
                !leakageDisposition ||
                acceptNote.trim().length < 8
              }
              onClick={onMarkLeakageReviewed}
            >
              Mark reviewed &amp; continue
            </Button>
          ) : null}
        </div>
      ) : null}

      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stopToStopBlocking && onFixStopToStop ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={onFixStopToStop}
              disabled={periodLocked}
            >
              Fix stop-to-stop blockers
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onToggleGapDetail}
          >
            View stop-to-stop gap detail
          </Button>
        </div>
      )}

      {stopToStopBlocking && stopToStopSummary ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
          {stopToStopSummary} Use <strong>Fix stop-to-stop blockers</strong> — looking at the table
          alone will not unlock Finalize.
        </p>
      ) : null}

      <Dialog
        open={showGapDetail && !!bucketVehicle}
        onOpenChange={(open) => {
          if (!open && showGapDetail) onToggleGapDetail();
        }}
      >
        <DialogContent
          className="flex h-[min(92vh,920px)] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-0 overflow-hidden p-0"
          aria-describedby="stop-to-stop-gap-detail-desc"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 px-5 py-4 text-left sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold text-slate-900">
                  Stop-to-Stop — {bucketVehicle?.licensePlate || bucketVehicle?.id || 'Vehicle'}
                </DialogTitle>
                <DialogDescription id="stop-to-stop-gap-detail-desc" className="text-sm text-slate-600">
                  Fill-to-fill windows for this week. Fix odometer, trips, or adjustments — or accept
                  OVER-LOG gaps from Fix stop-to-stop, then return to Lock week.
                </DialogDescription>
              </div>
              {bucketVehicle && vehicles.length > 1 && !periodLocked ? (
                <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Vehicle
                  </span>
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
              ) : null}
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-5 py-4 sm:px-6">
            {bucketVehicle ? (
              <BucketReconciliationView
                vehicle={bucketVehicle}
                trips={trips}
                fuelEntries={fuelEntries}
                adjustments={adjustments}
                dateRange={dateRange}
                periodLocked={periodLocked}
                onRefresh={onRefresh}
                transactions={transactions}
                remediation={bucketRemediation}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
