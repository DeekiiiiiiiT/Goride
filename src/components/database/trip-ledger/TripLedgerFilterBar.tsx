import React, { useState, useEffect, useRef } from 'react';
import { Search, XIcon, Calendar, ChevronDown } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TripLedgerFilters {
  search: string;          // free-text: driver name or trip ID
  platform: string;        // '' = all
  status: string;          // '' = all
  dateFrom: string;        // ISO date string or ''
  dateTo: string;          // ISO date string or ''
}

export const EMPTY_FILTERS: TripLedgerFilters = {
  search: '',
  platform: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

interface TripLedgerFilterBarProps {
  filters: TripLedgerFilters;
  onChange: (filters: TripLedgerFilters) => void;
  loading?: boolean;
  totalResults: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PLATFORMS = ['Uber', 'InDrive', 'Roam', 'Lyft', 'Bolt', 'GoRide', 'Private', 'Cash'] as const;
const STATUSES = ['Completed', 'Cancelled', 'Processing'] as const;

const PLATFORM_COLORS: Record<string, string> = {
  Uber: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  InDrive: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
  Roam: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
  Lyft: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
  Bolt: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
  GoRide: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800',
  Private: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  Cash: 'bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:border-lime-800',
};

const STATUS_COLORS: Record<string, string> = {
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  Cancelled: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  Processing: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
};

const INACTIVE_CHIP = 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50';

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasActiveFilters(f: TripLedgerFilters): boolean {
  return f.search !== '' || f.platform !== '' || f.status !== '' || f.dateFrom !== '' || f.dateTo !== '';
}

// ── Inline dropdown for Platform / Status ───────────────────────────────────

function ChipDropdown({
  label,
  value,
  options,
  colorMap,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  colorMap: Record<string, string>;
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const activeColor = value ? (colorMap[value] || INACTIVE_CHIP) : INACTIVE_CHIP;
  const isActive = value !== '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isActive ? activeColor : INACTIVE_CHIP}`}
      >
        {value || label}
        {isActive ? (
          <XIcon
            className="h-3 w-3 opacity-60 hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
          />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 py-1">
          {/* "All" option */}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${value === '' ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
          >
            All {label}s
          </button>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${value === opt ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorMap[opt]?.split(' ')[0] || 'bg-slate-300'}`} />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function TripLedgerFilterBar({ filters, onChange, loading, totalResults }: TripLedgerFilterBarProps) {
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
    }, 350);
  };

  const update = (patch: Partial<TripLedgerFilters>) => {
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
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search driver name or trip ID…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-colors"
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

        {/* Platform dropdown */}
        <ChipDropdown
          label="Platform"
          value={filters.platform}
          options={PLATFORMS}
          colorMap={PLATFORM_COLORS}
          onChange={v => update({ platform: v })}
        />

        {/* Status dropdown */}
        <ChipDropdown
          label="Status"
          value={filters.status}
          options={STATUSES}
          colorMap={STATUS_COLORS}
          onChange={v => update({ status: v })}
        />

        {/* Date From */}
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => update({ dateFrom: e.target.value })}
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
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
            onChange={e => update({ dateTo: e.target.value })}
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
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
          <span className="font-semibold text-slate-700 dark:text-slate-200">{totalResults.toLocaleString()}</span>
          <span>filtered {totalResults === 1 ? 'trip' : 'trips'}</span>
          {filters.platform && (
            <span className="ml-1">
              on <span className="font-medium text-slate-700 dark:text-slate-200">{filters.platform}</span>
            </span>
          )}
          {filters.status && (
            <span className="ml-1">
              with status <span className="font-medium text-slate-700 dark:text-slate-200">{filters.status}</span>
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
