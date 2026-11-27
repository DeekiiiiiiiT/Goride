import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { Search, Filter as FilterIcon, Download, RotateCcw, History, X, Plus, Hourglass } from 'lucide-react';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';
import type { DateRange } from 'react-day-picker';
import { fuelServiceLineUiLabel } from '../../../utils/vocabulary';

export type FuelLogToolbarProps = {
  activeView: 'transactions' | 'cycles' | 'awaiting';
  onViewChange: (view: 'transactions' | 'cycles' | 'awaiting') => void;
  /** Fills still waiting on the gas card statement (shown on the Awaiting statement button). */
  awaitingCount?: number;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  canExport: boolean;
  selectedCount: number;
  onExport: () => void;
  activeFilterCount: number;
  filterVehicle: string;
  filterDriver: string;
  filterType: string;
  filterAnchor: string;
  filterStatus: string;
  filterIntegrity: string;
  filterSource: string;
  filterCycleId?: string | null;
  uniqueVehicles: { id: string; name: string }[];
  uniqueDrivers: { id: string; name: string }[];
  onFilterVehicle: (v: string) => void;
  onFilterDriver: (v: string) => void;
  onFilterType: (v: string) => void;
  onFilterAnchor: (v: string) => void;
  onFilterStatus: (v: string) => void;
  onFilterIntegrity: (v: string) => void;
  onFilterSource: (v: string) => void;
  onClearCycleFilter?: () => void;
  onClearFilters: () => void;
  periodStart?: string;
  periodEnd?: string;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  /** Rendered between tabs and filters (e.g. KPI cards). */
  afterTabs?: React.ReactNode;
  /** Mobile: Add fuel sits beside the calendar; desktop keeps header CTA. */
  onAddFuel?: () => void;
  /** Unattributed chip */
  unattributedCount?: number;
  unattributedOnly?: boolean;
  onUnattributedOnlyChange?: (v: boolean) => void;
  /** Unlinked card charges chip (approved statement rows with no ops log) */
  unlinkedCardChargesCount?: number;
  unlinkedCardChargesOnly?: boolean;
  onUnlinkedCardChargesOnlyChange?: (v: boolean) => void;
};

/**
 * Search / export / filters / period + tab triggers.
 * Presentational — parent owns query state.
 */
