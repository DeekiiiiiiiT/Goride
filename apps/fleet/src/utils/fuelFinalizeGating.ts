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
import type { FinancialTransaction } from '../types/data';
import { isSameFuelStatement, reportWeekYmdBounds, toEntryYmd } from './fuelWeekPeriod';
import { FUEL_MONEY_EPS } from './fuelMoneyEpsilon';
import {
  isOverExplainedResidual,
  isUnderExplainedResidual,
  listUnapprovedFuelTxInWindow,
  type FuelUnapprovedTxBlocker,
} from '@roam/fuel-core';
import {
  fuelPaymentSourceDisplayLabel,
  resolveFuelPaymentSource,
} from './fuelPaymentSource';

export type { FuelUnapprovedTxBlocker };

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

/** One exception-tier fill that hard-blocks Finalize until reviewed. */
export type FuelExceptionBlocker = {
  id: string;
  dateYmd: string;
  amount: number;
  vehicleId?: string;
  driverId?: string;
  paymentLabel: string;
  location: string;
  reason: string;
};

/** One over-explained week — negative misc; HARD finalize blocker (C-7). */
export type FuelOverExplainedBlocker = {
  vehicleId: string;
  driverId?: string;
  totalSpend: number;
  miscellaneousCost: number;
  /** |misc| as a whole-number percent of spend (null when spend ≤ 0). */
  pctOfSpend: number | null;
  kind: 'over_explained' | 'under_explained';
};

export type FuelFinalizeGateResult = {
  reFinalizeWarnings: FuelReFinalizeWarning[];
  dataQualityWarnings: FuelDataQualityWarning[];
  /** Concrete fills — UI must list these; never only a vague banner. */
  exceptionBlockers: FuelExceptionBlocker[];
  hasExceptionBlockers: boolean;
  /** Pending fuel reimbursements in the statement window — HARD block (F3). */
  unapprovedFuelTxBlockers: FuelUnapprovedTxBlocker[];
  hasUnapprovedFuelTxBlockers: boolean;
  /** Negative residual beyond ratio — finalize refused (C-7). */
  overExplainedBlockers: FuelOverExplainedBlocker[];
  hasOverExplainedBlockers: boolean;
  /** Positive residual beyond ratio — reviewable via leakage review (C-7). */
  underExplainedBlockers: FuelOverExplainedBlocker[];
  hasUnderExplainedBlockers: boolean;
  hasBlockingWarnings: boolean;
};

/** Over-explained (negative misc) — never allow these to finalize. */
export function listOverExplainedBlockers(
  reports: WeeklyFuelReport[],
): FuelOverExplainedBlocker[] {
  return reports
    .filter((r) => isOverExplainedResidual(r.totalGasCardCost, r.miscellaneousCost))
    .map((r) => {
      const spend = Number(r.totalGasCardCost) || 0;
      const misc = Number(r.miscellaneousCost) || 0;
      return {
        vehicleId: r.vehicleId,
        driverId: r.driverId,
        totalSpend: spend,
        miscellaneousCost: misc,
        pctOfSpend: spend > 0 ? Math.round((Math.abs(misc) / spend) * 100) : null,
        kind: 'over_explained' as const,
      };
    });
}

/** Under-explained (positive misc) — reviewable with typed leakage acceptance. */
export function listUnderExplainedBlockers(
  reports: WeeklyFuelReport[],
): FuelOverExplainedBlocker[] {
  return reports
    .filter((r) => isUnderExplainedResidual(r.totalGasCardCost, r.miscellaneousCost))
    .map((r) => {
      const spend = Number(r.totalGasCardCost) || 0;
      const misc = Number(r.miscellaneousCost) || 0;
      return {
        vehicleId: r.vehicleId,
        driverId: r.driverId,
        totalSpend: spend,
        miscellaneousCost: misc,
        pctOfSpend: spend > 0 ? Math.round((Math.abs(misc) / spend) * 100) : null,
        kind: 'under_explained' as const,
      };
    });
}

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

function entryDateYmd(entry: FuelEntry): string {
  return String(entry.date || '').split('T')[0];
}

function resolveEntryPaymentRaw(entry: FuelEntry): string | undefined {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const metaPay = meta?.paymentSource;
  return (
    entry.paymentSource ||
    (typeof metaPay === 'string' ? metaPay : undefined)
  );
}

function resolveEntryLocation(entry: FuelEntry): string {
  const legacyVendor = (entry as FuelEntry & { vendor?: string }).vendor;
  const loc = String(entry.location || legacyVendor || '').trim();
  if (loc) return loc;
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const station = String(meta?.jaaStation || meta?.station || '').trim();
  return station || 'Unknown station';
}

