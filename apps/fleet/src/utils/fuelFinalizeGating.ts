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
  listOverExplainedResidualRows,
  listUnderExplainedResidualRows,
  listUnapprovedFuelTxInWindow,
  type FuelUnapprovedTxBlocker,
  type FuelResidualBlockerRow,
} from '@roam/fuel-core';
import {
  fuelPaymentSourceDisplayLabel,
  resolveFuelPaymentSource,
} from './fuelPaymentSource';
import { classifyFuelFillFlags } from './fuelFillFlagClassify';
import type { FuelFlagDispositionMap } from './fuelFlagDisposition';
import { isLegacyExceptionAck } from './fuelFlagDisposition';

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

/** One over/under-explained week residual — from fuel-core SoT (F-4). */
export type FuelOverExplainedBlocker = FuelResidualBlockerRow;

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
  return listOverExplainedResidualRows(
    reports.map((r) => ({
      totalSpend: Number(r.totalGasCardCost) || 0,
      miscellaneousCost: Number(r.miscellaneousCost) || 0,
      vehicleId: r.vehicleId,
      driverId: r.driverId,
    })),
  );
}

/** Under-explained (positive misc) — reviewable with typed leakage acceptance. */
export function listUnderExplainedBlockers(
  reports: WeeklyFuelReport[],
): FuelOverExplainedBlocker[] {
  return listUnderExplainedResidualRows(
    reports.map((r) => ({
      totalSpend: Number(r.totalGasCardCost) || 0,
      miscellaneousCost: Number(r.miscellaneousCost) || 0,
      vehicleId: r.vehicleId,
      driverId: r.driverId,
    })),
  );
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

/** True when recon admin acknowledged the exception (finalize may proceed). Dual-read legacy metadata. */
export function isFuelExceptionAcknowledged(
  entry: Pick<FuelEntry, 'metadata'> | null | undefined,
): boolean {
  return isLegacyExceptionAck(
    (entry?.metadata || null) as Record<string, unknown> | null,
  );
}

/**
 * Critical fill flags that still hard-block Finalize.
 * Filters classifyFuelFillFlags — one vocabulary with the desk.
 */
export function listExceptionTierFillBlockers(
  fuelEntries: FuelEntry[],
  startYmd: string,
  endYmd: string,
  dispositions?: FuelFlagDispositionMap,
): FuelExceptionBlocker[] {
  // Single-pass classify (R-7) — avoid filter+map double work.
  const blockers: FuelExceptionBlocker[] = [];
  for (const e of fuelEntries) {
    const d = entryDateYmd(e);
    if (startYmd && d < startYmd) continue;
    if (endYmd && d > endYmd) continue;
    const c = classifyFuelFillFlags(e, { dispositions });
    if (!c.hasOpenCritical) continue;
    const payRaw = resolveEntryPaymentRaw(e);
    const openCritical = c.reasons.find((r) => r.severity === 'critical' && !r.resolved);
    blockers.push({
      id: e.id,
      dateYmd: d,
      amount: Number(e.amount) || 0,
      vehicleId: e.vehicleId || undefined,
      driverId: e.driverId || undefined,
      paymentLabel: fuelPaymentSourceDisplayLabel(
        payRaw || resolveFuelPaymentSource(payRaw).enum,
      ),
      location: resolveEntryLocation(e),
      reason: openCritical?.label || resolveExceptionReason(e),
    });
  }
  return blockers.sort(
    (a, b) => a.dateYmd.localeCompare(b.dateYmd) || a.id.localeCompare(b.id),
  );
}

/** Count of undisposed critical fill flags in the week window. */
export function countUndisposedCriticalFlags(
  fuelEntries: FuelEntry[],
  startYmd: string,
  endYmd: string,
  dispositions?: FuelFlagDispositionMap,
): number {
  return listExceptionTierFillBlockers(fuelEntries, startYmd, endYmd, dispositions).length;
}

/**
 * Wizard / bulk / finalize client gate assembly — always pass dispositions
 * (undefined = legacy dual-read only). Wiring tests must call this helper.
 */
export function assembleFuelClientFinalizeGate(opts: {
  reports: WeeklyFuelReport[];
  disputes?: FuelDispute[];
  fuelEntries?: FuelEntry[];
  finalizedReports?: FinalizedFuelReport[];
  transactions?: Array<FinancialTransaction | Record<string, unknown>>;
  weekStartYmd?: string;
  weekEndYmd?: string;
  /** Required on the call site — pass the page map or explicit undefined. */
  dispositions: FuelFlagDispositionMap | undefined;
}): FuelFinalizeGateResult {
  return evaluateFuelFinalizeGating(opts);
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
  dispositions?: FuelFlagDispositionMap;
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

  const exceptionBlockers = listExceptionTierFillBlockers(
    fuelEntries,
    startYmd,
    endYmd,
    opts.dispositions,
  );

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
