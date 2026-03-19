import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { Trip } from '../../types/data';
import { api, TripFilterParams } from '../../services/api';
import { TripLedgerTable, ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './trip-ledger/TripLedgerTable';
import { TripLedgerColumnToggle } from './trip-ledger/TripLedgerColumnToggle';
import { TripLedgerFilterBar, TripLedgerFilters, EMPTY_FILTERS } from './trip-ledger/TripLedgerFilterBar';
import { TripLedgerStats } from './trip-ledger/TripLedgerStats';
import { TripLedgerExport } from './trip-ledger/TripLedgerExport';

const STORAGE_KEY = 'roam_trip_ledger_columns';

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

/** Convert UI filters into the API's TripFilterParams shape */
function filtersToApiParams(f: TripLedgerFilters): Partial<TripFilterParams> {
  const params: Partial<TripFilterParams> = {};
  if (f.search) params.driverName = f.search;  // server does fuzzy match on driver name + trip ID
  if (f.platform) params.platform = f.platform;
  if (f.status) params.status = f.status;
  if (f.dateFrom) params.startDate = f.dateFrom;
  if (f.dateTo) params.endDate = f.dateTo;
  return params;
}

export function TripLedgerPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadVisibleColumns);
  const [filters, setFilters] = useState<TripLedgerFilters>({ ...EMPTY_FILTERS });

  // Track the latest fetch request to avoid stale responses
  const fetchIdRef = useRef(0);

  const fetchTrips = useCallback(async (p: number, ps: number, f: TripLedgerFilters) => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const apiParams: TripFilterParams = {
        limit: ps,
        offset: p * ps,
        ...filtersToApiParams(f),
      };
      const result = await api.getTripsFiltered(apiParams);
      // Discard if a newer request has been fired
      if (id !== fetchIdRef.current) return;
      setTrips(result.data || []);
      setTotal(result.total || 0);
    } catch (err: any) {
      if (id !== fetchIdRef.current) return;
      console.error('TripLedgerPage fetch error:', err);
      setError(err?.message || 'Failed to load trip data');
    } finally {
      if (id === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips(page, pageSize, filters);
  }, [page, pageSize, filters, fetchTrips]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPage(0);
    setPageSize(newSize);
  };

  const handleRetry = () => {
    fetchTrips(page, pageSize, filters);
  };

  // ── Filter handler — resets to page 0 on any filter change ──────────────
  const handleFiltersChange = (next: TripLedgerFilters) => {
    setFilters(next);
    setPage(0);
  };

  // ── Column toggle handlers ──────────────────────────────────────────────
  const handleColumnToggle = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key];
      if (next.length === 0) return prev;
      saveVisibleColumns(next);
      return next;
    });
  };

  const handleResetColumns = () => {
    setVisibleColumns([...DEFAULT_VISIBLE_KEYS]);
    saveVisibleColumns([...DEFAULT_VISIBLE_KEYS]);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Trip Ledger</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All trip records with full financial breakdown
            </p>
          </div>
        </div>

        {/* Toolbar: Column Toggle + Refresh */}
        <div className="flex items-center gap-2">
          <TripLedgerExport
            trips={trips}
            allColumns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            total={total}
          />
          <TripLedgerColumnToggle
            columns={ALL_COLUMNS}
            visibleColumns={visibleColumns}
            onToggle={handleColumnToggle}
            onResetDefaults={handleResetColumns}
          />
          <button
            onClick={handleRetry}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <TripLedgerFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        loading={loading}
        totalResults={total}
      />

      {/* Summary Stats */}
      <TripLedgerStats
        trips={trips}
        total={total}
        loading={loading}
      />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Failed to load trips</h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <TripLedgerTable
        trips={trips}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        visibleColumns={visibleColumns}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}