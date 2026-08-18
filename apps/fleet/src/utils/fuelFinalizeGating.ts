/**
 * Shared Finalize gating — single-week table, wizard, and bulk use the same checks.
 */
import { format } from 'date-fns';
import type {
  FuelDispute,
  FuelEntry,
  FinalizedFuelReport,
  WeeklyFuelReport,
} from '../types/fuel';
import { isSameFuelStatement, reportWeekYmdBounds, toEntryYmd } from './fuelWeekPeriod';
import { FUEL_MONEY_EPS } from './fuelMoneyEpsilon';

export type FuelReFinalizeWarning = {
  vehicleId: string;
  driverId: string;
  priorDriverShare: number;
  delta: number;
};

export type FuelDataQualityWarning = {
  vehicleId: string;
  driverId?: string;
  healthStatus?: string;
  pendingCount: number;
  openDispute: boolean;
  exceptionCount?: number;
};

export type FuelFinalizeGateResult = {
  reFinalizeWarnings: FuelReFinalizeWarning[];
  dataQualityWarnings: FuelDataQualityWarning[];
  hasExceptionBlockers: boolean;
  hasBlockingWarnings: boolean;
};

export function findDisputeForReport(
  disputes: FuelDispute[],
  report: WeeklyFuelReport,
): FuelDispute | undefined {
  const { start, end } = reportWeekYmdBounds(report);
  return disputes.find((d) => {
    const dStart = toEntryYmd(d.weekStart);
    if (report.driverId && d.driverId && d.driverId === report.driverId) {
      if (dStart !== start) return false;
      if (d.weekEnd) return toEntryYmd(d.weekEnd) === end;
      return true;
    }
    if (d.vehicleId !== report.vehicleId) return false;
    if (dStart !== start) return false;
    if (d.weekEnd) return toEntryYmd(d.weekEnd) === end;
    return true;
  });
}

export function evaluateFuelFinalizeGating(opts: {
  reports: WeeklyFuelReport[];
  disputes?: FuelDispute[];
  fuelEntries?: FuelEntry[];
  finalizedReports?: FinalizedFuelReport[];
  weekStartYmd?: string;
  weekEndYmd?: string;
}): FuelFinalizeGateResult {
  const disputes = opts.disputes || [];
  const fuelEntries = opts.fuelEntries || [];
  const finalizedReports = opts.finalizedReports || [];
  const startYmd =
    opts.weekStartYmd ||
    (opts.reports[0] ? reportWeekYmdBounds(opts.reports[0]).start : '');
  const endYmd =
    opts.weekEndYmd ||
    (opts.reports[0] ? reportWeekYmdBounds(opts.reports[0]).end : startYmd);

  const reFinalizeWarnings = opts.reports.reduce((acc, r) => {
    const prior = finalizedReports.find((f) => isSameFuelStatement(f, r));
    if (prior) {
      const priorDriverShare = prior.postedDriverShare ?? prior.driverShare ?? 0;
      const delta = r.driverShare - priorDriverShare;
      acc.push({
        vehicleId: r.vehicleId,
        driverId: r.driverId,
        priorDriverShare,
        delta,
      });
    }
    return acc;
  }, [] as FuelReFinalizeWarning[]);

  const exceptionEntries = fuelEntries.filter((e) => {
    const d = String(e.date || '').split('T')[0];
    if (startYmd && d < startYmd) return false;
    if (endYmd && d > endYmd) return false;
    return e.metadata?.signalTier === 'exception';
  });

  const dataQualityWarnings = opts.reports.reduce((acc, r) => {
    const openDispute = findDisputeForReport(disputes, r)?.status === 'Open';
    const isUnhealthy = r.healthStatus && r.healthStatus !== 'Emerald';
    const hasPending = (r.pendingCount || 0) > 0;
    const vehicleExceptions = exceptionEntries.filter((e) => e.vehicleId === r.vehicleId).length;
    if (openDispute || isUnhealthy || hasPending || vehicleExceptions > 0) {
      acc.push({
        vehicleId: r.vehicleId,
        driverId: r.driverId,
        healthStatus: r.healthStatus,
        pendingCount: r.pendingCount || 0,
        openDispute: !!openDispute,
        exceptionCount: vehicleExceptions,
      });
    }
    return acc;
  }, [] as FuelDataQualityWarning[]);

  const hasExceptionBlockers = dataQualityWarnings.some((w) => (w.exceptionCount || 0) > 0);
  const hasBlockingWarnings =
    dataQualityWarnings.length > 0 ||
    reFinalizeWarnings.some((w) => Math.abs(w.delta) > FUEL_MONEY_EPS);

  return {
    reFinalizeWarnings,
    dataQualityWarnings,
    hasExceptionBlockers,
    hasBlockingWarnings,
  };
}

export function weekBoundsFromDateRange(dateRange?: { from?: Date; to?: Date }): {
  startYmd: string;
  endYmd: string;
} {
  const startYmd = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const endYmd = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : startYmd;
  return { startYmd, endYmd };
}
