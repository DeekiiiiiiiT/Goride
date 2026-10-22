import { Flag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import {
  FUEL_BULK_FINALIZE_MAX_WEEKS,
  fuelBulkConfirmPhrase,
  formatFuelBulkProgress,
} from '../../../utils/fuelBulkWeekCopy';
import {
  buildFuelStepCounts,
  type FuelReconciliationPeriod,
} from '../../../utils/fuelPeriodStatus';
import { fuelActionableTotal } from '../../../utils/fuelPeriodGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FinalizedFuelReport, WeeklyFuelReport } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';
import { toast } from 'sonner';
import { BulkWeekActionDialog, type BulkWeekActionResult } from './BulkWeekActionDialog';
import { useFuelSettlementReopenGate } from './useFuelSettlementReopenGate';
import { useFuelForceClientMoneyDialog } from './useFuelForceClientMoneyDialog';
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
  dispositionMapFromRows,
  emptyFuelFlagDispositionMap,
  type FuelFlagDispositionMap,
} from '../../../utils/fuelFlagDisposition';
import {
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelSecondApproverThreshold,
} from '../../../utils/fuelDualApproval';
import { FUEL_PERIODS_KEY } from '../../../hooks/useFuelPeriods';
type PreparedWeek = {
  period: FuelReconciliationPeriod;
  label: string;
  reports: WeeklyFuelReport[];
  periodRowId: string;
  periodVersion: number;
  snapshotVersion: number;
  totalSpend: number;
};

/** Operator copy when dispositions cannot be trusted (R4-2 / R4-3). */
export const FUEL_BULK_DISPOSITIONS_LOAD_SKIP =
  'Could not load flag dispositions for this week — retry.';

export type LoadWeekFlagDispositionsResult =
  | { ok: true; map: FuelFlagDispositionMap }
  | { ok: false; reason: 'load_failed' | 'truncated' };

/** Fail closed without calling an empty map "no dispositions" (R4-2 / R4-3). */
export async function loadWeekFlagDispositions(
  entryIds: string[],
  listFn: (opts: { entryIds: string[] }) => Promise<{
    dispositions: Array<{ entryId: string; flagCode: string; action: string }>;
    truncated: boolean;
  }> = (opts) => api.listFuelFlagDispositions(opts),
): Promise<LoadWeekFlagDispositionsResult> {
  if (entryIds.length === 0) {
    return { ok: true, map: emptyFuelFlagDispositionMap() };
  }
  try {
    const res = await listFn({ entryIds });
    if (res.truncated) {
      return { ok: false, reason: 'truncated' };
    }
    return { ok: true, map: dispositionMapFromRows(res.dispositions) };
  } catch {
    return { ok: false, reason: 'load_failed' };
  }
}

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
  transactions?: import('../../../types/data').FinancialTransaction[];
  onComplete: () => void;
};

/**
 * Execute-loop fields from the prepared period (N-2: must use `period` from the
 * item — `periodForGate` is prepare-loop scoped only).
 */
