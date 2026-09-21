/**
 * In-wizard Fix sheet for stop-to-stop Finalize blockers.
 * Classify → concrete actions / Accept gap → Return to Lock week.
 * Does not leave Week Reconciliation.
 */
import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  classifyStopToStopBucketRemediation,
  findStopToStopGapAccept,
  isStopToStopGapAcceptable,
  sortBucketsForRemediation,
  summarizeStopToStopRemediation,
  type OdometerBucket,
  type StopToStopGapAccept,
  type StopToStopGapAcceptDisposition,
} from '@roam/fuel-core';
import type { FuelEntry } from '../../../types/fuel';
import { Gauge, Route, SlidersHorizontal, ScanLine, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';

export type StopToStopAdjustmentDefaults = {
  vehicleId?: string;
  dateFrom?: string;
  dateTo?: string;
  date?: Date;
};

export type StopToStopRemediationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleLabel: string;
  vehicleId: string;
  buckets: OdometerBucket[];
  fuelEntries: FuelEntry[];
  periodLocked?: boolean;
  focusBucketId?: string | null;
  /** Server period UUID for accept API. */
  periodId?: string | null;
  periodVersion?: number | null;
  gapAccepts?: StopToStopGapAccept[] | null;
  onGapAcceptsChange?: (accepts: StopToStopGapAccept[], version?: number) => void;
  onEditFill: (entryId: string) => void;
  onReviewAdjustments: (defaults: StopToStopAdjustmentDefaults) => void;
  onReviewTrips: (bucket: OdometerBucket) => void;
  onInspectTimeline: (bucket: OdometerBucket) => void;
  onRecheck: () => void;
  onReturnToFinalize?: () => void;
  /** Week-level S2S clear (closable + inventory). Required for Return to Lock week. */
  weekStopToStopClear?: boolean;
  /** Other vehicles still blocking Finalize (exclude current). */
  otherVehicleBlockingLabel?: string | null;
  rechecking?: boolean;
};

const DISPOSITIONS: Array<{ value: StopToStopGapAcceptDisposition; label: string }> = [
  { value: 'trips_overstated', label: 'Trip km overstated (platform)' },
  { value: 'gps_noise', label: 'GPS / mapping noise' },
  { value: 'known_variance', label: 'Known operational variance' },
  { value: 'other', label: 'Other' },
];

function findStartFillId(
  bucket: OdometerBucket,
  fuelEntries: FuelEntry[],
): string | undefined {
  const vid = bucket.vehicleId;
  const match = fuelEntries.find(
    (e) =>
      e.vehicleId === vid &&
      e.odometer != null &&
      Number(e.odometer) === Number(bucket.startOdometer) &&
      String(e.date || '').slice(0, 10) === String(bucket.startDate || '').slice(0, 10),
  );
  return match?.id;
}

function bucketPayload(b: OdometerBucket) {
  return {
    bucketId: b.id,
    vehicleId: b.vehicleId,
    startOdometer: b.startOdometer,
    endOdometer: b.endOdometer,
    startDate: b.startDate,
    endDate: b.endDate,
    kind: classifyStopToStopBucketRemediation(b).kind,
    chainAnomaly: Boolean(b.chainAnomaly),
    confidenceTier: b.confidenceTier,
    rideShareDistance: b.rideShareDistance,
    personalDistance: b.personalDistance,
    companyMiscDistance: b.companyMiscDistance,
    unaccountedDistance: b.unaccountedDistance,
  };
}

