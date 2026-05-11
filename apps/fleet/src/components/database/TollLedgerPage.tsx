import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { TollLedgerEntry, normalizeTollLedgerEntry } from '../../types/toll-ledger';
import { api } from '../../services/api';
import { TollLedgerTable, ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './toll-ledger/TollLedgerTable';
import type { SortDir } from './toll-ledger/TollLedgerTable';
import { TollLedgerColumnToggle } from './toll-ledger/TollLedgerColumnToggle';
import { TollLedgerFilterBar, TollLedgerFilters, EMPTY_FILTERS, hasActiveFilters } from './toll-ledger/TollLedgerFilterBar';
import { TollLedgerStats } from './toll-ledger/TollLedgerStats';
import { TollLedgerExport } from './toll-ledger/TollLedgerExport';

const STORAGE_KEY = 'roam_toll_ledger_columns';

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

// ── Sort helpers ────────────────────────────────────────────────────────────

/** Extract a raw sortable value for a given column key */
function getSortValue(entry: TollLedgerEntry, key: string): string | number | null {
  switch (key) {
    case 'id': return entry.id || '';
    case 'date': return entry.date || '';
    case 'vehiclePlate': return (entry.vehiclePlate || '').toLowerCase();
    case 'driverName': return (entry.driverName || '').toLowerCase();
    case 'plaza': return (entry.plaza || '').toLowerCase();
    case 'amount': return typeof entry.amount === 'number' ? entry.amount : null;
    case 'absAmount': return typeof entry.absAmount === 'number' ? entry.absAmount : null;
    case 'type': return entry.type || '';
    case 'reconciliationStatus': return entry.reconciliationStatus || '';
    case 'status': return entry.status || '';
    case 'paymentMethod': return entry.paymentMethod || '';
    case 'matchedTripId': return entry.matchedTripId || '';
    case 'matchedTripPlatform': return (entry.matchedTripPlatform || '').toLowerCase();
    case 'matchedTripPickup': return (entry.matchedTripPickup || '').toLowerCase();
    case 'matchedTripDropoff': return (entry.matchedTripDropoff || '').toLowerCase();
    case 'resolution': return (entry.resolution || '').toLowerCase();
    case 'tripTollCharges': return typeof entry.tripTollCharges === 'number' ? entry.tripTollCharges : null;
    case 'refundAmount': return typeof entry.refundAmount === 'number' ? entry.refundAmount : null;
    case 'lossAmount': return typeof entry.lossAmount === 'number' ? entry.lossAmount : null;
    case 'referenceTagId': return entry.referenceTagId || '';
    case 'batchId': return entry.batchId || '';
    default: return null;
  }
}

/** Compare two values for sorting. Nulls/empty always sort last regardless of direction. */
function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: 'asc' | 'desc',
): number {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;   // nulls last
  if (bNull) return -1;  // nulls last

  let cmp: number;
  if (typeof a === 'number' && typeof b === 'number') {
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

interface TollLedgerPageProps {
  organizationId?: string;
  columnConfig?: ColumnConfig[];
}

export function TollLedgerPage({ organizationId, columnConfig }: TollLedgerPageProps = {}) {
  const [allEntries, setAllEntries] = useState<TollLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadVisibleColumns);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filters, setFilters] = useState<TollLedgerFilters>({ ...EMPTY_FILTERS });

  const fetchIdRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const raw = await api.getTollTransactionsExport(organizationId);
      if (id !== fetchIdRef.current) return;
      const entries = Array.isArray(raw)
        ? raw.map(normalizeTollLedgerEntry)
        : [];
      setAllEntries(entries);
    } catch (err: any) {
      if (id !== fetchIdRef.current) return;
      console.error('TollLedgerPage fetch error:', err);
      setError(err?.message || 'Failed to load toll transactions');
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // ── Client-side filtering ──
  const filteredEntries = useMemo(() => {
    if (!hasActiveFilters(filters)) return allEntries;

    const searchLower = filters.search.toLowerCase();

    return allEntries.filter((e) => {
      if (searchLower) {
        const haystack = [
          e.id, e.plaza, e.driverName, e.vehiclePlate, e.description, e.matchedTripId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }

      if (filters.reconciliationStatus && e.reconciliationStatus !== filters.reconciliationStatus) {
        return false;
      }

      if (filters.type && e.type !== filters.type) {
        return false;
      }

      if (filters.vehiclePlate) {
        if (!e.vehiclePlate?.toLowerCase().includes(filters.vehiclePlate.toLowerCase())) {
          return false;
        }
      }

      if (filters.driverName) {
        if (!e.driverName?.toLowerCase().includes(filters.driverName.toLowerCase())) {
          return false;
        }
      }

      if (filters.dateFrom && e.date < filters.dateFrom) return false;
      if (filters.dateTo && e.date > filters.dateTo) return false;

      return true;
    });
  }, [allEntries, filters]);

  // ── Client-side sorting ──
  const sortedEntries = useMemo(() => {
    if (!sortKey || !sortDir) return filteredEntries;

    return [...filteredEntries].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return compareValues(va, vb, sortDir);
    });
  }, [filteredEntries, sortKey, sortDir]);

  // ── Client-side pagination (slices from sorted array) ──
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

  // ── Sort handler: none → asc → desc → none ──
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
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter(k => k !== key)
      : [...visibleColumns, key];
    if (next.length === 0) return;
    setVisibleColumns(next);
    saveVisibleColumns(next);
  };

  const handleResetColumns = () => {
    const defaults = [...DEFAULT_VISIBLE_KEYS];
    setVisibleColumns(defaults);
    saveVisibleColumns(defaults);
  };

  const handleFiltersChange = (newFilters: TollLedgerFilters) => {
    setFilters(newFilters);
    setPage(0);
  };

  // ── Click-to-filter from reconciliation breakdown bar (toggle behavior) ──
  const handleFilterByStatus = useCallback((status: string) => {
    setFilters((prev) => ({
      ...prev,
      reconciliationStatus: prev.reconciliationStatus === status ? '' : status,
    }));
    setPage(0);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-100 dark:bg-rose-900/50">
            <Receipt className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Toll Ledger
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All toll transactions with reconciliation status, matched trips, and financial impact
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <TollLedgerExport
            entries={filteredEntries}
            totalFiltered={filteredEntries.length}
          />
          <TollLedgerColumnToggle
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
      <TollLedgerFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        loading={loading}
        totalResults={filteredEntries.length}
        totalUnfiltered={allEntries.length}
      />

      {/* Stats Strip */}
      <TollLedgerStats
        entries={filteredEntries}
        loading={loading}
        activeReconStatus={filters.reconciliationStatus || undefined}
        onFilterByStatus={handleFilterByStatus}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                Failed to load toll transactions
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
      <TollLedgerTable
        entries={paginatedEntries}
        loading={loading}
        visibleColumns={visibleColumns}
        page={page}
        pageSize={pageSize}
        totalFiltered={filteredEntries.length}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </div>
  );
}