export function bulkFinalizeExecuteGateFields(period: FuelReconciliationPeriod): {
  periodCounts: FuelReconciliationPeriod['counts'];
  leakageReviewed: boolean;
  odometerChainReviewed: boolean;
  unattributedReviewed: boolean;
  stopToStopGapAccepts: FuelReconciliationPeriod['stopToStopGapAccepts'];
} {
  return {
    periodCounts: period.counts,
    leakageReviewed: period.leakageReviewed ?? false,
    odometerChainReviewed: period.odometerChainReviewed ?? false,
    unattributedReviewed: period.unattributedReviewed ?? false,
    stopToStopGapAccepts: period.stopToStopGapAccepts,
  };
}

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
    return `Blocked — ${counts['data-quality'].actionable} flagged vehicle(s) still need review`;
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
  transactions = [],
  onComplete,
}: FuelBulkFinalizeDialogProps) {
  const queryClient = useQueryClient();
  const { confirmIfNeeded: confirmSettlementReopen, dialog: settlementReopenDialog } =
    useFuelSettlementReopenGate();
  const { confirmIfMismatch: confirmForceClientMoney, dialog: forceClientMoneyDialog } =
    useFuelForceClientMoneyDialog();
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
          <p>
            High-spend weeks need a distinct second approver on file for that period version
            (or org <code className="text-[11px]">service_only</code> dual-approval mode).
            Client self-approve flags are ignored.
          </p>
          <p>Failed weeks do not undo weeks that already succeeded.</p>
        </div>
      )}
      execute={async (weeks, onProgress) => {
        const sorted = [...weeks].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const weekResults: BulkWeekActionResult[] = [];
        const prepared: PreparedWeek[] = [];

        for (let i = 0; i < sorted.length; i++) {
          const period = sorted[i];
          const label = period.label || period.startDate;
          onProgress(`${formatFuelBulkProgress(i + 1, sorted.length, label)} Preparing…`);

          try {
            let periodForGate = period;
            const leakageAmt = Number(period.netLeakage) || 0;
            const needsLeakageAccept =
              !period.leakageReviewed &&
              ((period.counts?.['leakage-gap']?.actionable || 0) > 0 ||
                Math.abs(leakageAmt) > FUEL_SPEND_EPS);
            const periodRow = await api.ensureFuelReconciliationPeriod({
              weekStart: period.startDate,
              weekEnd: period.endDate,
            });
            if (needsLeakageAccept) {
              onProgress(
                `${formatFuelBulkProgress(i + 1, sorted.length, label)} Accepting unexplained…`,
              );
              await api.reviewFuelPeriodLeakage({
                periodId: periodRow.id,
                disposition: 'accepted_variance',
                note: 'Accepted via bulk Finalize weeks (accepted_variance).',
              });
              periodForGate = { ...period, leakageReviewed: true };
            }

            let preparedWeek: { version?: number | null; totalSpend?: number | null; reports?: WeeklyFuelReport[] };
            try {
              preparedWeek = await api.getFuelWeekSnapshot(periodRow.id) ?? { version: null, reports: [] };
            } catch {
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: "We couldn't prepare this week's numbers. Nothing was locked.",
              });
              continue;
            }
            const snapshotVersion = Number(preparedWeek.version) || 0;
            if (!snapshotVersion) {
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: "This week's numbers are still updating. Nothing was locked.",
              });
              continue;
            }
            const closable = await api.getFuelPeriodClosable(periodRow.id);
            const blockers = Array.isArray(closable?.blockers) ? closable.blockers : [];
            if (blockers.length > 0) {
              weekResults.push({
                id: period.id,
                label,
                status: 'failed',
                message: blockers[0]?.message || 'This week cannot be locked.',
              });
              continue;
            }
            const reports = Array.isArray(preparedWeek.reports) ? preparedWeek.reports : [];
            if (!reports.length && (Number(preparedWeek.totalSpend) || 0) <= FUEL_SPEND_EPS && (Number(period.totalSpend) || 0) <= FUEL_SPEND_EPS) {
              weekResults.push({
                id: period.id,
                label,
                status: 'skipped',
                message: 'No driver statements with spend',
              });
              continue;
            }

            prepared.push({
              period: periodForGate,
              label,
              reports,
              periodRowId: periodRow.id,
              periodVersion: periodRow.version || 1,
              snapshotVersion,
              totalSpend: Number(preparedWeek.totalSpend) || period.totalSpend,
            });
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
          const { period, label } = item;
          onProgress(formatFuelBulkProgress(i + 1, prepared.length, label));

          try {
            const enqueueArgs = {
              periodId: item.periodRowId,
              version: item.periodVersion,
              idempotencyKey: fuelPeriodFinalizeIdempotencyKey(
                item.periodRowId,
                item.periodVersion,
              ),
              snapshots: [] as any[],
              totalSpend: item.totalSpend,
              secondApproverThreshold,
              snapshotVersion: item.snapshotVersion,
            };
              const jobRes = await api.enqueueFuelPeriodFinalize(enqueueArgs).catch(async (lockErr: any) => {
                if (lockErr?.code === 'SNAPSHOT_MISMATCH') {
                  const forceReason = await confirmForceClientMoney(
                    Array.isArray(lockErr.mismatches) ? lockErr.mismatches : [],
                  );
                  if (!forceReason) throw lockErr;
                  return api.enqueueFuelPeriodFinalize({ ...enqueueArgs, forceReason });
                }
                if (
                  lockErr?.code === 'period_locked' ||
                  lockErr?.code === 'version_conflict' ||
                  lockErr?.code === 'inputs_changed' ||
                  lockErr?.code === 'snapshot_stale'
                ) {
                  const fresh = await api.getFuelReconciliationPeriod(item.periodRowId).catch(() => null);
                  if (fresh && (fresh.status === 'locked' || fresh.lockedAt || fresh.locked_at)) {
                    return { state: 'succeeded', ok: true, alreadyLocked: true };
                  }
                  return {
                    state: 'failed',
                    ok: false,
                    error: 'This week changed. Showing the latest status.',
                    failures: [],
                  };
                }
                const fresh = await api.getFuelReconciliationPeriod(item.periodRowId).catch(() => null);
                if (fresh && (fresh.status === 'locked' || fresh.lockedAt || fresh.locked_at)) {
                  return { state: 'succeeded', ok: true, alreadyLocked: true };
                }
                throw lockErr;
              });
              let settled = jobRes;
              const jobId = String((jobRes as { jobId?: string })?.jobId || '');
              if (jobId && (jobRes as { state?: string }).state !== 'succeeded') {
                settled = await api.pollFuelPeriodJob(jobId);
              }
              const jobInterp = interpretFuelFinalizeJobResult(settled);
              if (jobInterp.incomplete) {
                const fresh = await api.getFuelReconciliationPeriod(item.periodRowId).catch(() => null);
                if (fresh && (fresh.status === 'locked' || fresh.lockedAt || fresh.locked_at)) {
                  weekResults.push({
                    id: period.id,
                    label,
                    status: 'ok',
                    message: 'Week locked',
                  });
                } else {
                  weekResults.push({
                    id: period.id,
                    label,
                    status: 'failed',
                    message: jobInterp.toastMessage || (jobRes as { error?: string }).error || 'Server finalize failed',
                  });
                }
              } else {
                weekResults.push({
                  id: period.id,
                  label,
                  status: 'ok',
                  message: 'Week locked',
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
        await queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });
        onComplete();
        return weekResults;
      }}
    />
    {settlementReopenDialog}
    {forceClientMoneyDialog}
    </>
  );
}
