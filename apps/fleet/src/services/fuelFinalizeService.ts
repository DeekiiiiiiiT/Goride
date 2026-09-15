/**
 * Shared Finalize engine for single-week and bulk Consumption Reconciliation.
 * When deferSnapshotPersist is set, the browser only builds snapshots — the period
 * job owns wallet settle + KV + ledger (C4).
 */
import { addDays, format, parseISO } from 'date-fns';
import { api } from './api';
import { settlementService } from './settlementService';
import { tierService } from './tierService';
import { resolveActiveFuelPolicyForDriverWeek } from '../utils/fuelPolicyVersion';
import { toSlimFuelCycles } from '../utils/slimFuelCycles';
import { isEntryInInclusiveYmdRange, reportWeekYmdBounds } from '../utils/fuelWeekPeriod';
import { freezeReportMoneyThroughAssembler, categoryCostsFromReport } from '../utils/fuelFinalizeWeekSnapAdapter';
import {
  sumPaidByDriverForReport,
  sumGasCardSpendForReport,
  entriesBelongingToDriverWeekReport,
} from '../utils/fuelPaidByDriver';
import {
  assertCategoryCostsTieSpend,
  coverageRuleIsResolved,
  listUnapprovedFuelTxInWindow,
  precomputeFuelFillDrivers,
} from '@roam/fuel-core';
import {
  evaluateFuelWeekClosableClient,
  fuelWeekClosableBlockerMessage,
} from '../utils/fuelWeekClosableGate';
import { evaluateFuelFinalizeGating } from '../utils/fuelFinalizeGating';
import type {
  FuelCard,
  FuelDispute,
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
  /** Optional — when provided, refuse if Pending fuel txs sit in any report week. */
  transactions?: import('../types/data').FinancialTransaction[];
  disputes?: FuelDispute[];
  /** Org period row — empty counts triggers counts_unevaluated gate. */
  periodCounts?: Record<string, { actionable?: number }>;
  leakageReviewed?: boolean;
  degradedInputs?: boolean;
  unexplained?: number;
  totalSpend?: number;
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

  const weekEntryPool = fuelEntries.filter((e) =>
    reports.some((r) => {
      const { start, end } = reportWeekYmdBounds(r);
      return isEntryInInclusiveYmdRange(e.date, start, end);
    }),
  );
  const fillDriverMap = precomputeFuelFillDrivers(weekEntryPool, vehicles, fuelCards, trips);
  const driverByEntryId = new Map<string, string>();
  for (const [entryId, resolution] of fillDriverMap) {
    driverByEntryId.set(entryId, resolution.driverId);
  }
  const attrCtx = { vehicles, fuelCards, trips, driverByEntryId };

  // Client-side refuse before any settlement mutation (server also enforces).
  // Callers that already hold txs in state must pass them (R3); undefined skips for unit tests.
  if (deps.transactions !== undefined) {
    for (const report of reports) {
      const { start, end } = reportWeekYmdBounds(report);
      const blockers = listUnapprovedFuelTxInWindow(deps.transactions, start, end);
      if (blockers.length) {
        return {
          ok: false,
          successCount: 0,
          snapshotCount: 0,
          failures: [
            {
              driverId: report.driverId,
              weekStart: start,
              phase: 'snapshot',
              error: `UNAPPROVED_FUEL_TX: ${blockers.length} Pending fuel receipt(s)`,
            },
          ],
          message: `UNAPPROVED_FUEL_TX: ${blockers.length} Pending fuel receipt(s) need Review Queue action`,
        };
      }
    }
  }

  const { start: weekStartYmd, end: weekEndYmd } = reportWeekYmdBounds(reports[0]);
  const gateResult = evaluateFuelFinalizeGating({
    reports,
    disputes: deps.disputes,
    fuelEntries,
    transactions: deps.transactions,
    weekStartYmd,
    weekEndYmd,
  });
  const openDisputesInWeek = (deps.disputes || []).some((d) => {
    if (d.status !== 'Open') return false;
    const dStart = String(d.weekStart || '').split('T')[0];
    return dStart === weekStartYmd;
  });
  const countsUnevaluated =
    deps.periodCounts !== undefined && Object.keys(deps.periodCounts).length === 0;
  const closableBlockers = evaluateFuelWeekClosableClient({
    gateResult,
    reports,
    scenarios,
    leakageReviewed: deps.leakageReviewed ?? false,
    countsUnevaluated,
    degradedInputs: deps.degradedInputs,
    openDisputesInWeek,
    totalSpend: deps.totalSpend,
    unexplained: deps.unexplained,
  });
  if (closableBlockers.length > 0) {
    const first = closableBlockers[0];
    return {
      ok: false,
      successCount: 0,
      snapshotCount: 0,
      failures: reports.map((r) => ({
        driverId: r.driverId,
        weekStart: weekStartYmd,
        phase: 'snapshot' as const,
        error: `${first.code}: ${first.message}`,
      })),
      message: fuelWeekClosableBlockerMessage(first),
    };
  }

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
        // H-9: emit an explicit no-op snapshot so seal still gets the override.
        snapshots.push({
          ...prior,
          metadata: {
            ...((prior as any).metadata || {}),
            noopUnchanged: true,
            skipReason: 'no_pending_entries',
          },
        } as any);
        continue;
      }

      const skipClientMoney = Boolean(opts.deferSnapshotPersist);

      if (!skipClientMoney && prior) {
        opts.onProgress?.(`Reversing prior settlement for ${report.driverId}…`);
        await settlementService.reverseEnterpriseFuelSyncForReport(report);
      }

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

      if (!coverageRuleIsResolved(appliedFuelRule || null)) {
        throw new Error('unresolved_coverage_rule');
      }

      // C-4: freeze against full-week entries so category costs and spend share one base.
      // Settle pool (Pending-only) is still used for wallet posting via settledEntries metadata.
      const weekEntriesForFreeze = weekEntries.length ? weekEntries : relevantEntries;
      const frozen = freezeReportMoneyThroughAssembler({
        report,
        settleEntries: weekEntriesForFreeze,
        fuelRule: appliedFuelRule || null,
        builtBy: 'fuel_finalize_client',
      });
      const cats = categoryCostsFromReport(report);
      if (
        !assertCategoryCostsTieSpend(
          frozen.totalGasCardCost || Number(report.totalGasCardCost) || 0,
          cats,
          frozen.miscellaneousCost,
        )
      ) {
        throw new Error('freeze_spend_tie_violation');
      }

      const snapshot: FinalizedFuelReport = {
        ...report,
        status: 'Finalized',
        finalizedAt: new Date().toISOString(),
        finalizedByUser: 'admin',
        driverSpend,
        gasCardSpend,
        driverShare: frozen.driverShare,
        companyShare: frozen.companyShare,
        miscellaneousCost: frozen.miscellaneousCost,
        totalGasCardCost: frozen.totalGasCardCost || report.totalGasCardCost,
        netPay: driverSpend - frozen.driverShare,
        vehiclePlate: vehicle?.licensePlate || 'Unknown',
        vehicleModel: (vehicle as any)?.model || '',
        driverName: driver?.name || 'Unknown',
        postedDriverShare: frozen.postedDriverShare,
        postedCompanyShare: frozen.postedCompanyShare,
        fuelCycles: toSlimFuelCycles(report.fuelCycles),
        // C-1: emit categoryCosts + fuelRule so FUEL_SERVER_ENGINE can compare.
        categoryCosts: cats,
        fuelRule: appliedFuelRule || null,
        personalAllowanceEarnedCost: frozen.personalAllowanceEarnedCost,
        metadata: {
          ...report.metadata,
          categoryCosts: cats,
          // N-15: Engine A stamp for server loader — same object as categoryCosts (not entry buckets).
          tripCategoryAgg: cats,
          personalAllowanceEarnedCost: frozen.personalAllowanceEarnedCost,
          fuelRule: appliedFuelRule || null,
          settledEntries: (relevantEntries.length ? relevantEntries : weekEntries).map((e) => ({
            id: e.id,
            amount: e.amount,
            date: String(e.date || '').split('T')[0],
            driverId: e.driverId || report.driverId,
            vehicleId: e.vehicleId || report.vehicleId,
          })),
          blendedRatio: frozen.blendedRatio,
          freezeBuiltBy: frozen.built.metadata.builtBy,
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
