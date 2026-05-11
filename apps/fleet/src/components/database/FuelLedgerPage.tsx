import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Fuel, RefreshCw } from 'lucide-react';
import { FuelEntry } from '../../types/fuel';
import { api } from '../../services/api';
import { FuelLedgerTable, ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './fuel-ledger/FuelLedgerTable';
import type { SortDir } from './fuel-ledger/FuelLedgerTable';
import { FuelLedgerColumnToggle } from './fuel-ledger/FuelLedgerColumnToggle';
import { FuelLedgerFilterBar, FuelLedgerFilters, EMPTY_FILTERS, hasActiveFilters } from './fuel-ledger/FuelLedgerFilterBar';
import { FuelLedgerStats } from './fuel-ledger/FuelLedgerStats';
import { FuelLedgerExport } from './fuel-ledger/FuelLedgerExport';

const STORAGE_KEY = 'roam_fuel_ledger_columns';

function loadVisibleColumns(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [...DEFAULT_VISIBLE_KEYS];
}

function saveVisibleColumns(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch { /* ignore */ }
}

// ── Client-side filter logic ────────────────────────────────────────────────

function applyFilters(entries: FuelEntry[], f: FuelLedgerFilters): FuelEntry[] {
  if (!hasActiveFilters(f)) return entries;

  return entries.filter(e => {
    // Free-text search: vehicle ID, driver ID, station/location
    if (f.search) {
      const q = f.search.toLowerCase();
      const haystack = [
        e.vehicleId,
        e.driverId,
        e.location,
        e.stationAddress,
        e.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Payment source
    if (f.paymentSource && e.paymentSource !== f.paymentSource) return false;

    // Entry mode
    if (f.entryMode && e.entryMode !== f.entryMode) return false;

    // Type
    if (f.type && e.type !== f.type) return false;

    // Audit status
    if (f.auditStatus && (e.auditStatus || '') !== f.auditStatus) return false;

    // Date range
    if (f.dateFrom && e.date < f.dateFrom) return false;
    if (f.dateTo && e.date > f.dateTo) return false;

    return true;
  });
}

// ── Sort helpers ────────────────────────────────────────────────────────────

function getSortValue(entry: FuelEntry, key: string): string | number | boolean | null {
  switch (key) {
    case 'id': return entry.id || '';
    case 'date': return entry.date || '';
    case 'vehicleId': return (entry.vehicleId || '').toLowerCase();
    case 'driverId': return (entry.driverId || '').toLowerCase();
    case 'amount': return entry.amount ?? null;
    case 'liters': return entry.liters ?? null;
    case 'pricePerLiter': return entry.pricePerLiter ?? null;
    case 'odometer': return entry.odometer ?? null;
    case 'location': return (entry.location || entry.stationAddress || '').toLowerCase();
    case 'paymentSource': return entry.paymentSource || '';
    case 'entryMode': return entry.entryMode || '';
    case 'type': return entry.type || '';
    case 'auditStatus': return entry.auditStatus || '';
    case 'entrySource': return entry.entrySource || '';
    case 'isFullTank': return (entry as any).isFullTank ?? null;
    case 'isFlagged': return entry.isFlagged ?? null;
    case 'transactionId': return entry.transactionId || '';
    case 'matchedStationId': return entry.matchedStationId || '';
    case 'reconciliationStatus': return entry.reconciliationStatus || '';
    case 'anchorPeriodId': return entry.anchorPeriodId || '';
    case 'volumeContributed': return entry.volumeContributed ?? null;
    default: return null;
  }
}

function compareValues(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
  dir: 'asc' | 'desc'
): number {
  // nulls always last regardless of direction
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let cmp = 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    cmp = a === b ? 0 : a ? -1 : 1; // true first
  } else if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b));
  }
  return dir === 'desc' ? -cmp : cmp;
}

// ── Component ───────────────────────────────────────────────────────────────

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
}

interface FuelLedgerPageProps {
  organizationId?: string;
  columnConfig?: ColumnConfig[];
}

export function FuelLedgerPage({ organizationId, columnConfig }: FuelLedgerPageProps = {}) {
  const [allEntries, setAllEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadVisibleColumns);
  const [filters, setFilters] = useState<FuelLedgerFilters>({ ...EMPTY_FILTERS });
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const fetchIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAllFuelEntries(organizationId);
      if (id !== fetchIdRef.current) return;
      setAllEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (id !== fetchIdRef.current) return;
      console.error('FuelLedgerPage fetch error:', err);
      setError(err?.message || 'Failed to load fuel entries');
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Client-side filtering
  const filteredEntries = useMemo(
    () => applyFilters(allEntries, filters),
    [allEntries, filters]
  );

  // Client-side sorting (applies to entire filtered set before pagination)
  const sortedEntries = useMemo(() => {
    if (!sortKey || !sortDir) return filteredEntries;
    return [...filteredEntries].sort((a, b) =>
      compareValues(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDir)
    );
  }, [filteredEntries, sortKey, sortDir]);

  // Client-side pagination (on sorted + filtered set)
  const paginatedEntries = useMemo(() => {
    const start = page * pageSize;
    return sortedEntries.slice(start, start + pageSize);
  }, [sortedEntries, page, pageSize]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPage(0);
    setPageSize(newSize);
  };

  // Filter handler — resets to page 0 on any filter change
  const handleFiltersChange = (next: FuelLedgerFilters) => {
    setFilters(next);
    setPage(0);
  };

  // Sort handler — cycles: none → asc → desc → none
  const handleSort = useCallback((key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
    setPage(0);
  }, [sortKey, sortDir]);

  const handleColumnToggle = (key: string) => {
    const newVisibleColumns = visibleColumns.includes(key)
      ? visibleColumns.filter(k => k !== key)
      : [...visibleColumns, key];
    if (newVisibleColumns.length === 0) return;
    setVisibleColumns(newVisibleColumns);
    saveVisibleColumns(newVisibleColumns);
  };

  const handleResetColumns = () => {
    const defaultColumns = [...DEFAULT_VISIBLE_KEYS];
    setVisibleColumns(defaultColumns);
    saveVisibleColumns(defaultColumns);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/50">
            <Fuel className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Fuel Management Ledger
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All fuel entries — fill-ups, costs, odometer readings, and audit status
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <FuelLedgerExport
            entries={filteredEntries}
            allColumns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            totalFiltered={filteredEntries.length}
          />
          <FuelLedgerColumnToggle
            columns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            onToggle={handleColumnToggle}
            onResetDefaults={handleResetColumns}
          />
          <button
            onClick={fetchEntries}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <FuelLedgerFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        loading={loading}
        totalResults={filteredEntries.length}
        totalUnfiltered={allEntries.length}
      />

      {/* Summary Stats */}
      <FuelLedgerStats
        entries={filteredEntries}
        loading={loading}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                Failed to load fuel entries
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
            <button
              onClick={fetchEntries}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <FuelLedgerTable
        entries={paginatedEntries}
        loading={loading}
        visibleColumns={visibleColumns}
        page={page}
        pageSize={pageSize}
        totalFiltered={sortedEntries.length}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </div>
  );
}