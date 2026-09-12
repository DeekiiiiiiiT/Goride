import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { Trip } from '../../types/data';
import { api, TripFilterParams } from '../../services/api';
import { TripLedgerTable, ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './trip-ledger/TripLedgerTable';
import { TripLedgerColumnToggle } from './trip-ledger/TripLedgerColumnToggle';
import { TripLedgerFilterBar, TripLedgerFilters, EMPTY_FILTERS } from './trip-ledger/TripLedgerFilterBar';
import { TripLedgerStats } from './trip-ledger/TripLedgerStats';
import { TripLedgerExport } from './trip-ledger/TripLedgerExport';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { useQuery } from '@tanstack/react-query';
import { useLedgerQuery } from '../../hooks/useLedgerQuery';
import { toTripApiSortKey, isTripServerSortKey } from '../../utils/tripSortKeys';

const STORAGE_KEY = 'roam_trip_ledger_columns';
const STORAGE_VERSION_KEY = 'roam_trip_ledger_columns_v';
/** Bump when DEFAULT_VISIBLE_KEYS gains new defaultVisible columns (F-15). */
const COLUMN_PREF_VERSION = 2;

function loadVisibleColumns(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const ver = Number(localStorage.getItem(STORAGE_VERSION_KEY) || '0');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (ver < COLUMN_PREF_VERSION) {
          const merged = Array.from(new Set([...parsed, ...DEFAULT_VISIBLE_KEYS]));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          localStorage.setItem(STORAGE_VERSION_KEY, String(COLUMN_PREF_VERSION));
          return merged;
        }
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return [...DEFAULT_VISIBLE_KEYS];
}

function saveVisibleColumns(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    localStorage.setItem(STORAGE_VERSION_KEY, String(COLUMN_PREF_VERSION));
  } catch { /* ignore */ }
}

function filtersToApiParams(
  f: TripLedgerFilters,
  serviceLine?: 'rideshare' | 'rush_delivery' | 'all',
): Partial<TripFilterParams> {
  const params: Partial<TripFilterParams> = {};
  if (f.search) params.driverName = f.search;
  if (f.platform) params.platform = f.platform;
  if (f.status) params.status = f.status;
  if (f.dateFrom) params.startDate = f.dateFrom;
  if (f.dateTo) params.endDate = f.dateTo;
  if (serviceLine && serviceLine !== 'all') params.serviceLine = serviceLine;
  return params;
}

function isDateDescSort(sortKey: string | null, sortDir: 'asc' | 'desc' | null): boolean {
  // Server defaults to date DESC when sort omitted
  if (!sortKey && !sortDir) return true;
  const key = sortKey === 'tripDate' ? 'date' : sortKey;
  if (key !== 'date') return false;
  return !sortDir || sortDir === 'desc';
}

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  custom?: boolean;
}

interface TripLedgerPageProps {
  organizationId?: string;
  columnConfig?: ColumnConfig[];
}

