/**
 * Shared Finalize engine for single-week and bulk Consumption Reconciliation.
 * When deferSnapshotPersist is set, the browser only builds snapshots — the period
 * job owns wallet settle + KV + ledger (C4).
 */
import { addDays, format, parseISO } from 'date-fns';
import { api } from './api';
import { settlementService } from './settlementService';
import { FuelCalculationService } from './fuelCalculationService';
import { tierService } from './tierService';
import { resolveActiveFuelPolicyForDriverWeek } from '../utils/fuelPolicyVersion';
import { toSlimFuelCycles } from '../utils/slimFuelCycles';
import { reportWeekYmdBounds } from '../utils/fuelWeekPeriod';
import {
  sumPaidByDriverForReport,
  sumGasCardSpendForReport,
  entriesBelongingToDriverWeekReport,
} from '../utils/fuelPaidByDriver';
import type {
  FuelCard,
  FuelEntry,
  FuelScenario,
  FinalizedFuelReport,
  WeeklyFuelReport,
} from '../types/fuel';
import type { Trip } from '../types/data';
import type { Vehicle } from '../types/vehicle';

export type FuelFinalizeDeps = {
  vehicles: Vehicle[];
  drivers: Array<{ id: string; name?: string; driverId?: string }>;
  fuelCards: FuelCard[];
  fuelEntries: FuelEntry[];
  scenarios: FuelScenario[];
  trips: Trip[];
};

export type FuelFinalizeOptions = {
  priorReports?: FinalizedFuelReport[];
  skipCacheInvalidation?: boolean;
  onProgress?: (message: string) => void;
  /** Settle + build snapshots only; server period job posts wallet + KV + ledger (C4). */
  deferSnapshotPersist?: boolean;
};

export type FuelFinalizeFailure = {
  driverId: string;
  weekStart: string;
  phase: 'settlement' | 'snapshot' | 'reversal';
  error: string;
};

export type FuelFinalizeWeekResult = {
  ok: boolean;
  successCount: number;
  snapshotCount: number;
  message?: string;
  failures: FuelFinalizeFailure[];
  snapshots?: FinalizedFuelReport[];
};

function parseSaveResponse(res: { success?: boolean; saved?: number; failures?: string[] } | void) {
  const failures = Array.isArray((res as any)?.failures) ? ((res as any).failures as string[]) : [];
  const success = (res as any)?.success !== false && failures.length === 0;
  return { success, failures };
}

