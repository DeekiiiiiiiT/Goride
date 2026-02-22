import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { DatePickerWithRange } from '../ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Vehicle } from '../../types/vehicle';
import { TollPlaza } from '../../types/toll';
import { TollLogFiltersState, DEFAULT_TOLL_LOG_FILTERS } from '../../types/tollLog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DriverOption {
  id: string;
  name: string;
}

interface TollLogFiltersProps {
  filters: TollLogFiltersState;
  onFiltersChange: (filters: TollLogFiltersState) => void;
  vehicles: Vehicle[];
  drivers: DriverOption[];
  plazas: TollPlaza[];
  onClearAll: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count how many filter fields differ from their default. */
function activeFilterCount(f: TollLogFiltersState): number {
  let count = 0;
  if (f.search !== '') count++;
  if (f.dateRange !== undefined) count++;
  if (f.vehicleId !== 'all') count++;
  if (f.driverId !== 'all') count++;
  if (f.plazaId !== 'all') count++;
  if (f.highway !== 'all') count++;
  if (f.paymentMethod !== 'all') count++;
  if (f.status !== 'all') count++;
  if (f.type !== 'all') count++;
  return count;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TollLogFilters({
  filters,
  onFiltersChange,
  vehicles,
  drivers,
  plazas,
  onClearAll,
}: TollLogFiltersProps) {
  // --- Debounced search ---
  const [searchInput, setSearchInput] = useState(filters.search);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Keep local search in sync if filters are reset externally
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // --- Derived option lists ---
  const uniqueHighways = useMemo(() => {
    const set = new Set<string>();
    plazas.forEach(p => {
      if (p.highway) set.add(p.highway);
    });
    return Array.from(set).sort();
  }, [plazas]);

  const activeCount = activeFilterCount(filters);

  // Helper to update a single filter key
  const set = <K extends keyof TollLogFiltersState>(
    key: K,
    value: TollLogFiltersState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="space-y-3">
      {/* Row 1: Search + Date Range + active count / clear */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search plaza, reference, description…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {searchInput && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => { setSearchInput(''); set('search', ''); }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Date Range */}
        <DatePickerWithRange
          date={filters.dateRange as DateRange | undefined}
          setDate={(range) => set('dateRange', range as TollLogFiltersState['dateRange'])}
          className="min-w-0"
        />

        {/* Active filter indicator + Clear */}
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-slate-500 hover:text-red-600"
            onClick={onClearAll}
          >
            <X className="h-3.5 w-3.5" />
            Clear
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {activeCount}
            </Badge>
          </Button>
        )}
      </div>

      {/* Row 2: Dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-0.5" />

        {/* Vehicle */}
        <Select value={filters.vehicleId} onValueChange={v => set('vehicleId', v)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="All Vehicles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vehicles</SelectItem>
            {vehicles.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.licensePlate || `${v.make} ${v.model}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Driver */}
        <Select value={filters.driverId} onValueChange={v => set('driverId', v)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {drivers.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Plaza */}
        <Select value={filters.plazaId} onValueChange={v => set('plazaId', v)}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="All Plazas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plazas</SelectItem>
            {plazas.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Highway */}
        <Select value={filters.highway} onValueChange={v => set('highway', v)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="All Highways" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Highways</SelectItem>
            {uniqueHighways.map(h => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Payment Method */}
        <Select value={filters.paymentMethod} onValueChange={v => set('paymentMethod', v)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="E-Tag">E-Tag</SelectItem>
            <SelectItem value="Cash">Cash</SelectItem>
            <SelectItem value="Card">Card</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={filters.status} onValueChange={v => set('status', v)}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Flagged">Flagged</SelectItem>
            <SelectItem value="Reconciled">Reconciled</SelectItem>
            <SelectItem value="Void">Void</SelectItem>
          </SelectContent>
        </Select>

        {/* Type */}
        <Select value={filters.type} onValueChange={v => set('type', v)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="usage">Usage</SelectItem>
            <SelectItem value="topup">Top-up</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