export function TripLedgerPage({ organizationId, columnConfig }: TripLedgerPageProps = {}) {
  const { scope } = useServiceLineScope();
  const { period, setPeriod } = useLedgerPeriod();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<TripLedgerFilters>(() => {
    const base = {
      ...EMPTY_FILTERS,
      dateFrom: period.startDate,
      dateTo: period.endDate,
    };
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('q')) base.search = sp.get('q') || '';
      if (sp.get('platform')) base.platform = sp.get('platform') || '';
      if (sp.get('status')) base.status = sp.get('status') || '';
    } catch { /* ignore */ }
    return base;
  });
  const [sortKey, setSortKey] = useState<string | null>(() => {
    try {
      const s = new URLSearchParams(window.location.search).get('sort');
      return s && isTripServerSortKey(s) ? s : null;
    } catch {
      return null;
    }
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(() => {
    try {
      const d = new URLSearchParams(window.location.search).get('dir');
      return d === 'asc' || d === 'desc' ? d : null;
    } catch {
      return null;
    }
  });
  /** F-04: last row of previous page for keyset (forward next only) */
  const [keysetCursor, setKeysetCursor] = useState<{ date: string; id: string } | null>(null);
  const lastPageTripsRef = useRef<Trip[]>([]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = Number(sp.get('page'));
      if (Number.isFinite(p) && p >= 0) setPage(p);
    } catch { /* ignore */ }
  }, []);

  const [localVisibleColumns, setLocalVisibleColumns] = useState<string[]>(loadVisibleColumns);

  const visibleColumns = columnConfig
    ? columnConfig.filter(c => c.visible).map(c => c.key)
    : localVisibleColumns;

  const apiFilterBase = filtersToApiParams(filters, scope);

  const rowFilters = useMemo(() => {
    const offset = page * pageSize;
    const dateDesc = isDateDescSort(sortKey, sortDir);
    // F-04: keyset instead of deep OFFSET when date DESC (always page>0) or offset >= 500
    const useKeyset =
      page > 0 &&
      !!keysetCursor?.date &&
      !!keysetCursor?.id &&
      (dateDesc || offset >= 500) &&
      // Server keyset branch is date DESC only
      dateDesc;

    return {
      ...apiFilterBase,
      ...(organizationId ? { organizationId } : {}),
      limit: pageSize,
      ...(useKeyset
        ? { cursorDate: keysetCursor!.date, cursorId: keysetCursor!.id, offset: 0 }
        : { offset }),
      ...(sortKey && sortDir ? { sortKey: toTripApiSortKey(sortKey), sortDir } : {}),
    };
  }, [apiFilterBase, organizationId, page, pageSize, sortKey, sortDir, keysetCursor]);

  const rowsQuery = useLedgerQuery<{ data: Trip[]; total: number }>({
    domain: 'trips',
    filters: rowFilters,
    queryFn: (f) => api.getTripsFiltered(f as TripFilterParams),
  });

  const statsQuery = useQuery({
    queryKey: ['tripLedgerStats', apiFilterBase, organizationId],
    queryFn: () =>
      api.getTripStats({
        ...apiFilterBase,
        ...(organizationId ? { organizationId } : {}),
      }),
    staleTime: 30_000,
  });

  const trips = rowsQuery.data?.data || [];
  const total = rowsQuery.data?.total || 0;
  const loading = rowsQuery.isFetching;
  const error = rowsQuery.error ? ((rowsQuery.error as Error).message || 'Failed to load trip data') : null;

  useEffect(() => {
    lastPageTripsRef.current = trips;
  }, [trips]);

  // Shared ledger period → trip filters (N-08)
  useEffect(() => {
    setFilters((prev) => {
      if (prev.dateFrom === period.startDate && prev.dateTo === period.endDate) return prev;
      return { ...prev, dateFrom: period.startDate, dateTo: period.endDate };
    });
    setPage(0);
    setKeysetCursor(null);
  }, [period.startDate, period.endDate]);

  // URL sync for trip filters/page/sort (F-14)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ledgerTab', 'trips');
      if (filters.search) url.searchParams.set('q', filters.search);
      else url.searchParams.delete('q');
      if (filters.platform) url.searchParams.set('platform', filters.platform);
      else url.searchParams.delete('platform');
      if (filters.status) url.searchParams.set('status', filters.status);
      else url.searchParams.delete('status');
      url.searchParams.set('page', String(page));
      if (sortKey && sortDir) {
        url.searchParams.set('sort', sortKey);
        url.searchParams.set('dir', sortDir);
      } else {
        url.searchParams.delete('sort');
        url.searchParams.delete('dir');
      }
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  }, [filters, page, sortKey, sortDir]);

  const handlePageChange = (newPage: number) => {
    if (newPage > page) {
      const last = lastPageTripsRef.current[lastPageTripsRef.current.length - 1];
      const d = last?.date ? String(last.date).slice(0, 10) : '';
      const id = last?.id ? String(last.id) : '';
      setKeysetCursor(d && id ? { date: d, id } : null);
    } else {
      // Prev / jump back: keyset is forward-only — use OFFSET
      setKeysetCursor(null);
    }
    setPage(newPage);
  };
  const handlePageSizeChange = (newSize: number) => {
    setPage(0);
    setKeysetCursor(null);
    setPageSize(newSize);
  };
  const handleRetry = () => { void rowsQuery.refetch(); };
  const handleFiltersChange = (next: TripLedgerFilters) => {
    setFilters(next);
    setPage(0);
    setKeysetCursor(null);
    if (next.dateFrom && next.dateTo) {
      setPeriod({ startDate: next.dateFrom, endDate: next.dateTo });
    } else if (!next.dateFrom && !next.dateTo) {
      setPeriod({ startDate: '', endDate: '' });
    }
  };

  const handleColumnToggle = (key: string) => {
    if (columnConfig) return;
    setLocalVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      if (next.length === 0) return prev;
      saveVisibleColumns(next);
      return next;
    });
  };

  const handleResetColumns = () => {
    if (columnConfig) return;
    setLocalVisibleColumns([...DEFAULT_VISIBLE_KEYS]);
    saveVisibleColumns([...DEFAULT_VISIBLE_KEYS]);
  };

  const showColumnToggle = !columnConfig;
  const serverStats = statsQuery.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Trip Ledger</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              All trip records with full financial breakdown
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TripLedgerExport
            trips={trips}
            visibleColumns={visibleColumns}
            columnConfig={columnConfig}
            total={total}
            exportFilters={{
              ...apiFilterBase,
              ...(organizationId ? { organizationId } : {}),
            }}
          />
          {showColumnToggle && (
            <TripLedgerColumnToggle
              columns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              onToggle={handleColumnToggle}
              onResetDefaults={handleResetColumns}
            />
          )}
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

      <TripLedgerFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        loading={loading}
        totalResults={total}
      />

      <div className="sr-only" aria-live="polite">
        {loading ? 'Loading trips' : `${total.toLocaleString()} trips match filters`}
      </div>

      <TripLedgerStats
        trips={trips}
        total={serverStats?.totalTrips ?? total}
        loading={loading || statsQuery.isFetching}
        filterSumAmount={serverStats?.sumAmount}
        filterSumNet={serverStats?.sumNet}
        filterNetKnownCount={serverStats?.netKnownCount}
        filterNetUnknownCount={serverStats?.netUnknownCount}
        filterAvgAmount={serverStats?.avgAmount}
        filterAvgDistance={serverStats?.avgDistance}
        filterCompletionRate={serverStats?.completionRate}
        filterCompleted={serverStats?.completed}
        filterDistanceCount={serverStats?.distanceCount}
      />

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

      <TripLedgerTable
        trips={trips}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        visibleColumns={visibleColumns}
        columnConfig={columnConfig}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        hasActiveFilters={Object.values(filters).some((v) => !!v)}
        serverSortKey={sortKey}
        serverSortDir={sortDir}
        onServerSort={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setPage(0);
          setKeysetCursor(null);
        }}
      />
    </div>
  );
}
