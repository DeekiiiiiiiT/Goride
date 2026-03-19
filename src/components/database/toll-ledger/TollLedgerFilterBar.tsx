import React, { useState, useEffect, useRef } from 'react';
import { Search, XIcon, Calendar, ChevronDown } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TollLedgerFilters {
  search: string;               // free-text: id, plaza, driverName, vehiclePlate, description
  reconciliationStatus: string;  // 'Matched' | 'Unmatched' | 'Dismissed' | 'Approved' | ''
  type: string;                  // 'Toll Usage' | 'Top-Up' | 'Deduction' | ''
  vehiclePlate: string;         // case-insensitive contains
  driverName: string;           // case-insensitive contains
  dateFrom: string;             // ISO date YYYY-MM-DD or ''
  dateTo: string;               // ISO date YYYY-MM-DD or ''
}

export const EMPTY_FILTERS: TollLedgerFilters = {
  search: '',
  reconciliationStatus: '',
  type: '',
  vehiclePlate: '',
  driverName: '',
  dateFrom: '',
  dateTo: '',
};

interface TollLedgerFilterBarProps {
  filters: TollLedgerFilters;
  onChange: (filters: TollLedgerFilters) => void;
  loading?: boolean;
  totalResults: number;
  totalUnfiltered: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const RECON_STATUSES = ['Matched', 'Unmatched', 'Dismissed', 'Approved'] as const;
const TOLL_TYPES = ['Toll Usage', 'Top-Up', 'Deduction'] as const;

const RECON_STATUS_COLORS: Record<string, string> = {
  Matched: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
  Unmatched: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  Dismissed: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  Approved: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
};

const TOLL_TYPE_COLORS: Record<string, string> = {
  'Toll Usage': 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
  'Top-Up': 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  Deduction: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
};

const INACTIVE_CHIP = 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function hasActiveFilters(f: TollLedgerFilters): boolean {
  return (
    f.search !== '' ||
    f.reconciliationStatus !== '' ||
    f.type !== '' ||
    f.vehiclePlate !== '' ||
    f.driverName !== '' ||
    f.dateFrom !== '' ||
    f.dateTo !== ''
  );
}

// ── ChipDropdown ────────────────────────────────────────────────────────────

function ChipDropdown({
  label,
  value,
  options,
  colorMap,
  labelMap,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  colorMap: Record<string, string>;
  labelMap?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const displayValue = value ? (labelMap?.[value] || value) : '';
  const activeColor = value ? (colorMap[value] || INACTIVE_CHIP) : INACTIVE_CHIP;
  const isActive = value !== '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isActive ? activeColor : INACTIVE_CHIP}`}
      >
        {displayValue || label}
        {isActive ? (
          <XIcon
            className="h-3 w-3 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 py-1">
          {/* "All" option */}
          <button
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              value === ''
                ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            All {label}s
          </button>
          {options.map((opt) => {
            const optLabel = labelMap?.[opt] || opt;
            return (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  value === opt
                    ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    colorMap[opt]?.split(' ')[0] || 'bg-slate-300'
                  }`}
                />
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function TollLedgerFilterBar({
  filters,
  onChange,
  loading,
  totalResults,
  totalUnfiltered,
}: TollLedgerFilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Keep local search in sync when filters reset externally
  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: val });
    }, 300);
  };

  const update = (patch: Partial<TollLedgerFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const clearAll = () => {
    setLocalSearch('');
    onChange({ ...EMPTY_FILTERS });
  };

  const active = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      {/* Row 1: Search + Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search ID, plaza, driver, vehicle…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-400 transition-colors"
          />
          {localSearch && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Reconciliation Status dropdown */}
        <ChipDropdown
          label="Recon Status"
          value={filters.reconciliationStatus}
          options={RECON_STATUSES}
          colorMap={RECON_STATUS_COLORS}
          onChange={(v) => update({ reconciliationStatus: v })}
        />

        {/* Type dropdown */}
        <ChipDropdown
          label="Type"
          value={filters.type}
          options={TOLL_TYPES}
          colorMap={TOLL_TYPE_COLORS}
          onChange={(v) => update({ type: v })}
        />

        {/* Vehicle plate text input */}
        <div className="relative">
          <input
            type="text"
            value={filters.vehiclePlate}
            onChange={(e) => update({ vehiclePlate: e.target.value })}
            placeholder="Vehicle plate…"
            className="w-28 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
          />
          {filters.vehiclePlate && (
            <button
              onClick={() => update({ vehiclePlate: '' })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Driver name text input */}
        <div className="relative">
          <input
            type="text"
            value={filters.driverName}
            onChange={(e) => update({ driverName: e.target.value })}
            placeholder="Driver name…"
            className="w-28 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
          />
          {filters.driverName && (
            <button
              onClick={() => update({ driverName: '' })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Date From */}
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
            title="From date"
          />
        </div>

        <span className="text-xs text-slate-400">–</span>

        {/* Date To */}
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
            title="To date"
          />
        </div>

        {/* Clear all */}
        {active && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
          >
            <XIcon className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Active filter summary */}
      {active && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Showing</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {totalResults.toLocaleString()}
          </span>
          <span>
            of {totalUnfiltered.toLocaleString()} toll{' '}
            {totalResults === 1 ? 'transaction' : 'transactions'}
          </span>
          {filters.reconciliationStatus && (
            <span className="ml-1">
              status{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {filters.reconciliationStatus}
              </span>
            </span>
          )}
          {filters.type && (
            <span className="ml-1">
              type{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {filters.type}
              </span>
            </span>
          )}
          {filters.vehiclePlate && (
            <span className="ml-1">
              vehicle{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {filters.vehiclePlate}
              </span>
            </span>
          )}
          {filters.driverName && (
            <span className="ml-1">
              driver{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {filters.driverName}
              </span>
            </span>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <span className="ml-1">
              {filters.dateFrom && filters.dateTo
                ? `from ${filters.dateFrom} to ${filters.dateTo}`
                : filters.dateFrom
                  ? `from ${filters.dateFrom}`
                  : `until ${filters.dateTo}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
