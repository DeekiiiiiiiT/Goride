import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { TollLedgerEntry, normalizeTollLedgerEntry } from '../../types/toll-ledger';
import { api } from '../../services/api';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { useLedgerQuery } from '../../hooks/useLedgerQuery';
import { isTollServerSortKey } from '../../utils/tollSortKeys';
import { TollLedgerTable, ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './toll-ledger/TollLedgerTable';
import type { SortDir } from './toll-ledger/TollLedgerTable';
import { TollLedgerColumnToggle } from './toll-ledger/TollLedgerColumnToggle';
import { TollLedgerFilterBar, TollLedgerFilters, EMPTY_FILTERS } from './toll-ledger/TollLedgerFilterBar';
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
  const { period, setPeriod } = useLedgerPeriod();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [localVisibleColumns, setLocalVisibleColumns] = useState<string[]>(loadVisibleColumns);
  const visibleColumns = columnConfig
    ? columnConfig.filter((c) => c.visible).map((c) => c.key)
    : localVisibleColumns;
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [filters, setFilters] = useState<TollLedgerFilters>(() => ({
    ...EMPTY_FILTERS,
    dateFrom: period.startDate,
    dateTo: period.endDate,
  }));

  useEffect(() => {
    setFilters((prev) => {
      if (prev.dateFrom === period.startDate && prev.dateTo === period.endDate) return prev;
      return { ...prev, dateFrom: period.startDate, dateTo: period.endDate };
    });
    setPage(0);
  }, [period.startDate, period.endDate]);

  const rowFilters = useMemo(() => ({
    ...(organizationId ? { organizationId } : {}),
    startDate: filters.dateFrom || undefined,
    endDate: filters.dateTo || undefined,
    search: filters.search || undefined,
    reconciliationStatus: filters.reconciliationStatus || undefined,
    type: filters.type || undefined,
    vehiclePlate: filters.vehiclePlate || undefined,
    driverName: filters.driverName || undefined,
    limit: pageSize,
    offset: page * pageSize,
    ...(sortKey && sortDir && isTollServerSortKey(sortKey) ? { sortKey, sortDir } : {}),
  }), [organizationId, filters, page, pageSize, sortKey, sortDir]);

  const rowsQuery = useLedgerQuery<{ data: TollLedgerEntry[]; total: number }>({
    domain: 'toll',
    filters: rowFilters,
    queryFn: async (f) => {
      const result = await api.getTollLedger(f as any);
      return {
        data: (result.data || []).map(normalizeTollLedgerEntry),
        total: result.total ?? 0,
      };
    },
  });

  const entries = rowsQuery.data?.data || [];
  const total = rowsQuery.data?.total ?? 0;
  const loading = rowsQuery.isFetching;
  const error = rowsQuery.error ? ((rowsQuery.error as Error).message || 'Failed to load toll transactions') : null;

  const handlePageChange = (newPage: number) => setPage(newPage);
  const handlePageSizeChange = (newSize: number) => {
    setPage(0);
    setPageSize(newSize);
  };

  const handleFiltersChange = (next: TollLedgerFilters) => {
    setFilters(next);
    setPage(0);
    if (next.dateFrom && next.dateTo) {
      setPeriod({ startDate: next.dateFrom, endDate: next.dateTo });
    } else if (!next.dateFrom && !next.dateTo) {
      setPeriod({ startDate: '', endDate: '' });
    }
  };

  const handleFilterByStatus = (status: string) => {
    setFilters((prev) => ({ ...prev, reconciliationStatus: status }));
    setPage(0);
  };

  const handleSort = useCallback((key: string) => {
    if (!isTollServerSortKey(key)) return;
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
    if (columnConfig) return;
    setLocalVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-violet-100 dark:bg-violet-900/50">
            <Receipt className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Toll Ledger
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Toll transactions (list view — no live match engine)
              {total ? ` · ${total.toLocaleString()} matching` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TollLedgerExport entries={entries} totalFiltered={total} />
          {showColumnToggle && (
            <TollLedgerColumnToggle
              columns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              onToggle={handleColumnToggle}
              onResetDefaults={handleResetColumns}
            />
          )}
          <button
            onClick={() => void rowsQuery.refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {sortKey && sortDir && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Sorted by {sortKey} ({sortDir}) across the full filtered set.
        </div>
      )}

      <TollLedgerFilterBar
        filters={filters}
        onChange={handleFiltersChange}
        loading={loading}
        totalResults={total}
        totalUnfiltered={total}
      />

      <TollLedgerStats
        entries={entries}
        loading={loading}
        activeReconStatus={filters.reconciliationStatus || undefined}
        onFilterByStatus={handleFilterByStatus}
      />

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
              onClick={() => void rowsQuery.refetch()}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <TollLedgerTable
        entries={entries}
        loading={loading}
        visibleColumns={visibleColumns}
        page={page}
        pageSize={pageSize}
        totalFiltered={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        columnConfig={columnConfig}
      />
    </div>
  );
}