export async function finalizeFuelWeekReports(
  reports: WeeklyFuelReport[],
  deps: FuelFinalizeDeps,
  opts: FuelFinalizeOptions = {},
): Promise<FuelFinalizeWeekResult> {
  if (!reports.length) {
    return { ok: true, successCount: 0, snapshotCount: 0, failures: [], message: 'No statements in week' };
  }

  opts.onProgress?.('Loading prior finalized snapshots…');
  const priorReports: FinalizedFuelReport[] =
    opts.priorReports ?? ((await api.getFinalizedReports().catch(() => [])) as FinalizedFuelReport[]);

  const findPrior = (driverId: string, weekStartYmd: string) =>
    priorReports.find((r: any) => r.driverId === driverId && reportWeekYmdBounds(r).start === weekStartYmd);

  let successCount = 0;
  let snapshotCount = 0;
  const failures: FuelFinalizeFailure[] = [];
  const snapshots: FinalizedFuelReport[] = [];
  const { vehicles, drivers, fuelCards, fuelEntries, scenarios, trips } = deps;
  const attrCtx = { vehicles, fuelCards, trips };

  const settlementDeps = opts.deferSnapshotPersist
    ? null
    : await settlementService.loadSettlementDeps().catch(() => null);

  for (const report of reports) {
    const { start: rStart } = reportWeekYmdBounds(report);
    const prior = findPrior(report.driverId, rStart);
    let settlementCommitted = false;

    try {
      // C2: decide what will re-post BEFORE reversing — never reverse then continue empty
      const weekEntries = entriesBelongingToDriverWeekReport(fuelEntries, report, attrCtx);
      const relevantEntries = prior
        ? weekEntries
            .filter(
              (entry) =>
                entry.reconciliationStatus === 'Pending' ||
                entry.reconciliationStatus === 'Verified' ||
                entry.metadata?.finalizedByReport,
            )
            .map((e) => ({
              ...e,
              reconciliationStatus: 'Pending' as const,
            }))
        : weekEntries.filter((entry) => entry.reconciliationStatus === 'Pending');

      if (relevantEntries.length === 0 && prior) {
        // Prior locked week with nothing re-postable — leave settlement + snapshot untouched
        continue;
      }

      const skipClientMoney = Boolean(opts.deferSnapshotPersist);

      if (!skipClientMoney && prior) {
        opts.onProgress?.(`Reversing prior settlement for ${report.driverId}…`);
        await settlementService.reverseEnterpriseFuelSyncForReport(report);
      }

      const ratio = FuelCalculationService.getBlendedDriverShareRatio(report);
      const newlyPostedDriverShare = relevantEntries.reduce((sum, e) => sum + e.amount * ratio, 0);
      const newlyPostedCompanyShare = relevantEntries.reduce(
        (sum, e) => sum + (e.amount - e.amount * ratio),
        0,
      );

      if (relevantEntries.length > 0) {
        opts.onProgress?.(`Closing open tank cycles…`);
        if (report.vehicleId) {
          const weekEnd = format(parseISO(reportWeekYmdBounds(report).end), 'yyyy-MM-dd');
          await api.closeFuelWeekCycles(report.vehicleId, weekEnd).catch(() => undefined);
        }
        if (!skipClientMoney) {
          opts.onProgress?.(`Posting ${relevantEntries.length} fill(s)…`);
          await settlementService.commitWeeklyStatement(report, relevantEntries, settlementDeps || undefined);
          settlementCommitted = true;
          successCount++;
        } else {
          opts.onProgress?.(`Prepared ${relevantEntries.length} fill(s) for server settle…`);
          successCount++;
        }
      }
      const vehicle = vehicles.find((v: any) => v.id === report.vehicleId);
      const driver = drivers.find((d: any) => d.id === report.driverId || d.driverId === report.driverId);
      const driverSpend = sumPaidByDriverForReport(fuelEntries, report, vehicles, attrCtx);
      const gasCardSpend = sumGasCardSpendForReport(fuelEntries, report, vehicles, attrCtx);

      const policy = resolveActiveFuelPolicyForDriverWeek(
        scenarios,
        report.driverId || driver?.id,
        rStart,
      );
      const activeScenario = policy?.scenario;
      const appliedFuelRule = activeScenario?.rules.find((r) => r.category === 'Fuel');
      const appliedVersion = policy?.version;

      const snapshot: FinalizedFuelReport = {
        ...report,
        status: 'Finalized',
        finalizedAt: new Date().toISOString(),
        finalizedByUser: 'admin',
        driverSpend,
        gasCardSpend,
        netPay: driverSpend - report.driverShare,
        vehiclePlate: vehicle?.licensePlate || 'Unknown',
        vehicleModel: (vehicle as any)?.model || '',
        driverName: driver?.name || 'Unknown',
        postedDriverShare: newlyPostedDriverShare,
        postedCompanyShare: newlyPostedCompanyShare,
        fuelCycles: toSlimFuelCycles(report.fuelCycles),
        metadata: {
          ...report.metadata,
          settledEntries: (relevantEntries.length ? relevantEntries : weekEntries).map((e) => ({
            id: e.id,
            amount: e.amount,
            date: String(e.date || '').split('T')[0],
            driverId: e.driverId || report.driverId,
            vehicleId: e.vehicleId || report.vehicleId,
          })),
          appliedScenario: activeScenario
            ? {
                id: activeScenario.id,
                name: activeScenario.name,
                fuelRule: appliedFuelRule,
                effectiveFrom: appliedVersion?.effectiveFrom,
                versionId: appliedVersion?.id,
              }
            : undefined,
        },
      };

      opts.onProgress?.(`Saving snapshot for ${report.driverId}…`);
      try {
        if (!opts.deferSnapshotPersist) {
          const saveRes = await api.saveFinalizedReports([snapshot]);
          const parsed = parseSaveResponse(saveRes);
          if (!parsed.success) {
            throw new Error(parsed.failures[0] || 'Snapshot save reported failure');
          }
        }
        snapshotCount++;
        snapshots.push(snapshot);
      } catch (snapErr: any) {
        if (settlementCommitted) {
          try {
            await settlementService.reverseEnterpriseFuelSyncForReport(report);
          } catch (revErr: any) {
            failures.push({
              driverId: report.driverId,
              weekStart: rStart,
              phase: 'reversal',
              error: revErr?.message || String(revErr),
            });
          }
        }
        failures.push({
          driverId: report.driverId,
          weekStart: rStart,
          phase: 'snapshot',
          error: snapErr?.message || String(snapErr),
        });
      }
    } catch (err: any) {
      if (settlementCommitted) {
        try {
          await settlementService.reverseEnterpriseFuelSyncForReport(report);
        } catch (revErr: any) {
          failures.push({
            driverId: report.driverId,
            weekStart: rStart,
            phase: 'reversal',
            error: revErr?.message || String(revErr),
          });
        }
      }
      failures.push({
        driverId: report.driverId,
        weekStart: rStart,
        phase: 'settlement',
        error: err?.message || String(err),
      });
    }
  }

  if (snapshotCount === 0 && failures.length === 0) {
    return { ok: true, successCount: 0, snapshotCount: 0, failures: [], message: 'Nothing to finalize' };
  }

  try {
    for (const snap of snapshots) {
      const pa = snap.metadata?.personalAllowance;
      const bonusKm = Number(pa?.configSnapshot?.nextWeekBonusKm) || 0;
      if (!pa?.hitTopBand || bonusKm <= 0 || !snap.driverId) continue;
      const nextWeek = addDays(parseISO(reportWeekYmdBounds(snap).start), 7);
      const nextYmd = format(nextWeek, 'yyyy-MM-dd');
      await tierService.setPersonalAllowanceBonusKm(snap.driverId, nextYmd, bonusKm);
    }
  } catch (bonusErr) {
    console.warn('[FuelFinalize] PA bonus write failed', bonusErr);
  }

  return {
    ok: failures.length === 0,
    successCount,
    snapshotCount,
    failures,
    snapshots,
    message: failures.length ? `${failures.length} driver-week(s) failed` : undefined,
  };
}
