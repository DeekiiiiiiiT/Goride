import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Flag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { api } from '../../../services/api';
import { finalizeFuelWeekReports } from '../../../services/fuelFinalizeService';
import {
  buildFuelWeekReportsForFinalize,
  FUEL_BULK_FINALIZE_MAX_WEEKS,
  fuelBulkConfirmPhrase,
  formatFuelBulkProgress,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FinalizedFuelReport } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';
import { toast } from 'sonner@2.0.3';
import { useLockedDialog } from '../../shared/useLockedDialog';
import { useFuelReconBusy } from './fuelReconBusyLock';

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export type FuelBulkFinalizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Outstanding periods only (completed weeks excluded by default). */
  periods: FuelReconciliationPeriod[];
  vehicles: Vehicle[];
  drivers: Array<{ id: string; name?: string; driverId?: string; fuelScenarioId?: string }>;
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  scenarios: FuelScenario[];
  fuelCards: FuelCard[];
  onComplete: () => void;
};

type WeekResult = {
  periodId: string;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  message?: string;
};

export function FuelBulkFinalizeDialog({
  open,
  onOpenChange,
  periods,
  vehicles,
  drivers,
  fuelEntries,
  adjustments,
  scenarios,
  fuelCards,
  onComplete,
}: FuelBulkFinalizeDialogProps) {
  const { runExclusive, setMessage, busy: fleetBusy } = useFuelReconBusy();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [results, setResults] = useState<WeekResult[] | null>(null);

  const lockBusy = executing || fleetBusy;
  const { onOpenChange: lockedOpenChange, contentProps: lockedContentProps } = useLockedDialog(
    open,
    onOpenChange,
    lockBusy,
  );

  const outstanding = useMemo(
    () => periods.filter((p) => p.status === 'outstanding' && !p.locked),
    [periods],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setConfirmText('');
    setProgressLabel('');
    setResults(null);
  }, [open]);

  const selected = useMemo(
    () => outstanding.filter((p) => selectedIds.has(p.id)),
    [outstanding, selectedIds],
  );

  const overCap = selected.length > FUEL_BULK_FINALIZE_MAX_WEEKS;
  const phrase = fuelBulkConfirmPhrase(selected.length);
  const confirmOk = selected.length > 0 && !overCap && confirmText.trim().toUpperCase() === phrase;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const capped = outstanding.slice(0, FUEL_BULK_FINALIZE_MAX_WEEKS);
    setSelectedIds(new Set(capped.map((p) => p.id)));
  };

  const clearAll = () => setSelectedIds(new Set());

  const runBulk = async () => {
    if (!confirmOk || executing) return;

    const weeks = [...selected].sort((a, b) => a.startDate.localeCompare(b.startDate));
    setExecuting(true);
    setResults(null);

    const outcome = await runExclusive('Bulk finalizing weeks…', async () => {
      const weekResults: WeekResult[] = [];
      setMessage('Loading prior finalized snapshots…');
      const priorReports = (await api.getFinalizedReports().catch(() => [])) as FinalizedFuelReport[];

      for (let i = 0; i < weeks.length; i++) {
        const period = weeks[i];
        const label = period.label || period.startDate;
        setProgressLabel(formatFuelBulkProgress(i + 1, weeks.length, label));
        setMessage(formatFuelBulkProgress(i + 1, weeks.length, label));

        try {
          const { reports, trips } = await buildFuelWeekReportsForFinalize({
            weekStartYmd: period.startDate,
            weekEndYmd: period.endDate,
            vehicles,
            drivers,
            fuelEntries,
            adjustments,
            scenarios,
            fuelCards,
          });

          if (!reports.length) {
            weekResults.push({
              periodId: period.id,
              label,
              status: 'skipped',
              message: 'No driver statements with spend',
            });
            continue;
          }

          const result = await finalizeFuelWeekReports(
            reports,
            {
              vehicles,
              drivers,
              fuelCards,
              fuelEntries,
              scenarios,
              trips,
            },
            {
              priorReports,
              skipCacheInvalidation: true,
              onProgress: (msg) => {
                setProgressLabel(`${formatFuelBulkProgress(i + 1, weeks.length, label)} ${msg}`);
                setMessage(`${formatFuelBulkProgress(i + 1, weeks.length, label)} ${msg}`);
              },
            },
          );

          if (result.snapshotCount === 0) {
            weekResults.push({
              periodId: period.id,
              label,
              status: 'skipped',
              message: result.message || 'Nothing to post',
            });
          } else {
            weekResults.push({
              periodId: period.id,
              label,
              status: 'ok',
              message: `${result.successCount} posted · ${result.snapshotCount} locked`,
            });
          }
        } catch (e: any) {
          console.error('[FuelBulkFinalize] week failed', period.id, e);
          weekResults.push({
            periodId: period.id,
            label,
            status: 'failed',
            message: e?.message || 'Failed',
          });
        }
      }

      return weekResults;
    });

    setExecuting(false);
    setProgressLabel('');

    if (outcome === undefined) {
      toast.message('Another action is still running — try again when it finishes.');
      return;
    }

    setResults(outcome);
    const ok = outcome.filter((r) => r.status === 'ok').length;
    const failed = outcome.filter((r) => r.status === 'failed').length;
    const skipped = outcome.filter((r) => r.status === 'skipped').length;

    if (failed === 0) {
      toast.success(`Bulk finalize done — ${ok} week(s) locked${skipped ? `, ${skipped} skipped` : ''}.`);
    } else {
      toast.warning(
        `Bulk finalize finished with issues — ${ok} ok, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}.`,
      );
    }

    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-indigo-600" />
            Finalize weeks
          </DialogTitle>
          <DialogDescription>
            Lock multiple outstanding weeks one at a time. Already-completed weeks stay out of this
            list. Max {FUEL_BULK_FINALIZE_MAX_WEEKS} weeks per run so the server stays responsive.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-800">Results</p>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li
                  key={r.periodId}
                  className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{r.label}</span>
                  <span
                    className={
                      r.status === 'ok'
                        ? 'text-emerald-700'
                        : r.status === 'failed'
                          ? 'text-rose-700'
                          : 'text-slate-500'
                    }
                  >
                    {r.status}
                    {r.message ? ` — ${r.message}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" onClick={() => lockedOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Outstanding weeks ({outstanding.length})
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={selectAll} disabled={executing}>
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={executing}>
                  Clear
                </Button>
              </div>
            </div>

            {outstanding.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                Nothing outstanding to finalize.
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {outstanding.map((p) => {
                  const checked = selectedIds.has(p.id);
                  const actionable = p.counts?.finalize?.actionable ?? 0;
                  return (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                        <Checkbox
                          checked={checked}
                          disabled={executing}
                          onCheckedChange={() => toggle(p.id)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{p.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {p.vehicleCount} vehicle{p.vehicleCount === 1 ? '' : 's'} · Spend{' '}
                            {formatMoney(p.totalSpend)}
                            {actionable > 0 ? ` · ${actionable} ready to lock` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {overCap && (
              <p className="text-xs text-amber-700">
                Select at most {FUEL_BULK_FINALIZE_MAX_WEEKS} weeks. Run again for the rest.
              </p>
            )}

            {selected.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
                <p>
                  <span className="font-semibold text-slate-800">{selected.length}</span> week
                  {selected.length === 1 ? '' : 's'} selected — each week settles fills then saves
                  snapshots before the next starts.
                </p>
                <p>Failed weeks do not undo weeks that already succeeded.</p>
              </div>
            )}

            {executing && (
              <div className="flex items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{progressLabel || 'Working…'}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fuel-bulk-finalize-confirm" className="text-sm">
                Type <span className="font-mono font-semibold">{phrase}</span> to confirm
              </Label>
              <Input
                id="fuel-bulk-finalize-confirm"
                value={confirmText}
                disabled={executing || selected.length === 0}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={phrase}
                autoComplete="off"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={executing} onClick={() => lockedOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!confirmOk || executing} onClick={runBulk}>
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finalizing…
                  </>
                ) : (
                  `Finalize ${selected.length || ''} week${selected.length === 1 ? '' : 's'}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
