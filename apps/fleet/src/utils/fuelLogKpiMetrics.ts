/**
 * Pure KPI builders for Transaction Logs (Transactions vs Full Tanks).
 * Callers MUST pass already-scoped collections — no second filter pass here.
 */

import type { FuelEntry } from '../types/fuel';
import type { FuelCycle } from '../types/fuel';
import { countsInFuelLogSpend } from './fuelOpsEligibility';
import { isJaaStatementLedgerRow } from './jaaFuelStatementMatcher';
import { isEntryInInclusiveYmdRange, toEntryYmd } from './fuelWeekPeriod';
import { resolveFuelEntrySource } from './fuelEntrySource';

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
  avgEfficiency: number | null;
};

export type TransactionKpiOptions = {
  integrityById?: Map<string, IntegrityStatus>;
  /** Valid anchor entry ids for Log Volume anchors count */
  validAnchorIds?: Set<string>;
};

function isValidOdo(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

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
  const byVehicle = new Map<string, FuelEntry[]>();
  for (const e of entries ?? []) {
    if (isJaaStatementLedgerRow(e)) continue;
    const key = e.vehicleId || 'unknown';
    if (!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key)!.push(e);
  }

  let totalKm = 0;
  for (const list of byVehicle.values()) {
    list.sort((a, b) => {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (da !== db) return da.localeCompare(db);
      return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
    });
    let lastOdo: number | null = null;
    for (const e of list) {
      const odo = Number(e.odometer);
      if (!isValidOdo(odo)) {
        lastOdo = null;
        continue;
      }
      if (lastOdo != null && odo >= lastOdo) {
        totalKm += odo - lastOdo;
      }
      lastOdo = odo;
    }
  }
  return Math.round(totalKm * 100) / 100;
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

  // Defensive: never count statement ledger even if a caller forgot to strip it
  const periodEntries = (entries ?? []).filter((e) => !isJaaStatementLedgerRow(e));

  const portal = periodEntries.filter((e) => resolveFuelEntrySource(e) === 'driver-portal').length;
  const admin =
    periodEntries.filter((e) => resolveFuelEntrySource(e) === 'admin-manual').length +
    periodEntries.filter((e) => resolveFuelEntrySource(e) === 'admin-edit').length;
  const anchors = periodEntries.filter((e) => validAnchorIds?.has(e.id)).length;

  // Spend/volume use ops eligibility; fills/km use full scoped set (documented in UI)
  const spendScope = periodEntries.filter(countsInFuelLogSpend);
  const totalSpend = spendScope.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalVolume = spendScope.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalKm = sumOdometerDeltasBetweenFills(periodEntries);

  const imbalancedCount = periodEntries.filter((e) => {
    if (!integrityById || !integrityById.has(e.id)) return false;
    const status = integrityById.get(e.id);
    return status === 'Partial' || status === 'Orphaned';
  }).length;

  return {
    totalFills: periodEntries.length,
    totalSpend,
    totalVolume,
    totalKm,
    imbalancedCount,
    sourcePortal: portal,
    sourceAdmin: admin,
    sourceAnchors: anchors,
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

  const withEff = trusted.filter(
    (c) => isValidOdo(Number(c.distance)) && Number(c.totalLiters) > 0 && Number(c.efficiency) > 0,
  );
  let avgEfficiency: number | null = null;
  if (withEff.length > 0) {
    const litersSum = withEff.reduce(
      (s, c) => s + Math.max(1e-9, Number(c.totalLiters) || 1),
      0,
    );
    const weightedSum = withEff.reduce(
      (s, c) => s + Math.max(1e-9, Number(c.totalLiters) || 1) * (Number(c.efficiency) || 0),
      0,
    );
    avgEfficiency = litersSum > 0 ? weightedSum / litersSum : 0;
  }

  return {
    totalCycles: trusted.length,
    completed,
    active,
    exceptions,
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalFuel: Math.round(totalFuel * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
    avgEfficiency: avgEfficiency != null ? Math.round(avgEfficiency * 100) / 100 : null,
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