export function StopToStopRemediationSheet(props: StopToStopRemediationSheetProps) {
  const {
    open,
    onOpenChange,
    vehicleLabel,
    vehicleId,
    buckets,
    fuelEntries,
    periodLocked = false,
    focusBucketId,
    periodId,
    periodVersion,
    gapAccepts = [],
    onGapAcceptsChange,
    onEditFill,
    onReviewAdjustments,
    onReviewTrips,
    onInspectTimeline,
    onRecheck,
    onReturnToFinalize,
    weekStopToStopClear = false,
    otherVehicleBlockingLabel = null,
    rechecking = false,
  } = props;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptTargets, setAcceptTargets] = useState<OdometerBucket[]>([]);
  const [acceptNote, setAcceptNote] = useState('');
  const [acceptDisposition, setAcceptDisposition] =
    useState<StopToStopGapAcceptDisposition>('trips_overstated');
  const [acceptBusy, setAcceptBusy] = useState(false);

  const vehicleBuckets = useMemo(
    () => buckets.filter((b) => b.vehicleId === vehicleId),
    [buckets, vehicleId],
  );

  const ordered = useMemo(
    () => sortBucketsForRemediation(vehicleBuckets),
    [vehicleBuckets],
  );

  const broken = useMemo(
    () =>
      ordered.filter((b) => classifyStopToStopBucketRemediation(b).kind !== 'ok'),
    [ordered],
  );

  const acceptedCount = useMemo(
    () => broken.filter((b) => Boolean(findStopToStopGapAccept(gapAccepts, b))).length,
    [broken, gapAccepts],
  );

  const unacceptedBroken = useMemo(
    () =>
      broken.filter((b) => {
        const kind = classifyStopToStopBucketRemediation(b).kind;
        if (kind === 'chain') return true;
        return !findStopToStopGapAccept(gapAccepts, b);
      }),
    [broken, gapAccepts],
  );

  const acceptableUnaccepted = useMemo(
    () =>
      broken.filter(
        (b) => isStopToStopGapAcceptable(b) && !findStopToStopGapAccept(gapAccepts, b),
      ),
    [broken, gapAccepts],
  );

  const summary = useMemo(
    () =>
      summarizeStopToStopRemediation(vehicleBuckets, vehicleLabel, {
        isAccepted: (b) => Boolean(findStopToStopGapAccept(gapAccepts, b)),
      }),
    [vehicleBuckets, vehicleLabel, gapAccepts],
  );

  // Clear selection when vehicle / sheet closes
  useEffect(() => {
    if (!open) setSelectedIds(new Set());
  }, [open, vehicleId]);

  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !focusBucketId) return;
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, focusBucketId, broken.length]);

  const openAcceptDialog = (targets: OdometerBucket[]) => {
    if (!targets.length) return;
    setAcceptTargets(targets);
    setAcceptNote('');
    setAcceptDisposition('trips_overstated');
    setAcceptDialogOpen(true);
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllAcceptable = () => {
    setSelectedIds(new Set(acceptableUnaccepted.map((b) => b.id)));
  };

  const selectedBuckets = useMemo(
    () => acceptableUnaccepted.filter((b) => selectedIds.has(b.id)),
    [acceptableUnaccepted, selectedIds],
  );

  const submitAccept = async () => {
    const note = acceptNote.trim();
    if (note.length < 8) {
      toast.error('Add a note (at least 8 characters).');
      return;
    }
    if (!periodId) {
      toast.error('Period is not loaded yet — try Refresh data.');
      return;
    }
    if (acceptTargets.some((b) => !isStopToStopGapAcceptable(b))) {
      toast.error('Chain / indeterminate windows cannot be accepted — fix the odometer.');
      return;
    }
    setAcceptBusy(true);
    try {
      const res = (await api.acceptFuelPeriodStopToStopGaps({
        periodId,
        accepts: acceptTargets.map(bucketPayload),
        note,
        disposition: acceptDisposition,
        version: periodVersion ?? undefined,
      })) as {
        stopToStopGapAccepts?: StopToStopGapAccept[];
        version?: number;
      };
      const next = Array.isArray(res.stopToStopGapAccepts) ? res.stopToStopGapAccepts : [];
      onGapAcceptsChange?.(next, res.version);
      setSelectedIds(new Set());
      setAcceptDialogOpen(false);
      const remainingHere = broken.filter(
        (b) => isStopToStopGapAcceptable(b) && !findStopToStopGapAccept(next, b),
      );
      // Soft refresh reports in background — accepts alone clear the finalize gate.
      onRecheck();
      if (remainingHere.length === 0 && !otherVehicleBlockingLabel && onReturnToFinalize) {
        toast.success('OVER-LOG accepted — returning to Lock week.');
        onReturnToFinalize();
      } else if (remainingHere.length === 0 && otherVehicleBlockingLabel) {
        toast.success(
          `Accepted here. Still blocked on ${otherVehicleBlockingLabel} — switch vehicle.`,
        );
      } else {
        toast.success(
          acceptTargets.length === 1
            ? 'Gap accepted.'
            : `${acceptTargets.length} gaps accepted.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Accept failed';
      if (msg.includes('chain_cannot_accept')) {
        toast.error('Cannot accept — fix the odometer on chain windows.');
      } else if (msg.includes('note_too_short')) {
        toast.error('Add a note (at least 8 characters).');
      } else {
        toast.error(msg || 'Accept failed');
      }
    } finally {
      setAcceptBusy(false);
    }
  };

  const canAccept = Boolean(periodId) && !periodLocked;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-slate-200 px-4 py-3 text-left">
            <SheetTitle>Fix stop-to-stop — {vehicleLabel}</SheetTitle>
            <SheetDescription>
              {summary}
              {broken.length > 0 ? (
                <span className="mt-1 block text-slate-600">
                  {acceptedCount} of {broken.length} window
                  {broken.length === 1 ? '' : 's'} accepted
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>

          {canAccept && acceptableUnaccepted.length > 0 ? (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9"
                onClick={selectAllAcceptable}
              >
                Select all acceptable
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                disabled={selectedBuckets.length === 0}
                onClick={() => openAcceptDialog(selectedBuckets)}
              >
                Accept selected ({selectedBuckets.length})
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {broken.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                All fill windows on this vehicle close. Return to Lock week to finalize.
              </div>
            ) : unacceptedBroken.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                {weekStopToStopClear
                  ? 'All fill windows for this week are clear. Return to Lock week to finalize.'
                  : otherVehicleBlockingLabel
                    ? `This vehicle’s OVER-LOG windows are accepted. Still blocked on ${otherVehicleBlockingLabel} — switch vehicle.`
                    : 'This vehicle’s listed windows are clear. Return to Lock week when the rest of the week is clear.'}
              </div>
            ) : null}

            {broken.map((bucket) => {
              const rem = classifyStopToStopBucketRemediation(bucket);
              const isFocus = focusBucketId === bucket.id;
              const startId = findStartFillId(bucket, fuelEntries);
              const endId = bucket.closingEntryId;
              const accepted = findStopToStopGapAccept(gapAccepts, bucket);
              const acceptable = isStopToStopGapAcceptable(bucket);
              const isChain = rem.kind === 'chain';

              return (
                <div
                  key={bucket.id}
                  ref={isFocus ? focusRef : undefined}
                  className={`rounded-md border px-3 py-3 text-sm ${
                    isFocus
                      ? 'border-indigo-300 bg-indigo-50/60'
                      : accepted
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {canAccept && !accepted ? (
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(bucket.id)}
                        disabled={isChain || !acceptable}
                        title={
                          isChain
                            ? 'Fix odometer — cannot accept'
                            : 'Select for bulk accept'
                        }
                        onCheckedChange={(v) => {
                          if (isChain || !acceptable) return;
                          toggleSelect(bucket.id, v === true);
                        }}
                        aria-label={
                          isChain
                            ? 'Cannot accept — fix odometer'
                            : `Select gap ${bucket.startOdometer} to ${bucket.endOdometer}`
                        }
                      />
                    ) : (
                      <span className="mt-1 inline-block size-4 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {bucket.startOdometer.toLocaleString()} →{' '}
                        {bucket.endOdometer.toLocaleString()} km
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {bucket.startDate} → {bucket.endDate}
                        </span>
                        {accepted ? (
                          <span className="ml-2 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Accepted
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-slate-700">{rem.reason}</p>
                      {accepted?.note ? (
                        <p className="mt-1 text-xs text-emerald-800">
                          Note: {accepted.note.length > 80
                            ? `${accepted.note.slice(0, 80)}…`
                            : accepted.note}
                        </p>
                      ) : null}

                      {!periodLocked ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {rem.suggestedActions.includes('fix_odo') ? (
                            <>
                              {endId ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="min-h-11 gap-1"
                                  onClick={() => onEditFill(endId)}
                                >
                                  <Gauge className="h-3.5 w-3.5" />
                                  Fix end odometer
                                </Button>
                              ) : null}
                              {startId ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="min-h-11 gap-1"
                                  onClick={() => onEditFill(startId)}
                                >
                                  <Gauge className="h-3.5 w-3.5" />
                                  Fix start odometer
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {rem.suggestedActions.includes('review_trips') ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11 gap-1"
                              onClick={() => onReviewTrips(bucket)}
                            >
                              <Route className="h-3.5 w-3.5" />
                              Review trips
                            </Button>
                          ) : null}
                          {rem.suggestedActions.includes('review_adjustments') ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11 gap-1"
                              onClick={() =>
                                onReviewAdjustments({
                                  vehicleId,
                                  dateFrom: bucket.startDate,
                                  dateTo: bucket.endDate,
                                  date: bucket.startDate
                                    ? new Date(`${bucket.startDate}T12:00:00`)
                                    : undefined,
                                })
                              }
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              Review adjustments
                            </Button>
                          ) : null}
                          {rem.suggestedActions.includes('inspect_timeline') ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="min-h-11 gap-1"
                              onClick={() => onInspectTimeline(bucket)}
                            >
                              <ScanLine className="h-3.5 w-3.5" />
                              Inspect timeline
                            </Button>
                          ) : null}
                          {canAccept && acceptable && !accepted ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => openAcceptDialog([bucket])}
                            >
                              Accept this gap
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">Week is locked — view only.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <SheetFooter className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-slate-600">
              {weekStopToStopClear || (unacceptedBroken.length === 0 && !otherVehicleBlockingLabel)
                ? 'Stop-to-stop clear for this week — return to Lock week.'
                : unacceptedBroken.length === 0
                  ? otherVehicleBlockingLabel
                    ? `Still blocked on ${otherVehicleBlockingLabel}`
                    : 'Return to Lock week when ready'
                  : `${unacceptedBroken.length} window${
                      unacceptedBroken.length === 1 ? '' : 's'
                    } still blocking on this vehicle`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 gap-1 text-slate-600"
                onClick={onRecheck}
                disabled={rechecking}
                title="Optional — refresh trip/odometer data"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rechecking ? 'animate-spin' : ''}`} />
                Refresh data
              </Button>
              {(weekStopToStopClear ||
                (unacceptedBroken.length === 0 && !otherVehicleBlockingLabel)) &&
              onReturnToFinalize ? (
                <Button type="button" className="min-h-11" onClick={onReturnToFinalize}>
                  Return to Lock week
                </Button>
              ) : null}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Accept {acceptTargets.length === 1 ? 'this gap' : `${acceptTargets.length} gaps`}
            </DialogTitle>
            <DialogDescription>
              Clears the Finalize mileage gate for these windows. Does not post a driver charge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="s2s-gap-disposition">Reason</Label>
              <select
                id="s2s-gap-disposition"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={acceptDisposition}
                onChange={(e) =>
                  setAcceptDisposition(e.target.value as StopToStopGapAcceptDisposition)
                }
              >
                {DISPOSITIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s2s-gap-note">Note (required)</Label>
              <Textarea
                id="s2s-gap-note"
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                placeholder="Why this gap is accepted without fixing trips…"
                className="min-h-[88px]"
              />
              <p className="text-xs text-slate-500">At least 8 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAcceptDialogOpen(false)}
              disabled={acceptBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitAccept()}
              disabled={acceptBusy || acceptNote.trim().length < 8}
            >
              {acceptBusy ? 'Saving…' : 'Confirm accept'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
