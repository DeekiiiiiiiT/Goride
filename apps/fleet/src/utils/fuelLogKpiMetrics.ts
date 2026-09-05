/**
 * Pure KPI builders for Transaction Logs (Transactions vs Full Tanks).
 * Callers MUST pass already-scoped collections — no second filter pass here.
 */

import type { FuelEntry } from '../types/fuel';
import type { FuelCycle } from '../types/fuel';
import { isJaaStatementLedgerRow } from './jaaFuelStatementMatcher';
import { isEntryInInclusiveYmdRange, toEntryYmd } from './fuelWeekPeriod';
import {
  summarizeFuelLogEntries,
  sumOdometerDeltasBetweenFillsCore,
} from './fuelLogSummaryCore';

export type DateRangeYmd = { from?: Date | string | null; to?: Date | string | null };

export type IntegrityStatus = 'Complete' | 'Partial' | 'Orphaned' | 'Pending' | 'N/A' | string;

export type TransactionKpis = {
  totalFills: number;
  totalSpend: number;
  totalVolume: number;
  /** Fill-to-fill odo deltas within the scoped set (secondary measure). */
  totalKm: number;
  imbalancedCount: number;
  sourcePortal: number;
  sourceAdmin: number;
  sourceAnchors: number;
  /** Population note for UI counting-rules popover */
  populationNote: string;
};

export type CycleKpis = {
  totalCycles: number;
  completed: number;
  active: number;
  exceptions: number;
  totalDistance: number;
  totalFuel: number;
  totalSpend: number;
};

export type TransactionKpiOptions = {
  integrityById?: Map<string, IntegrityStatus>;
  /** Valid anchor entry ids for Log Volume anchors count */
  validAnchorIds?: Set<string>;
};

function inDateRange(date: string | undefined | null, range?: DateRangeYmd): boolean {
  if (!range?.from && !range?.to) return true;
  const startYmd = range.from ? toEntryYmd(range.from) : '0000-01-01';
  const endYmd = range.to ? toEntryYmd(range.to) : '9999-12-31';
  return isEntryInInclusiveYmdRange(date, startYmd, endYmd);
}

/**
 * Sum consecutive odo deltas per vehicle (chronological). Skips JAA rows.
 * Only positive deltas count (backwards odo not treated as distance).
 * Entries must already be scoped (period + vehicle + search).
 */
export function sumOdometerDeltasBetweenFills(entries: FuelEntry[] | null | undefined): number {
  return sumOdometerDeltasBetweenFillsCore(entries ?? []);
}

/**
 * Build Transaction Logs KPI card set.
 * `entries` must already be filtered to the visible table population.
 */
export function buildTransactionKpis(
  entries: FuelEntry[] | null | undefined,
  opts: TransactionKpiOptions = {},
): TransactionKpis {
  const { integrityById, validAnchorIds } = opts;
  const rolled = summarizeFuelLogEntries(entries ?? [], { validAnchorIds });

  const periodEntries = (entries ?? []).filter((e) => !isJaaStatementLedgerRow(e));
  const imbalancedCount = periodEntries.filter((e) => {
    if (!integrityById || !integrityById.has(e.id)) return false;
    const status = integrityById.get(e.id);
    return status === 'Partial' || status === 'Orphaned';
  }).length;

  return {
    ...rolled,
    imbalancedCount,
    populationNote:
      'Fills & km = all scoped rows. Spend & volume exclude fees/declines/awaiting. Imbalanced = ledger Partial/Orphaned only.',
  };
}

export type BuildCycleKpisArgs = {
  /** Trusted Complete + Active (primary list population) */
  trusted: FuelCycle[];
  /** Exception / incomplete mega cycles (queue only — not in Total) */
  exceptions?: FuelCycle[];
  /** Period-clipped distance / fuel / spend — never raw cycle sums */
  clippedTotals?: { distanceKm: number; fuelL: number; spend: number };
};

/**
 * Build Full Tanks KPI set from the trusted partition.
 * Total = Done + Active (exceptions counted separately, not in totalCycles).
 * Accepts the object form (preferred) or a legacy FuelCycle[] for HMR/call-site safety.
 */
export function buildCycleKpis(args: BuildCycleKpisArgs | FuelCycle[] | null | undefined): CycleKpis {
  const trusted = Array.isArray(args)
    ? args
    : Array.isArray(args?.trusted)
      ? args.trusted
      : [];
  const exceptionRows = Array.isArray(args)
    ? []
    : Array.isArray(args?.exceptions)
      ? args.exceptions
      : [];
  const clippedTotals = Array.isArray(args) ? undefined : args?.clippedTotals;

  const completed = trusted.filter((c) => c.status === 'Complete').length;
  const active = trusted.filter((c) => c.status === 'Active').length;
  const exceptions = exceptionRows.length;

  const totalDistance =
    clippedTotals?.distanceKm ??
    trusted.reduce((s, c) => s + (Number(c.distance) || 0), 0);
  const totalFuel =
    clippedTotals?.fuelL ??
    trusted.reduce((s, c) => s + (Number(c.totalLiters) || 0), 0);
  const totalSpend =
    clippedTotals?.spend ??
    trusted.reduce((s, c) => s + (Number(c.totalCost) || 0), 0);

  return {
    totalCycles: trusted.length,
    completed,
    active,
    exceptions,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalFuel: Math.round(totalFuel * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
  };
}

/** Helper for period-scoped entries that need JAA filtering (shared by FuelLogTable). */
export function filterEntriesForOpsPeriod(
  entries: FuelEntry[],
  dateRange?: DateRangeYmd,
): FuelEntry[] {
  return entries.filter((e) => {
    if (isJaaStatementLedgerRow(e)) return false;
    return inDateRange(e.date, dateRange);
  });
}
