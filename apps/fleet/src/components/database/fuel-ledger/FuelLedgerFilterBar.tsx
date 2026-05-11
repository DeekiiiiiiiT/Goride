import React, { useState, useEffect, useRef } from 'react';
import { Search, XIcon, Calendar, ChevronDown } from 'lucide-react';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FuelLedgerFilters {
  search: string;          // free-text: vehicle ID, driver ID, station name
  paymentSource: string;   // '' = all
  entryMode: string;       // '' = all
  type: string;            // '' = all
  auditStatus: string;     // '' = all
  dateFrom: string;        // ISO date string or ''
  dateTo: string;          // ISO date string or ''
}

export const EMPTY_FILTERS: FuelLedgerFilters = {
  search: '',
  paymentSource: '',
  entryMode: '',
  type: '',
  auditStatus: '',
  dateFrom: '',
  dateTo: '',
};

interface FuelLedgerFilterBarProps {
  filters: FuelLedgerFilters;
  onChange: (filters: FuelLedgerFilters) => void;
  loading?: boolean;
  totalResults: number;
  totalUnfiltered: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_SOURCES = ['RideShare_Cash', 'Gas_Card', 'Personal', 'Petty_Cash'] as const;
const ENTRY_MODES = ['Anchor', 'Floating'] as const;
const TYPES = ['Card_Transaction', 'Manual_Entry', 'Fuel_Manual_Entry', 'Reimbursement'] as const;
const AUDIT_STATUSES = ['Clear', 'Observing', 'Flagged', 'Auto-Resolved'] as const;

const PAYMENT_SOURCE_LABELS: Record<string, string> = {
  RideShare_Cash: 'RideShare Cash',
  Gas_Card: 'Gas Card',
  Personal: 'Personal',
  Petty_Cash: 'Petty Cash',
};

const TYPE_LABELS: Record<string, string> = {
  Card_Transaction: 'Card Txn',
  Manual_Entry: 'Manual',
  Fuel_Manual_Entry: 'Fuel Manual',
  Reimbursement: 'Reimburse',
};

const PAYMENT_SOURCE_COLORS: Record<string, string> = {
  RideShare_Cash: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  Gas_Card: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  Personal: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
  Petty_Cash: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
};

const ENTRY_MODE_COLORS: Record<string, string> = {
  Anchor: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
  Floating: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const TYPE_COLORS: Record<string, string> = {
  Card_Transaction: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  Manual_Entry: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  Fuel_Manual_Entry: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  Reimbursement: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
};

const AUDIT_STATUS_COLORS: Record<string, string> = {
  Clear: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
  Observing: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  Flagged: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  'Auto-Resolved': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
};

const INACTIVE_CHIP = 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50';

// ── Helpers ─────────────────────────────────────────────────────────────────

export function hasActiveFilters(f: FuelLedgerFilters): boolean {
  return f.search !== '' || f.paymentSource !== '' || f.entryMode !== '' || f.type !== '' || f.auditStatus !== '' || f.dateFrom !== '' || f.dateTo !== '';
}

// ── Inline dropdown for chip filters ────────────────────────────────────────

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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
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
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
          />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-50" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 py-1">
          {/* "All" option */}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${value === '' ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
          >
            All {label}s
          </button>
          {options.map(opt => {
            const optLabel = labelMap?.[opt] || opt;
            return (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${value === opt ? 'bg-slate-100 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorMap[opt]?.split(' ')[0] || 'bg-slate-300'}`} />
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

export function FuelLedgerFilterBar({ filters, onChange, loading, totalResults, totalUnfiltered }: FuelLedgerFilterBarProps) {
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

  const update = (patch: Partial<FuelLedgerFilters>) => {
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
            placeholder="Search vehicle, driver, or station…"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400 transition-colors"
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

        {/* Payment Source dropdown */}
        <ChipDropdown
          label="Payment"
          value={filters.paymentSource}
          options={PAYMENT_SOURCES}
          colorMap={PAYMENT_SOURCE_COLORS}
          labelMap={PAYMENT_SOURCE_LABELS}
          onChange={v => update({ paymentSource: v })}
        />

        {/* Entry Mode dropdown */}
        <ChipDropdown
          label="Mode"
          value={filters.entryMode}
          options={ENTRY_MODES}
          colorMap={ENTRY_MODE_COLORS}
          onChange={v => update({ entryMode: v })}
        />

        {/* Type dropdown */}
        <ChipDropdown
          label="Type"
          value={filters.type}
          options={TYPES}
          colorMap={TYPE_COLORS}
          labelMap={TYPE_LABELS}
          onChange={v => update({ type: v })}
        />

        {/* Audit Status dropdown */}
        <ChipDropdown
          label="Audit"
          value={filters.auditStatus}
          options={AUDIT_STATUSES}
          colorMap={AUDIT_STATUS_COLORS}
          onChange={v => update({ auditStatus: v })}
        />

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 hidden sm:inline">
            Week
          </span>
          <PeriodWeekDropdown
            selectedStart={filters.dateFrom || undefined}
            selectedEnd={filters.dateTo || undefined}
            placeholder="Select week period"
            onSelect={(p) => update({ dateFrom: p.startDate, dateTo: p.endDate })}
          />
        </div>

        {/* Date From */}
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => update({ dateFrom: e.target.value })}
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
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
            className="pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
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
          <span>of {totalUnfiltered.toLocaleString()} fuel {totalResults === 1 ? 'entry' : 'entries'}</span>
          {filters.paymentSource && (
            <span className="ml-1">
              paid via <span className="font-medium text-slate-700 dark:text-slate-200">{PAYMENT_SOURCE_LABELS[filters.paymentSource] || filters.paymentSource}</span>
            </span>
          )}
          {filters.entryMode && (
            <span className="ml-1">
              mode <span className="font-medium text-slate-700 dark:text-slate-200">{filters.entryMode}</span>
            </span>
          )}
          {filters.type && (
            <span className="ml-1">
              type <span className="font-medium text-slate-700 dark:text-slate-200">{TYPE_LABELS[filters.type] || filters.type}</span>
            </span>
          )}
          {filters.auditStatus && (
            <span className="ml-1">
              audit <span className="font-medium text-slate-700 dark:text-slate-200">{filters.auditStatus}</span>
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
