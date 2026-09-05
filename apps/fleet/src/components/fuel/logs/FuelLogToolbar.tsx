import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { cn } from '../../ui/utils';
import { Search, Filter as FilterIcon, Download, RotateCcw, History, X } from 'lucide-react';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';
import type { DateRange } from 'react-day-picker';

export type FuelLogToolbarProps = {
  activeView: 'transactions' | 'cycles';
  onViewChange: (view: 'transactions' | 'cycles') => void;
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
  showRecalculate: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
};

/**
 * Search / export / filters / period / recalculate + tab triggers.
 * Presentational — parent owns query state.
 */
export function FuelLogToolbar({
  activeView,
  onViewChange,
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
  showRecalculate,
  isRecalculating,
  onRecalculate,
}: FuelLogToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeView}
          onValueChange={(v) => onViewChange(v as 'transactions' | 'cycles')}
          className="w-full sm:w-fit"
        >
          <TabsList className="w-full sm:w-auto bg-slate-100 p-1 h-11">
            <TabsTrigger
              value="transactions"
              className="gap-2 flex-1 sm:flex-none px-5 py-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <History className="h-4 w-4" />
              <span>Transactions</span>
            </TabsTrigger>
            <TabsTrigger
              value="cycles"
              className="gap-2 flex-1 sm:flex-none px-5 py-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Full Tanks</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search..."
              className="pl-8 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2 items-center">
            {canExport && (
              <Button variant="outline" size="sm" className="gap-2 h-9" onClick={onExport}>
                <Download className="h-3.5 w-3.5" />
                {selectedCount > 0 && activeView === 'transactions'
                  ? `Export selected (${selectedCount})`
                  : 'Export'}
              </Button>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 h-9 border-dashed relative">
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
          {onDateRangeChange && (
            <PeriodWeekDropdown
              selectedStart={periodStart}
              selectedEnd={periodEnd}
              placeholder="Select week period"
              buttonClassName="h-9 text-xs"
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
        </div>
        {showRecalculate && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 text-slate-600 border-slate-200 hover:text-indigo-600 hover:border-indigo-300 transition-colors shrink-0"
                  disabled={isRecalculating}
                  onClick={onRecalculate}
                >
                  <RotateCcw className={cn('h-3.5 w-3.5', isRecalculating && 'animate-spin')} />
                  <span className="text-xs font-semibold">
                    {isRecalculating ? 'Recalculating...' : 'Recalculate'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px]">
                <p className="text-xs font-semibold">Recalculate Capacity Cycles</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Runs Fuel Audit recalculate-all (optional vehicle filter). Cycles close at 98% capacity with
                  spillover; driver Full Tank removed.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export default FuelLogToolbar;