export function FuelLogToolbar({
  activeView,
  onViewChange,
  awaitingCount = 0,
  searchTerm,
  onSearchChange,
  canExport,
  selectedCount,
  onExport,
  activeFilterCount,
  filterVehicle,
  filterDriver,
  filterType,
  filterAnchor,
  filterStatus,
  filterIntegrity,
  filterSource,
  filterCycleId,
  uniqueVehicles,
  uniqueDrivers,
  onFilterVehicle,
  onFilterDriver,
  onFilterType,
  onFilterAnchor,
  onFilterStatus,
  onFilterIntegrity,
  onFilterSource,
  onClearCycleFilter,
  onClearFilters,
  periodStart,
  periodEnd,
  onDateRangeChange,
  afterTabs,
  onAddFuel,
  unattributedCount = 0,
  unattributedOnly = false,
  onUnattributedOnlyChange,
  unlinkedCardChargesCount = 0,
  unlinkedCardChargesOnly = false,
  onUnlinkedCardChargesOnlyChange,
}: FuelLogToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeView}
          onValueChange={(v) => onViewChange(v as 'transactions' | 'cycles' | 'awaiting')}
          className="w-full sm:w-fit"
        >
          {/* Stitch: segmented view switch — active is solid near-black. */}
          <TabsList className="w-full sm:w-auto h-auto rounded-2xl bg-[#eff4ff] p-1.5 dark:bg-zinc-900">
            <TabsTrigger
              value="transactions"
              className="min-h-[44px] gap-2 flex-1 sm:flex-none rounded-xl px-5 text-[13px] font-semibold text-[#47464c] data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-zinc-50 dark:data-[state=active]:text-zinc-900"
            >
              <History className="h-4 w-4" />
              <span>Transactions</span>
            </TabsTrigger>
            <TabsTrigger
              value="cycles"
              className="min-h-[44px] gap-2 flex-1 sm:flex-none rounded-xl px-5 text-[13px] font-semibold text-[#47464c] data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-zinc-50 dark:data-[state=active]:text-zinc-900"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Full Tanks</span>
            </TabsTrigger>
            <TabsTrigger
              value="awaiting"
              className="min-h-[44px] gap-2 flex-1 sm:flex-none rounded-xl px-5 text-[13px] font-semibold text-[#47464c] data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-zinc-50 dark:data-[state=active]:text-zinc-900"
            >
              <Hourglass className="h-4 w-4" />
              <span>Awaiting statement</span>
              {awaitingCount > 0 ? (
                <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fde68a] px-1.5 text-[11px] font-bold tabular-nums text-[#92400e]">
                  {awaitingCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className={activeView === 'awaiting' ? 'hidden' : 'flex flex-wrap items-center gap-2'}>
          {onUnattributedOnlyChange ? (
            <button
              type="button"
              onClick={() => onUnattributedOnlyChange(!unattributedOnly)}
              className={
                unattributedOnly
                  ? 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#fffbeb] px-3.5 py-1.5 text-[12px] font-semibold text-[#b45309] ring-1 ring-[#fde68a]'
                  : 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#eff4ff] px-3.5 py-1.5 text-[12px] font-semibold text-[#0d1c2e] hover:bg-[#e6eeff] dark:bg-zinc-900 dark:text-zinc-200'
              }
              aria-pressed={unattributedOnly}
            >
              No service line ({unattributedCount})
            </button>
          ) : null}
          {onUnlinkedCardChargesOnlyChange ? (
            <button
              type="button"
              onClick={() => onUnlinkedCardChargesOnlyChange(!unlinkedCardChargesOnly)}
              className={
                unlinkedCardChargesOnly
                  ? 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#fffbeb] px-3.5 py-1.5 text-[12px] font-semibold text-[#b45309] ring-1 ring-[#fde68a]'
                  : 'inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#eff4ff] px-3.5 py-1.5 text-[12px] font-semibold text-[#0d1c2e] hover:bg-[#e6eeff] dark:bg-zinc-900 dark:text-zinc-200'
              }
              aria-pressed={unlinkedCardChargesOnly}
            >
              Card charges with no fill ({unlinkedCardChargesCount})
            </button>
          ) : null}
        </div>
      </div>

      {afterTabs && activeView !== 'awaiting' ? <div className="mb-2">{afterTabs}</div> : null}

      {/* Awaiting statement loads its own backlog — week, search and filters don't apply. */}
      <div className={activeView === 'awaiting' ? 'hidden' : 'flex items-center justify-between gap-4 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d]'}>
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative hidden w-full max-w-[400px] md:block">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#47464c]" />
            <Input
              placeholder="Search driver, station, car…"
              className="h-11 rounded-xl border-0 bg-[#eff4ff] pl-10 text-[15px] dark:bg-zinc-900"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center">
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                className="hidden h-11 gap-2 rounded-xl border-0 bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-[#c9c5cd] md:inline-flex dark:bg-zinc-900"
                onClick={onExport}
              >
                <Download className="h-3.5 w-3.5" />
                {selectedCount > 0 && activeView === 'transactions'
                  ? `Export selected (${selectedCount})`
                  : 'Export'}
              </Button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative h-11 gap-2 rounded-xl border-0 bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-[#c9c5cd] dark:bg-zinc-900">
                  <FilterIcon className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-0.5 h-5 min-w-5 px-1.5 text-[11px] bg-indigo-600 hover:bg-indigo-600">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto">
                <div className="grid gap-2">
                  <Label>Vehicle</Label>
                  <Select value={filterVehicle} onValueChange={onFilterVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Vehicles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vehicles</SelectItem>
                      {uniqueVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label>Driver</Label>
                  <Select value={filterDriver} onValueChange={onFilterDriver}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Drivers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Drivers</SelectItem>
                      {uniqueDrivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label>Type</Label>
                  <Select value={filterType} onValueChange={onFilterType}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Fuel_Manual_Entry">Manual Entry</SelectItem>
                      <SelectItem value="Card_Transaction">Card Transaction</SelectItem>
                      <SelectItem value="known_fill_no_review">Known fill (no review)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Anchor</Label>
                  <Select value={filterAnchor} onValueChange={onFilterAnchor}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Anchors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={onFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Verified">Verified</SelectItem>
                      <SelectItem value="Flagged">Flagged</SelectItem>
                      <SelectItem value="Observing">Observing</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Integrity</Label>
                  <Select value={filterIntegrity} onValueChange={onFilterIntegrity}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Integrity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="imbalanced">Imbalanced</SelectItem>
                      <SelectItem value="Complete">Complete</SelectItem>
                      <SelectItem value="Partial">Partial</SelectItem>
                      <SelectItem value="Orphaned">Orphaned</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="N/A">N/A</SelectItem>
                      <SelectItem value="Unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Label>Entry Source</Label>
                  <Select value={filterSource} onValueChange={onFilterSource}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="driver-portal">Driver Portal</SelectItem>
                      <SelectItem value="admin-manual">Admin Entry</SelectItem>
                      <SelectItem value="admin-edit">Admin Edit</SelectItem>
                      <SelectItem value="bulk-import">Bulk Import</SelectItem>
                      <SelectItem value="fuel-card">Fuel Card</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={onClearFilters} className="mt-2 text-xs">
                    Clear Filters
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {filterIntegrity === 'imbalanced' && (
              <Badge
                variant="outline"
                className="h-9 gap-1 px-2.5 text-xs font-semibold text-amber-700 border-amber-300 bg-amber-50 cursor-pointer"
                onClick={() => onFilterIntegrity('all')}
              >
                Imbalanced
                <X className="h-3 w-3" />
              </Badge>
            )}
            {filterCycleId && (
              <Badge
                variant="outline"
                className="h-9 gap-1 px-2.5 text-xs font-semibold text-indigo-700 border-indigo-300 bg-indigo-50 cursor-pointer"
                onClick={() => onClearCycleFilter?.()}
              >
                Cycle {filterCycleId.length > 8 ? `${filterCycleId.slice(0, 8)}…` : filterCycleId}
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
          {(onDateRangeChange || onAddFuel) && (
            <div className="flex items-center gap-2 min-w-0">
              {onDateRangeChange && (
                <PeriodWeekDropdown
                  selectedStart={periodStart}
                  selectedEnd={periodEnd}
                  placeholder="Select week period"
                  buttonClassName="h-11 rounded-xl text-[13px]"
                  allowCustomRange
                  onSelect={(period) => {
                    const [sy, sm, sd] = period.startDate.split('-').map(Number);
                    const [ey, em, ed] = period.endDate.split('-').map(Number);
                    onDateRangeChange({
                      from: new Date(sy, sm - 1, sd),
                      to: new Date(ey, em - 1, ed),
                    });
                  }}
                />
              )}
              {onAddFuel ? (
                <Button
                  size="sm"
                  onClick={onAddFuel}
                  className="h-9 shrink-0 bg-slate-900 text-white hover:bg-slate-800 md:hidden"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add fuel
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FuelLogToolbar;
