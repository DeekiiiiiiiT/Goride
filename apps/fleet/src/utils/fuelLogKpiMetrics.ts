/**
 * Pure KPI builders for Transaction Logs (Transactions vs Full Tanks).
 * Never mixes domains — fill-ups vs capacity cycles.
 */

import type { FuelEntry } from '../types/fuel';
import type { FuelCycle } from '../types/fuel';
import { countsInFuelLogSpend } from './fuelOpsEligibility';
import { isJaaStatementLedgerRow } from './jaaFuelStatementMatcher';
import { isEntryInInclusiveYmdRange, toEntryYmd } from './fuelWeekPeriod';
import { resolveFuelEntrySource } from './fuelEntrySource';

export type DateRangeYmd = { from?: Date | string | null; to?: Date | string | null };

export type IntegrityStatus = 'Complete' | 'Partial' | 'Orphaned' | 'Pending' | string;

export type TransactionKpis = {
  totalFills: number;
  totalSpend: number;
  totalVolume: number;
  totalKm: number;
  imbalancedCount: number;
  sourcePortal: number;
  sourceAdmin: number;
  sourceAnchors: number;
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

export type FuelLogKpiFilters = {
  vehicleId?: string | null;
  driverId?: string | null;
  source?: string | null;
  searchTerm?: string | null;
};

export type TransactionKpiOptions = DateRangeYmd &
  FuelLogKpiFilters & {
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

function matchesSearch(haystack: string, term?: string | null): boolean {
  const t = (term || '').trim().toLowerCase();
  if (!t) return true;
  return haystack.toLowerCase().includes(t);
}

function matchesVehicle(entry: FuelEntry, vehicleId?: string | null): boolean {
  if (!vehicleId) return true;
  return entry.vehicleId === vehicleId;
}

function matchesDriver(entry: FuelEntry, driverId?: string | null): boolean {
  if (!driverId) return true;
  return entry.driverId === driverId;
}

/**
 * Sum consecutive odo deltas per vehicle (chronological). Skips JAA rows.
 * Only positive deltas count (backwards odo not treated as distance).
 */
export function sumOdometerDeltasBetweenFills(
  entries: FuelEntry[],
  opts?: { vehicleId?: string | null; searchTerm?: string | null },
): number {
  const byVehicle = new Map<string, FuelEntry[]>();
  for (const e of entries) {
    if (isJaaStatementLedgerRow(e)) continue;
    if (opts?.vehicleId && e.vehicleId !== opts.vehicleId) continue;
    if (!matchesSearch(e.vehicleId || '', opts?.searchTerm)) continue;
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
 * Build Transaction Logs KPI card set for the Transactions tab.
 * Scope = period + optional filters (vehicle, driver, source, search).
 */
export function buildTransactionKpis(
  entries: FuelEntry[],
  opts: TransactionKpiOptions = {},
): TransactionKpis {
  const {
    dateRange,
    vehicleId,
    driverId,
    source,
    searchTerm,
    integrityById,
    validAnchorIds,
  } = opts;

  const periodEntries = entries.filter((e) => {
    if (isJaaStatementLedgerRow(e)) return false;
    if (!inDateRange(e.date, dateRange)) return false;
    if (!matchesVehicle(e, vehicleId)) return false;
    if (!matchesDriver(e, driverId)) return false;
    if (source && resolveFuelEntrySource(e) !== source) return false;
    if (
      !matchesSearch(
        [e.location || '', e.vendor || '', e.driverId || '', e.vehicleId || ''].join(' '),
        searchTerm,
      )
    ) {
      return false;
    }
    return true;
  });

  const portal = periodEntries.filter((e) => resolveFuelEntrySource(e) === 'driver-portal').length;
  const admin =
    periodEntries.filter((e) => resolveFuelEntrySource(e) === 'admin-manual').length +
    periodEntries.filter((e) => resolveFuelEntrySource(e) === 'admin-edit').length;
  const anchors = periodEntries.filter((e) => validAnchorIds?.has(e.id)).length;

  const spendScope = periodEntries.filter(countsInFuelLogSpend);
  const totalSpend = spendScope.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalVolume = spendScope.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalKm = sumOdometerDeltasBetweenFills(periodEntries, { vehicleId, searchTerm });

  const imbalancedCount = periodEntries.filter((e) => {
    if (integrityById && integrityById.has(e.id)) {
      const status = integrityById.get(e.id);
      return status && status !== 'Complete' && status !== 'Pending';
    }
    return false;
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
  };
}

/**
 * Build Full Tanks KPI set. Scope = period + optional filters.
 */
export function buildCycleKpis(
  cycles: FuelCycle[],
  opts: DateRangeYmd & FuelLogKpiFilters = {},
): CycleKpis {
  const { dateRange, vehicleId, searchTerm } = opts;

  const periodCycles = cycles.filter((c) => {
    if (!inDateRange(c.endDate, dateRange)) return false;
    if (vehicleId && c.vehicleId !== vehicleId) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!String(c.vehicleId).toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const completed = periodCycles.filter((c) => c.status === 'Complete').length;
  const active = periodCycles.filter((c) => c.status === 'Active').length;
  const exceptions = periodCycles.filter(
    (c) => c.signalTier === 'exception' || (c.status === 'Anomaly' && c.signalTier !== 'review'),
  ).length;

  const totalDistance = periodCycles.reduce((s, c) => s + (Number(c.distance) || 0), 0);
  const totalFuel = periodCycles.reduce((s, c) => s + (Number(c.totalLiters) || 0), 0);
  const totalSpend = periodCycles.reduce((s, c) => s + (Number(c.totalCost) || 0), 0);

  const withEff = periodCycles.filter(
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
    totalCycles: periodCycles.length,
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
