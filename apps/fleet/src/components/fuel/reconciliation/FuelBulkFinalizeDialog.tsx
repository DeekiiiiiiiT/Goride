import { Flag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { fuelService } from '../../../services/fuelService';
import { finalizeFuelWeekReports } from '../../../services/fuelFinalizeService';
import {
  buildFuelWeekReportsWithGating,
  FUEL_BULK_FINALIZE_MAX_WEEKS,
  fuelBulkConfirmPhrase,
  formatFuelBulkProgress,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import {
  buildFuelStepCounts,
  type FuelReconciliationPeriod,
} from '../../../utils/fuelPeriodStatus';
import { fuelActionableTotal } from '../../../utils/fuelPeriodGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FinalizedFuelReport, WeeklyFuelReport } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { toast } from 'sonner';
import { BulkWeekActionDialog, type BulkWeekActionResult } from './BulkWeekActionDialog';
import { useFuelSettlementReopenGate } from './useFuelSettlementReopenGate';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { isYmdInFuelWeek } from '../../../utils/fuelWeekPeriod';
import { isFuelExceptionAcknowledged } from '../../../utils/fuelFinalizeGating';
import {
  buildFuelVehicleSnapshots,
  liveReportsToPrimaryClaimedSlices,
} from '../../../utils/fuelPeriodDerive';
import { fuelPeriodFinalizeIdempotencyKey } from '../../../utils/fuelPeriodIdempotency';
import { interpretFuelFinalizeJobResult } from '../../../utils/fuelFinalizeJobResult';
import {
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelSecondApproverThreshold,
} from '../../../utils/fuelDualApproval';
import { FUEL_PERIODS_KEY } from '../../../hooks/useFuelPeriods';
type PreparedWeek = {
  period: FuelReconciliationPeriod;
  label: string;
  reports: WeeklyFuelReport[];
  trips: Trip[];
  weekEntries: FuelEntry[];
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

/** H3: same early hard gates as the single-week wizard — checkbox cannot override. */
export function bulkEarlyGateFailure(
  period: FuelReconciliationPeriod,
  reports: WeeklyFuelReport[],
  fuelEntries: FuelEntry[],
  disputes: import('../../../types/fuel').FuelDispute[],
  vehicles: Vehicle[],
  scenarios: FuelScenario[],
  finalizedReports: FinalizedFuelReport[],
): string | null {
  const weekEntries = fuelEntries.filter((e) =>
    isYmdInFuelWeek(e.date, period.startDate, period.endDate),
  );
  const exceptionCount = weekEntries.filter(
    (e) => e.metadata?.signalTier === 'exception' && !isFuelExceptionAcknowledged(e),
  ).length;
  if (exceptionCount > 0) {
    return `Blocked — ${exceptionCount} exception fill(s) still need review`;
  }

  const { snapshots } = buildFuelVehicleSnapshots({
    vehicles,
    weekStartYmd: period.startDate,
    weekEndYmd: period.endDate,
    fuelEntries,
    disputes,
    finalizedReports,
    scenarios,
    liveSlices: liveReportsToPrimaryClaimedSlices(reports),
  });
  const vehicleSnaps = snapshots.filter(
    (v) => v.totalSpend > FUEL_SPEND_EPS || v.pendingCount > 0 || v.hasOpenDispute || v.isFinalized,
  );

  const counts = buildFuelStepCounts({
    vehicles: vehicleSnaps,
    // Must honor accepted unexplained — same as landing/wizard (was always blocking bulk).
    leakageReviewed: Boolean(period.leakageReviewed),
  });
  if (counts['adjustments-disputes'].actionable > 0) {
    return `Blocked — ${counts['adjustments-disputes'].actionable} open dispute(s)`;
  }
  if (counts['leakage-gap'].actionable > 0) {
    return `Blocked — unexplained fuel still needs review (${counts['leakage-gap'].actionable})`;
  }
  if (counts['data-quality'].actionable > 0) {
    return `Blocked — ${counts['data-quality'].actionable} data-quality item(s) still need review`;
  }
  const leftover = fuelActionableTotal(counts) - counts.finalize.actionable;
  if (leftover > 0) {
    return `Blocked — ${leftover} early step item(s) still open`;
  }
  return null;
}

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
  const outstanding = periods
    .filter((p) => !p.locked && (p.status === 'outstanding' || p.status === 'in_progress'))
    .slice()
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [secondApproverThreshold, setSecondApproverThreshold] = useState(
    FUEL_SECOND_APPROVER_THRESHOLD,
  );
  useEffect(() => {
    if (!open) return;
    void api
      .getPreferences()
      .then((prefs) => {
        setSecondApproverThreshold(
          resolveFuelSecondApproverThreshold((prefs as any)?.fuelSecondApproverThreshold),
        );
      })
      .catch(() => undefined);
  }, [open]);

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
      extraAckLabel="I reviewed data-quality, disputes, unexplained fuel, and re-finalize warnings. Accepting unexplained for selected weeks is included in this run. Hard-blocked weeks (exceptions, open disputes) will still be rejected."
      icon={<Flag className="h-5 w-5 text-indigo-600" />}
      renderItemMeta={(p) => {
        const actionable = p.counts?.finalize?.actionable ?? 0;
        return `${p.vehicleCount} vehicle${p.vehicleCount === 1 ? '' : 's'} · Spend ${formatFuelMoney(p.totalSpend)}${actionable > 0 ? ` · ${actionable} ready to lock` : ''}`;
      }}
      renderSelectionHint={(selected) => (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
          <p>
            <span className="font-semibold text-slate-800">{selected.length}</span> week
            {selected.length === 1 ? '' : 's'} selected — each week settles fills then saves
            snapshots before the next starts.
          </p>
          <p>
            Unexplained fuel still marked “to review” will be accepted when you confirm below
            (same as Mark reviewed in the week wizard).
          </p>
          <p>Failed weeks do not undo weeks that already succeeded.</p>
        </div>
      )}
      execute={async (weeks, onProgress) => {
        const sorted = [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const weekResults: BulkWeekActionResult[] = [];
        const prepared: PreparedWeek[] = [];
        onProgress('Loading prior finalized snapshots…');
        const from = sorted[0]?.startDate;
        const to = sorted[sorted.length - 1]?.startDate;
        const priorReports = (await api
          .getFinalizedReports(
            from && to ? { weekStartFrom: from, weekStartTo: to } : undefined,
          )
          .catch(() => [])) as FinalizedFuelReport[];

        for (let i = 0; i < sorted.length; i++) {
          const period = sorted[i];
          const label = period.label || period.startDate;
          onProgress(`${formatFuelBulkProgress(i + 1, sorted.length, label)} Preparing…`);

          try {
            // Landing money is SQL; in-memory logs only cover a recent window — fetch this week.
            onProgress(
              `${formatFuelBulkProgress(i + 1, sorted.length, label)} Loading fills…`,
            );
            const weekEntries = await fuelService.getAllFuelEntriesInRange({
              startDate: period.startDate,
              endDate: period.endDate,
            });

            const { reports, trips, gateResult } = await buildFuelWeekReportsWithGating({
              weekStartYmd: period.startDate,
              weekEndYmd: period.endDate,
              vehicles,
              drivers,
              fuelEntries: weekEntries,
              adjustments,
              scenarios,
              fuelCards,
              disputes,
              finalizedReports: priorReports.length ? priorReports : finalizedReports,
            });

            if (!reports.length) {
              const hasSpend = (Number(period.totalSpend) || 0) > FUEL_SPEND_EPS;
              weekResults.push({
                id: period.id,
                label,
                status: 'skipped',
                message: hasSpend
                  ? 'Could not build driver statements from fills for this week'
                  : 'No driver statements with spend',
              });
              continue;
            }

            // Accept unexplained only after we know the week can be built/finalized.
            // Negative misc (over-explained) gates as data-quality until leakageReviewed — same accept API.
            let periodForGate = period;
            const leakageAmt = Number(period.netLeakage) || 0;
            const needsLeakageAccept =
              !period.leakageReviewed &&
              ((period.counts?.['leakage-gap']?.actionable || 0) > 0 ||
                Math.abs(leakageAmt) > FUEL_SPEND_EPS);
            if (needsLeakageAccept) {
              onProgress(
                `${formatFuelBulkProgress(i + 1, sorted.length, label)} Accepting unexplained…`,
              );
              const periodRow = await api.ensureFuelReconciliationPeriod({
                weekStart: period.startDate,
                weekEnd: period.endDate,
              });
              await api.reviewFuelPeriodLeakage({
                periodId: periodRow.id,
                note: 'Accepted via bulk Finalize weeks',
              });
              periodForGate = { ...period, leakageReviewed: true };
            }

            if (gateResult.hasExceptionBlockers) {
              const first = gateResult.exceptionBlockers[0];
              const extra =
                gateResult.exceptionBlockers.length > 1
                  ? ` (+${gateResult.exceptionBlockers.length - 1} more)`
                  : '';
              const detail = first
                ? `${first.dateYmd} ${first.paymentLabel} ${formatFuelMoney(first.amount)} @ ${first.location}${extra}`
                : 'exception fills';
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: `Blocked — resolve exception fill(s): ${detail}`,
              });
              continue;
            }

            const earlyFail = bulkEarlyGateFailure(
              periodForGate,
              reports,
              weekEntries,
              disputes,
              vehicles,
              scenarios,
              priorReports.length ? priorReports : finalizedReports,
            );
            if (earlyFail) {
              weekResults.push({ id: period.id, label, status: 'failed', message: earlyFail });
              continue;
            }

            prepared.push({ period: periodForGate, label, reports, trips, weekEntries });
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

        for (let i = 0; i < prepared.length; i++) {
          const item = prepared[i];
          const { period, label, reports, trips, weekEntries } = item;
          onProgress(formatFuelBulkProgress(i + 1, prepared.length, label));

          try {
            const result = await finalizeFuelWeekReports(
              reports,
              { vehicles, drivers, fuelCards, fuelEntries: weekEntries, scenarios, trips },
              {
                priorReports,
                skipCacheInvalidation: true,
                deferSnapshotPersist: true,
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
              const weekStart = period.startDate;
              const weekEnd = period.endDate;
              const periodRow = await api.ensureFuelReconciliationPeriod({ weekStart, weekEnd });
              const totalSpend = (result.snapshots || []).reduce(
                (s, r) => s + (Number(r.totalGasCardCost) || 0),
                0,
              );
              const jobRes = await api.enqueueFuelPeriodFinalize({
                periodId: periodRow.id,
                version: periodRow.version || 1,
                idempotencyKey: fuelPeriodFinalizeIdempotencyKey(
                  periodRow.id,
                  periodRow.version || 1,
                ),
                snapshots: result.snapshots || [],
                totalSpend,
                secondApproverThreshold,
                allowServiceSecondApprove: true,
              }).catch(async (lockErr: any) => {
                // Worker may OOM after lock — treat already-locked as success.
                const fresh = await api.getFuelReconciliationPeriod(periodRow.id).catch(() => null);
                if (fresh && (fresh.status === 'locked' || fresh.lockedAt || fresh.locked_at)) {
                  return { state: 'succeeded', ok: true, alreadyLocked: true };
                }
                throw lockErr;
              });
              const jobInterp = interpretFuelFinalizeJobResult(jobRes);
              if (jobInterp.incomplete) {
                const fresh = await api.getFuelReconciliationPeriod(periodRow.id).catch(() => null);
                if (fresh && (fresh.status === 'locked' || fresh.lockedAt || fresh.locked_at)) {
                  weekResults.push({
                    id: period.id,
                    label,
                    status: 'ok',
                    message: `${result.successCount} posted · already locked`,
                  });
                } else {
                  weekResults.push({
                    id: period.id,
                    label,
                    status: 'failed',
                    message: jobInterp.toastMessage || jobRes.error || 'Server finalize failed',
                  });
                }
              } else {
                weekResults.push({
                  id: period.id,
                  label,
                  status: 'ok',
                  message: `${result.successCount} posted · ${result.snapshotCount} locked`,
                });
              }
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
        await queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });
        onComplete();
        return weekResults;
      }}
    />
    {settlementReopenDialog}
    </>
  );
}