function resolveExceptionReason(entry: FuelEntry): string {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const reason = String(meta?.anomalyReason || meta?.confidenceDeduction || '').trim();
  return reason || 'Flagged as exception-tier (must be reviewed before lock)';
}

/** True when recon admin acknowledged the exception (finalize may proceed). */
export function isFuelExceptionAcknowledged(
  entry: Pick<FuelEntry, 'metadata'> | null | undefined,
): boolean {
  const meta = entry?.metadata as Record<string, unknown> | undefined;
  if (!meta) return false;
  if (meta.exceptionResolvedAt) return true;
  // Persist paths can coerce JSON booleans to strings — treat both as ack.
  const ack = meta.reconExceptionAck;
  if (ack === true || ack === 'true' || ack === 1 || ack === '1') return true;
  return false;
}

/** Exception-tier fills that still hard-block Finalize. */
export function listExceptionTierFillBlockers(
  fuelEntries: FuelEntry[],
  startYmd: string,
  endYmd: string,
): FuelExceptionBlocker[] {
  return fuelEntries
    .filter((e) => {
      const d = entryDateYmd(e);
      if (startYmd && d < startYmd) return false;
      if (endYmd && d > endYmd) return false;
      if (e.metadata?.signalTier !== 'exception') return false;
      if (isFuelExceptionAcknowledged(e)) return false;
      return true;
    })
    .map((e) => {
      const payRaw = resolveEntryPaymentRaw(e);
      return {
        id: e.id,
        dateYmd: entryDateYmd(e),
        amount: Number(e.amount) || 0,
        vehicleId: e.vehicleId || undefined,
        driverId: e.driverId || undefined,
        paymentLabel: fuelPaymentSourceDisplayLabel(
          payRaw || resolveFuelPaymentSource(payRaw).enum,
        ),
        location: resolveEntryLocation(e),
        reason: resolveExceptionReason(e),
      };
    })
    .sort((a, b) => a.dateYmd.localeCompare(b.dateYmd) || a.id.localeCompare(b.id));
}

export function evaluateFuelFinalizeGating(opts: {
  reports: WeeklyFuelReport[];
  disputes?: FuelDispute[];
  fuelEntries?: FuelEntry[];
  finalizedReports?: FinalizedFuelReport[];
  /** Pending fuel Expense txs — hard-block when in statement window. */
  transactions?: Array<FinancialTransaction | Record<string, unknown>>;
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

  const exceptionBlockers = listExceptionTierFillBlockers(fuelEntries, startYmd, endYmd);

  const unapprovedFuelTxBlockers = listUnapprovedFuelTxInWindow(
    (opts.transactions || []) as Parameters<typeof listUnapprovedFuelTxInWindow>[0],
    startYmd,
    endYmd,
  );

  const dataQualityWarnings = opts.reports.reduce((acc, r) => {
    const openDispute = findDisputeForReport(disputes, r)?.status === 'Open';
    const isUnhealthy = r.healthStatus && r.healthStatus !== 'Emerald';
    const hasPending = (r.pendingCount || 0) > 0;
    const vehicleExceptions = exceptionBlockers.filter((e) => e.vehicleId === r.vehicleId).length;
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

  const overExplainedBlockers = listOverExplainedBlockers(opts.reports);
  const underExplainedBlockers = listUnderExplainedBlockers(opts.reports);

  const hasExceptionBlockers = exceptionBlockers.length > 0;
  const hasUnapprovedFuelTxBlockers = unapprovedFuelTxBlockers.length > 0;
  const hasOverExplainedBlockers = overExplainedBlockers.length > 0;
  const hasUnderExplainedBlockers = underExplainedBlockers.length > 0;
  // C-7: over-explained is always a hard signal; under is reviewable via leakage step.
  const hasBlockingWarnings =
    dataQualityWarnings.length > 0 ||
    hasOverExplainedBlockers ||
    hasUnderExplainedBlockers ||
    reFinalizeWarnings.some((w) => Math.abs(w.delta) > FUEL_MONEY_EPS);

  return {
    reFinalizeWarnings,
    dataQualityWarnings,
    exceptionBlockers,
    hasExceptionBlockers,
    unapprovedFuelTxBlockers,
    hasUnapprovedFuelTxBlockers,
    overExplainedBlockers,
    hasOverExplainedBlockers,
    underExplainedBlockers,
    hasUnderExplainedBlockers,
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
