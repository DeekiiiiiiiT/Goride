import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { Search, X, Filter } from 'lucide-react';
import { Vehicle } from '../../types/vehicle';
import { TollPlaza } from '../../types/toll';
import { TollLogFiltersState } from '../../types/tollLog';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { generatePeriodWeekOptions } from '../../utils/periodWeekOptions';

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

/** Count search + date + dropdown filters that differ from their default. */
function activeFilterCount(f: TollLogFiltersState, timezone?: string): number {
  let count = 0;
  if (f.search !== '') count++;
  // Current week is the default — only count period when user changed it
  if (!isDefaultCurrentWeek(f.dateRange, timezone)) count++;
  if (f.vehicleId !== 'all') count++;
  if (f.driverId !== 'all') count++;
  if (f.plazaId !== 'all') count++;
  if (f.highway !== 'all') count++;
  if (f.paymentMethod !== 'all') count++;
  if (f.status !== 'all') count++;
  if (f.type !== 'all') count++;
  return count;
}

function isDefaultCurrentWeek(
  range: TollLogFiltersState['dateRange'],
  timezone?: string,
): boolean {
  if (!range?.from) return false;
  const [week] = generatePeriodWeekOptions(1, timezone);
  if (!week?.startDate || !week?.endDate) return false;
  const start = format(range.from, 'yyyy-MM-dd');
  const end = format(range.to ?? range.from, 'yyyy-MM-dd');
  return start === week.startDate && end === week.endDate;
}

/** Count only the sheet dropdown filters (not search/date). */
function sheetFilterCount(f: TollLogFiltersState): number {
  let count = 0;
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
  const [searchInput, setSearchInput] = useState(filters.search);
  const [sheetOpen, setSheetOpen] = useState(false);
  const fleetTz = useFleetTimezone();

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

  const uniqueHighways = useMemo(() => {
    const set = new Set<string>();
    plazas.forEach((p) => {
      if (p.highway) set.add(p.highway);
    });
    return Array.from(set).sort();
  }, [plazas]);

  const activeCount = activeFilterCount(filters, fleetTz);
  const sheetCount = sheetFilterCount(filters);
  const periodStart = filters.dateRange?.from
    ? format(filters.dateRange.from, 'yyyy-MM-dd')
    : undefined;
  const periodEnd = filters.dateRange?.to
    ? format(filters.dateRange.to, 'yyyy-MM-dd')
    : periodStart;

  const set = <K extends keyof TollLogFiltersState>(
    key: K,
    value: TollLogFiltersState[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearSheetFilters = () => {
    onFiltersChange({
      ...filters,
      vehicleId: 'all',
      driverId: 'all',
      plazaId: 'all',
      highway: 'all',
      paymentMethod: 'all',
      status: 'all',
      type: 'all',
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search — desktop only; mobile uses Filters sheet + period */}
      <div className="relative hidden md:block flex-1 min-w-[220px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search plaza, reference, description…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
        {searchInput && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => {
              setSearchInput('');
              set('search', '');
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Week period picker (same control as Fuel Logs / Toll Analytics) */}
      <PeriodWeekDropdown
        selectedStart={periodStart}
        selectedEnd={periodEnd}
        placeholder="Select week period"
        buttonClassName="h-9 text-xs"
        allowCustomRange
        prependAllTimeOption
        weekCount={26}
        timezone={fleetTz}
        onSelect={(period) => {
          if (!period.startDate || !period.endDate) {
            set('dateRange', undefined);
            return;
          }
          const [sy, sm, sd] = period.startDate.split('-').map(Number);
          const [ey, em, ed] = period.endDate.split('-').map(Number);
          set('dateRange', {
            from: new Date(sy, sm - 1, sd),
            to: new Date(ey, em - 1, ed),
          });
        }}
      />

      {/* Single Filters button → sheet overlay */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {sheetCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-0.5 px-1.5 py-0 text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {sheetCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Narrow toll logs by vehicle, driver, plaza, and more.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto py-6">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Vehicle</Label>
              <Select value={filters.vehicleId} onValueChange={(v) => set('vehicleId', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.licensePlate || `${v.make} ${v.model}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Driver</Label>
              <Select value={filters.driverId} onValueChange={(v) => set('driverId', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Plaza</Label>
              <Select value={filters.plazaId} onValueChange={(v) => set('plazaId', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Plazas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plazas</SelectItem>
                  {plazas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Highway</Label>
              <Select value={filters.highway} onValueChange={(v) => set('highway', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Highways" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Highways</SelectItem>
                  {uniqueHighways.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Payment</Label>
              <Select
                value={filters.paymentMethod}
                onValueChange={(v) => set('paymentMethod', v)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="E-Tag">E-Tag</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Status</Label>
              <Select value={filters.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Flagged">Flagged</SelectItem>
                  <SelectItem value="Reconciled">Reconciled</SelectItem>
                  <SelectItem value="Voided">Voided</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Type</Label>
              <Select value={filters.type} onValueChange={(v) => set('type', v)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="usage">Usage</SelectItem>
                  <SelectItem value="topup">Top-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500"
              disabled={sheetCount === 0}
              onClick={clearSheetFilters}
            >
              Clear filters
            </Button>
            <SheetClose asChild>
              <Button size="sm">Done</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Clear everything (search + date + sheet filters) */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs text-slate-500 hover:text-red-600"
          onClick={onClearAll}
        >
          <X className="h-3.5 w-3.5" />
          Clear
          <Badge
            variant="secondary"
            className="ml-0.5 px-1.5 py-0 text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          >
            {activeCount}
          </Badge>
        </Button>
      )}
    </div>
  );
}
