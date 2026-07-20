/**
 * Shared Finalize engine for single-week and bulk Consumption Reconciliation.
 * Settlement stays client-side; snapshot POST remains one week at a time.
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
  /** Trips for the week being finalized (attribution). */
  trips: Trip[];
};

export type FuelFinalizeOptions = {
  /** Fresh prior snapshots — when omitted, fetched once. */
  priorReports?: FinalizedFuelReport[];
  /** Skip React Query invalidation + caller reload (bulk end handles once). */
  skipCacheInvalidation?: boolean;
  onProgress?: (message: string) => void;
};

export type FuelFinalizeWeekResult = {
  ok: boolean;
  successCount: number;
  snapshotCount: number;
  message?: string;
};

export async function finalizeFuelWeekReports(
  reports: WeeklyFuelReport[],
  deps: FuelFinalizeDeps,
  opts: FuelFinalizeOptions = {},
): Promise<FuelFinalizeWeekResult> {
  if (!reports.length) {
    return { ok: true, successCount: 0, snapshotCount: 0, message: 'No statements in week' };
  }

  opts.onProgress?.('Loading prior finalized snapshots…');
  const priorReports: FinalizedFuelReport[] =
    opts.priorReports ?? ((await api.getFinalizedReports().catch(() => [])) as FinalizedFuelReport[]);

  const findPrior = (driverId: string, weekStartYmd: string) =>
    priorReports.find((r: any) => r.driverId === driverId && reportWeekYmdBounds(r).start === weekStartYmd);

  let successCount = 0;
  const snapshots: FinalizedFuelReport[] = [];
  const { vehicles, drivers, fuelCards, fuelEntries, scenarios, trips } = deps;
  const attrCtx = { vehicles, fuelCards, trips };

  // Hoist settlement dependency fetches once for all drivers in this week.
  const settlementDeps = await settlementService.loadSettlementDeps().catch(() => null);

  for (const report of reports) {
    const { start: rStart } = reportWeekYmdBounds(report);
    const prior = findPrior(report.driverId, rStart);

    if (prior) {
      opts.onProgress?.(`Reversing prior settlement for ${report.driverId}…`);
      await settlementService.reverseEnterpriseFuelSyncForReport(report);
    }

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
      continue;
    }

    const ratio = FuelCalculationService.getBlendedDriverShareRatio(report);
    const newlyPostedDriverShare = relevantEntries.reduce((sum, e) => sum + e.amount * ratio, 0);
    const newlyPostedCompanyShare = relevantEntries.reduce(
      (sum, e) => sum + (e.amount - e.amount * ratio),
      0,
    );

    if (relevantEntries.length > 0) {
      opts.onProgress?.(`Posting ${relevantEntries.length} fill(s)…`);
      await settlementService.commitWeeklyStatement(report, relevantEntries, settlementDeps || undefined);
      successCount++;
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

    snapshots.push({
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
    });
  }

  if (snapshots.length === 0) {
    return { ok: true, successCount: 0, snapshotCount: 0, message: 'Nothing to finalize' };
  }

  opts.onProgress?.('Saving finalized snapshots…');
  await api.saveFinalizedReports(snapshots);

  // Personal Allowance bonus — non-fatal
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

  return { ok: true, successCount, snapshotCount: snapshots.length };
}
