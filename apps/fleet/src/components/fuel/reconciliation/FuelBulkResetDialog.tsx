/**
 * Bulk reset (delete) finalized fuel weeks — mirrors FuelBulkFinalizeDialog UX.
 * Calls resetFuelPeriod per week (full period wipe); falls back to per-snapshot delete.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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
import {
  FUEL_BULK_RESET_MAX_WEEKS,
  fuelBulkResetConfirmPhrase,
  formatFuelBulkResetProgress,
  fuelWeekLabelFromYmd,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import { reportWeekYmdBounds } from '../../../utils/fuelWeekPeriod';
import { toast } from 'sonner@2.0.3';
import { useLockedDialog } from '../../shared/useLockedDialog';
import { useFuelReconBusy } from './fuelReconBusyLock';
import { useQueryClient } from '@tanstack/react-query';
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../../hooks/useDriverFinancialPeriods';

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export type FinalizedWeekOption = {
  /** weekStart YYYY-MM-DD */
  weekStart: string;
  weekEnd: string;
  label: string;
  vehicleCount: number;
  totalSpend: number;
  snapshotCount: number;
  driverIds: string[];
};

export type FuelBulkResetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weeks: FinalizedWeekOption[];
  onComplete: () => void;
};

type WeekResult = {
  weekStart: string;
  label: string;
  status: 'ok' | 'failed';
  message?: string;
};

async function resetOneWeek(week: FinalizedWeekOption): Promise<void> {
  const weekKey = String(week.weekStart).split('T')[0];
  try {
    await api.resetFuelPeriod(weekKey);
    return;
  } catch {
    // Fallback when reset-period unavailable: wipe each driver/vehicle snapshot
    const ids = week.driverIds.length > 0 ? week.driverIds : [];
    if (ids.length === 0) throw new Error('No snapshots to delete for this week');
    for (const id of ids) {
      try {
        await api.deleteFinalizedReport(weekKey, id);
      } catch (e: any) {
        if (!/404|not found/i.test(String(e?.message || ''))) throw e;
      }
    }
  }
}

export function FuelBulkResetDialog({
  open,
  onOpenChange,
  weeks,
  onComplete,
}: FuelBulkResetDialogProps) {
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setConfirmText('');
    setProgressLabel('');
    setResults(null);
  }, [open]);

  const selected = useMemo(
    () => weeks.filter((w) => selectedIds.has(w.weekStart)),
    [weeks, selectedIds],
  );

  const overCap = selected.length > FUEL_BULK_RESET_MAX_WEEKS;
  const phrase = fuelBulkResetConfirmPhrase(selected.length);
  const confirmOk = selected.length > 0 && !overCap && confirmText.trim().toUpperCase() === phrase;

  const toggle = (weekStart: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(weekStart)) next.delete(weekStart);
      else next.add(weekStart);
      return next;
    });
  };

  const selectAll = () => {
    const capped = weeks.slice(0, FUEL_BULK_RESET_MAX_WEEKS);
    setSelectedIds(new Set(capped.map((w) => w.weekStart)));
  };

  const clearAll = () => setSelectedIds(new Set());

  const runBulk = async () => {
    if (!confirmOk || executing) return;

    const toReset = [...selected].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    setExecuting(true);
    setResults(null);

    const outcome = await runExclusive('Bulk resetting weeks…', async () => {
      const weekResults: WeekResult[] = [];

      for (let i = 0; i < toReset.length; i++) {
        const week = toReset[i];
        setProgressLabel(formatFuelBulkResetProgress(i + 1, toReset.length, week.label));
        setMessage(formatFuelBulkResetProgress(i + 1, toReset.length, week.label));

        try {
          await resetOneWeek(week);
          weekResults.push({
            weekStart: week.weekStart,
            label: week.label,
            status: 'ok',
            message: `${week.snapshotCount} snapshot(s) cleared`,
          });
        } catch (e: any) {
          console.error('[FuelBulkReset] week failed', week.weekStart, e);
          weekResults.push({
            weekStart: week.weekStart,
            label: week.label,
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

    void queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });

    if (failed === 0) {
      toast.success(`Bulk reset done — ${ok} week(s) reopened.`);
    } else {
      toast.warning(`Bulk reset finished with issues — ${ok} ok, ${failed} failed.`);
    }

    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-rose-600" />
            Delete finalized weeks
          </DialogTitle>
          <DialogDescription>
            Reopen selected weeks: remove finalized snapshots and unwind wallet/fuel posts for those
            periods. Max {FUEL_BULK_RESET_MAX_WEEKS} weeks per run.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-800">Results</p>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li
                  key={r.weekStart}
                  className="flex items-start justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{r.label}</span>
                  <span className={r.status === 'ok' ? 'text-emerald-700' : 'text-rose-700'}>
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
                Finalized weeks ({weeks.length})
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

            {weeks.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                No finalized weeks to delete.
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {weeks.map((w) => {
                  const checked = selectedIds.has(w.weekStart);
                  return (
                    <li key={w.weekStart}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                        <Checkbox
                          checked={checked}
                          disabled={executing}
                          onCheckedChange={() => toggle(w.weekStart)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">{w.label}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {w.vehicleCount} vehicle{w.vehicleCount === 1 ? '' : 's'} · Spend{' '}
                            {formatMoney(w.totalSpend)} · {w.snapshotCount} snapshot
                            {w.snapshotCount === 1 ? '' : 's'}
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
                Select at most {FUEL_BULK_RESET_MAX_WEEKS} weeks. Run again for the rest.
              </p>
            )}

            {selected.length > 0 && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
                <p>
                  <span className="font-semibold">{selected.length}</span> week
                  {selected.length === 1 ? '' : 's'} will be reopened. This cannot be undone from
                  here — re-finalize after you fix data.
                </p>
                <p>Failed weeks do not undo weeks that already succeeded.</p>
              </div>
            )}

            {executing && (
              <div className="flex items-center gap-2 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{progressLabel || 'Working…'}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fuel-bulk-reset-confirm" className="text-sm">
                Type <span className="font-mono font-semibold">{phrase}</span> to confirm
              </Label>
              <Input
                id="fuel-bulk-reset-confirm"
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
              <Button
                type="button"
                variant="destructive"
                disabled={!confirmOk || executing}
                onClick={runBulk}
              >
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting…
                  </>
                ) : (
                  `Delete ${selected.length || ''} week${selected.length === 1 ? '' : 's'}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Build dialog options from FinalizedReportsTab week groups. */
export function finalizedWeekOptionsFromGroups(
  groups: Array<{
    weekStart: string;
    weekEnd: string;
    vehicleCount: number;
    totalSpend: number;
    reports: Array<{ driverId?: string; vehicleId?: string }>;
  }>,
): FinalizedWeekOption[] {
  return groups.map((g) => {
    const { start, end } = reportWeekYmdBounds({
      weekStart: g.weekStart,
      weekEnd: g.weekEnd,
    });
    const driverIds = [
      ...new Set(
        g.reports
          .map((r) => r.driverId || r.vehicleId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    return {
      weekStart: start,
      weekEnd: end,
      label: fuelWeekLabelFromYmd(start, end),
      vehicleCount: g.vehicleCount,
      totalSpend: g.totalSpend,
      snapshotCount: g.reports.length,
      driverIds,
    };
  });
}
