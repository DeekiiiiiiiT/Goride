/**
 * Bulk reopen finalized fuel weeks — thin wrapper over BulkWeekActionDialog.
 * Calls resetFuelPeriod per week; falls back to per-snapshot delete.
 */
import { RotateCcw } from 'lucide-react';
import { api } from '../../../services/api';
import {
  FUEL_BULK_RESET_MAX_WEEKS,
  fuelBulkResetConfirmPhrase,
  formatFuelBulkResetProgress,
  fuelWeekLabelFromYmd,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import { reportWeekYmdBounds } from '../../../utils/fuelWeekPeriod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../../hooks/useDriverFinancialPeriods';
import { BulkWeekActionDialog, type BulkWeekActionResult } from './BulkWeekActionDialog';

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export type FinalizedWeekOption = {
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

async function resetOneWeek(week: FinalizedWeekOption): Promise<void> {
  const weekKey = String(week.weekStart).split('T')[0];
  try {
    await api.resetFuelPeriod(weekKey);
    return;
  } catch {
    const ids = week.driverIds.length > 0 ? week.driverIds : [];
    if (ids.length === 0) throw new Error('No snapshots to reopen for this week');
    for (const id of ids) {
      try {
        await api.deleteFinalizedReport(weekKey, id);
      } catch (e: any) {
        if (!/404|not found/i.test(String(e?.message || ''))) throw e;
      }
    }
  }
}

type ResetItem = FinalizedWeekOption & { id: string };

export function FuelBulkResetDialog({
  open,
  onOpenChange,
  weeks,
  onComplete,
}: FuelBulkResetDialogProps) {
  const queryClient = useQueryClient();
  const items: ResetItem[] = weeks.map((w) => ({ ...w, id: w.weekStart }));

  return (
    <BulkWeekActionDialog
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      title="Reopen weeks"
      description={`Reopen selected weeks: remove finalized snapshots and unwind wallet/fuel posts for those periods. Max ${FUEL_BULK_RESET_MAX_WEEKS} weeks per run.`}
      confirmPhrase={fuelBulkResetConfirmPhrase}
      maxItems={FUEL_BULK_RESET_MAX_WEEKS}
      emptyLabel="No finalized weeks to reopen."
      executeLabel={(n) => `Reopen ${n || ''} week${n === 1 ? '' : 's'}`}
      executingLabel="Reopening…"
      busyMessage="Bulk reopening weeks…"
      destructive
      icon={<RotateCcw className="h-5 w-5 text-rose-600" />}
      renderItemMeta={(w) =>
        `${w.vehicleCount} vehicle${w.vehicleCount === 1 ? '' : 's'} · Spend ${formatMoney(w.totalSpend)} · ${w.snapshotCount} snapshot${w.snapshotCount === 1 ? '' : 's'}`
      }
      renderSelectionHint={(selected) => (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 space-y-1">
          <p>
            <span className="font-semibold">{selected.length}</span> week
            {selected.length === 1 ? '' : 's'} will be reopened. This cannot be undone from
            here — re-finalize after you fix data.
          </p>
          <p>Failed weeks do not undo weeks that already succeeded.</p>
        </div>
      )}
      execute={async (selected, onProgress) => {
        const toReset = [...selected].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
        const weekResults: BulkWeekActionResult[] = [];
        for (let i = 0; i < toReset.length; i++) {
          const week = toReset[i];
          onProgress(formatFuelBulkResetProgress(i + 1, toReset.length, week.label));
          try {
            await resetOneWeek(week);
            weekResults.push({
              id: week.weekStart,
              label: week.label,
              status: 'ok',
              message: `${week.snapshotCount} snapshot(s) cleared`,
            });
          } catch (e: any) {
            console.error('[FuelBulkReset] week failed', week.weekStart, e);
            weekResults.push({
              id: week.weekStart,
              label: week.label,
              status: 'failed',
              message: e?.message || 'Failed',
            });
          }
        }

        void queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
        void queryClient.invalidateQueries({ queryKey: ['finalizedReports'] });

        const ok = weekResults.filter((r) => r.status === 'ok').length;
        const failed = weekResults.filter((r) => r.status === 'failed').length;
        if (failed === 0) {
          toast.success(`Bulk reopen done — ${ok} week(s) reopened.`);
        } else {
          toast.warning(`Bulk reopen finished with issues — ${ok} ok, ${failed} failed.`);
        }

        onComplete();
        return weekResults;
      }}
    />
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
