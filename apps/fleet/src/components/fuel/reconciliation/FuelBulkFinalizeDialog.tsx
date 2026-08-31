import { Flag } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { finalizeFuelWeekReports } from '../../../services/fuelFinalizeService';
import {
  buildFuelWeekReportsWithGating,
  FUEL_BULK_FINALIZE_MAX_WEEKS,
  fuelBulkConfirmPhrase,
  formatFuelBulkProgress,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FinalizedFuelReport, WeeklyFuelReport } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { toast } from 'sonner';
import { BulkWeekActionDialog, type BulkWeekActionResult } from './BulkWeekActionDialog';
import { useFuelSettlementReopenGate } from './useFuelSettlementReopenGate';

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

type PreparedWeek = {
  period: FuelReconciliationPeriod;
  label: string;
  reports: WeeklyFuelReport[];
  trips: Trip[];
};

export type FuelBulkFinalizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: FuelReconciliationPeriod[];
  vehicles: Vehicle[];
  drivers: Array<{ id: string; name?: string; driverId?: string; fuelScenarioId?: string }>;
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  scenarios: FuelScenario[];
  fuelCards: FuelCard[];
  disputes?: import('../../../types/fuel').FuelDispute[];
  finalizedReports?: FinalizedFuelReport[];
  onComplete: () => void;
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
  disputes = [],
  finalizedReports = [],
  onComplete,
}: FuelBulkFinalizeDialogProps) {
  const queryClient = useQueryClient();
  const { confirmIfNeeded: confirmSettlementReopen, dialog: settlementReopenDialog } =
    useFuelSettlementReopenGate();
  const outstanding = periods.filter((p) => !p.locked && (p.status === 'outstanding' || p.status === 'in_progress'));

  return (
    <>
    <BulkWeekActionDialog
      open={open}
      onOpenChange={onOpenChange}
      items={outstanding}
      title="Finalize weeks"
      description={`Lock multiple outstanding weeks one at a time. Already-completed weeks stay out of this list. Max ${FUEL_BULK_FINALIZE_MAX_WEEKS} weeks per run so the server stays responsive.`}
      confirmPhrase={fuelBulkConfirmPhrase}
      maxItems={FUEL_BULK_FINALIZE_MAX_WEEKS}
      emptyLabel="Nothing outstanding to finalize."
      executeLabel={(n) => `Finalize ${n || ''} week${n === 1 ? '' : 's'}`}
      executingLabel="Finalizing…"
      busyMessage="Bulk finalizing weeks…"
      extraAck
      extraAckLabel="I reviewed data-quality, disputes, and re-finalize warnings. Exception-tier weeks will still be blocked."
      icon={<Flag className="h-5 w-5 text-indigo-600" />}
      renderItemMeta={(p) => {
        const actionable = p.counts?.finalize?.actionable ?? 0;
        return `${p.vehicleCount} vehicle${p.vehicleCount === 1 ? '' : 's'} · Spend ${formatMoney(p.totalSpend)}${actionable > 0 ? ` · ${actionable} ready to lock` : ''}`;
      }}
      renderSelectionHint={(selected) => (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
          <p>
            <span className="font-semibold text-slate-800">{selected.length}</span> week
            {selected.length === 1 ? '' : 's'} selected — each week settles fills then saves
            snapshots before the next starts.
          </p>
          <p>Failed weeks do not undo weeks that already succeeded.</p>
        </div>
      )}
      execute={async (weeks, onProgress) => {
        const sorted = [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const weekResults: BulkWeekActionResult[] = [];
        const prepared: PreparedWeek[] = [];
        onProgress('Loading prior finalized snapshots…');
        const priorReports = (await api.getFinalizedReports().catch(() => [])) as FinalizedFuelReport[];

        // Pass 1 — build + gate; collect reports for one settlement-reopen confirm.
        for (let i = 0; i < sorted.length; i++) {
          const period = sorted[i];
          const label = period.label || period.startDate;
          onProgress(`${formatFuelBulkProgress(i + 1, sorted.length, label)} Preparing…`);

          try {
            const { reports, trips, gateResult } = await buildFuelWeekReportsWithGating({
              weekStartYmd: period.startDate,
              weekEndYmd: period.endDate,
              vehicles,
              drivers,
              fuelEntries,
              adjustments,
              scenarios,
              fuelCards,
              disputes,
              finalizedReports: priorReports.length ? priorReports : finalizedReports,
            });

            if (!reports.length) {
              weekResults.push({ id: period.id, label, status: 'skipped', message: 'No driver statements with spend' });
              continue;
            }

            if (gateResult.hasExceptionBlockers) {
              const first = gateResult.exceptionBlockers[0];
              const extra =
                gateResult.exceptionBlockers.length > 1
                  ? ` (+${gateResult.exceptionBlockers.length - 1} more)`
                  : '';
              const detail = first
                ? `${first.dateYmd} ${first.paymentLabel} $${first.amount.toFixed(2)} @ ${first.location}${extra}`
                : 'exception fills';
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: `Blocked — resolve exception fill(s): ${detail}`,
              });
              continue;
            }

            prepared.push({ period, label, reports, trips });
          } catch (e: any) {
            console.error('[FuelBulkFinalize] prepare failed', period.id, e);
            weekResults.push({ id: period.id, label, status: 'failed', message: e?.message || 'Failed' });
          }
        }

        if (prepared.length > 0) {
          onProgress('Checking settlement impact on paid weeks…');
          const reopenOk = await confirmSettlementReopen(prepared.flatMap((p) => p.reports));
          if (!reopenOk) {
            toast.message('Bulk finalize cancelled — settlement left unchanged.');
            for (const item of prepared) {
              weekResults.push({
                id: item.period.id,
                label: item.label,
                status: 'skipped',
                message: 'Cancelled — settlement reopen not confirmed',
              });
            }
            return weekResults;
          }
        }

        // Pass 2 — finalize prepared weeks.
        for (let i = 0; i < prepared.length; i++) {
          const item = prepared[i];
          const { period, label, reports, trips } = item;
          onProgress(formatFuelBulkProgress(i + 1, prepared.length, label));

          try {
            const result = await finalizeFuelWeekReports(
              reports,
              { vehicles, drivers, fuelCards, fuelEntries, scenarios, trips },
              {
                priorReports,
                skipCacheInvalidation: true,
                onProgress: (msg) => onProgress(`${formatFuelBulkProgress(i + 1, prepared.length, label)} ${msg}`),
              },
            );

            if (result.snapshotCount === 0) {
              weekResults.push({
                id: period.id,
                label,
                status: 'skipped',
                message: result.message || 'Nothing to post',
              });
            } else if (!result.ok || result.failures?.length) {
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: result.failures?.[0]?.error || result.message || 'Partial failure',
              });
            } else {
              weekResults.push({
                id: period.id,
                label,
                status: 'ok',
                message: `${result.successCount} posted · ${result.snapshotCount} locked`,
              });
            }
          } catch (e: any) {
            console.error('[FuelBulkFinalize] week failed', period.id, e);
            weekResults.push({ id: period.id, label, status: 'failed', message: e?.message || 'Failed' });
          }
        }

        const ok = weekResults.filter((r) => r.status === 'ok').length;
        const failed = weekResults.filter((r) => r.status === 'failed').length;
        const skipped = weekResults.filter((r) => r.status === 'skipped').length;
        if (failed === 0) {
          toast.success(`Bulk finalize done — ${ok} week(s) locked${skipped ? `, ${skipped} skipped` : ''}.`);
        } else {
          toast.warning(
            `Bulk finalize finished with issues — ${ok} ok, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}.`,
          );
        }

        await queryClient.invalidateQueries({ queryKey: ['finalizedReports'] });
        await queryClient.invalidateQueries({ queryKey: ['driverFinancialPeriods'] });
        onComplete();
        return weekResults;
      }}
    />
    {settlementReopenDialog}
    </>
  );
}
