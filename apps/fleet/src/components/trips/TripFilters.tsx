import React, { useState } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose
} from "../ui/sheet";
import { Filter, X, ChevronDown } from 'lucide-react';
import { Separator } from "../ui/separator";
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';

export interface TripFilterState {
  status: string;
  driverId: string;
  vehicleId: string;
  dateRange: string;
  dateStart?: string;
  dateEnd?: string;
  minEarnings?: string;
  maxEarnings?: string;
  minDistance?: string;
  hasTip?: string;
  hasSurge?: string;
  tripType?: string;
  platform?: string;
}

interface TripFiltersProps {
  filters: TripFilterState;
  onFilterChange: (filters: TripFilterState) => void;
  drivers: { id: string; name: string }[];
  vehicles: { id: string; plate: string }[];
}

// ─── Toggle Button Group Component ──────────────────────────────────────────
// Replaces Radix Select to avoid infinite re-render / portal crash issues.
interface ToggleOption {
  value: string;
  label: string;
}

function ToggleButtonGroup({
  options,
  value,
  onChange,
  label,
}: {
  options: ToggleOption[];
  value: string;
  onChange: (val: string) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            if (opt.value !== value) {
              onChange(opt.value);
            }
          }}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap
            ${opt.value === value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Simple Dropdown (native HTML select wrapper) ───────────────────────────
// Used for long lists like drivers/vehicles where toggle buttons would overflow
function NativeSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value !== value) {
            onChange(e.target.value);
          }
        }}
        className="appearance-none w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
    </div>
  );
}

export function TripFilters({ filters, onFilterChange, drivers, vehicles }: TripFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof TripFilterState, value: any) => {
    // Bail out if value hasn't changed — prevents unnecessary re-renders
    if ((filters as any)[key] === value) return;
    onFilterChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFilterChange({
      status: 'all',
      driverId: 'all',
      vehicleId: 'all',
      dateRange: 'today',
      dateStart: '',
      dateEnd: '',
      minEarnings: '',
      maxEarnings: '',
      minDistance: '',
      hasTip: 'all',
      hasSurge: 'all',
      tripType: 'all',
      platform: 'all'
    });
    setIsOpen(false);
  };

  const activeFilterCount = [
    filters.status !== 'all',
    filters.driverId !== 'all',
    filters.vehicleId !== 'all',
    filters.minEarnings,
    filters.hasTip !== 'all',
    filters.hasSurge !== 'all',
    filters.tripType !== 'all' && filters.tripType !== undefined,
    filters.platform !== 'all' && filters.platform !== undefined
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border shadow-sm">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        
        {/* Primary Filters Row */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          
          {/* Time Range - Toggle Buttons */}
          <ToggleButtonGroup
            value={filters.dateRange}
            onChange={(val) => updateFilter('dateRange', val)}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'custom', label: 'Custom' },
              { value: 'all', label: 'All Time' },
            ]}
          />

          {filters.dateRange === 'custom' && (
             <div className="flex items-center gap-2">
                <Input 
                   type="date" 
                   className="w-auto h-8 text-xs" 
                   value={filters.dateStart}
                   onChange={(e) => updateFilter('dateStart', e.target.value)}
                />
                <span className="text-slate-400 text-xs">to</span>
                <Input 
                   type="date" 
                   className="w-auto h-8 text-xs"
                   value={filters.dateEnd}
                   onChange={(e) => updateFilter('dateEnd', e.target.value)}
                />
             </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 hidden sm:inline">
              Week
            </span>
            <PeriodWeekDropdown
              selectedStart={filters.dateRange === 'period' ? filters.dateStart : undefined}
              selectedEnd={filters.dateRange === 'period' ? filters.dateEnd : undefined}
              placeholder="Select week period"
              onSelect={(p) =>
                onFilterChange({
                  ...filters,
                  dateRange: 'period',
                  dateStart: p.startDate,
                  dateEnd: p.endDate,
                })
              }
            />
          </div>

          <Separator orientation="vertical" className="h-8 hidden lg:block" />

          {/* Status - Toggle Buttons */}
          <ToggleButtonGroup
            value={filters.status}
            onChange={(val) => updateFilter('status', val)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Processing', label: 'In Progress' },
            ]}
          />

          {/* Platform - Toggle Buttons */}
          <ToggleButtonGroup
            value={filters.platform || 'all'}
            onChange={(val) => updateFilter('platform', val)}
            options={[
              { value: 'all', label: 'All Platforms' },
              { value: 'Uber', label: 'Uber' },
              { value: 'InDrive', label: 'InDrive' },
              { value: 'Roam', label: 'Roam' },
            ]}
          />

          {/* Trip Type - Toggle Buttons */}
          <ToggleButtonGroup
            value={filters.tripType || 'all'}
            onChange={(val) => updateFilter('tripType', val)}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'platform', label: 'Platform' },
              { value: 'manual', label: 'Manual' },
            ]}
          />

          {/* Driver - Native Select (too many options for toggle) */}
          <div className="w-[160px]">
            <NativeSelect
              value={filters.driverId}
              onChange={(val) => updateFilter('driverId', val)}
              options={[
                { value: 'all', label: 'All Drivers' },
                ...drivers.map(d => ({ value: d.id, label: d.name }))
              ]}
            />
          </div>

        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
           {activeFilterCount > 0 && (
               <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
                   <X className="h-3.5 w-3.5 mr-1" />
                   Clear
               </Button>
           )}
           
           <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                   <Filter className="h-4 w-4" />
                   Advanced Filters
                   {activeFilterCount > 0 && (
                       <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                           {activeFilterCount}
                       </span>
                   )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                 <SheetHeader>
                    <SheetTitle>Advanced Filters</SheetTitle>
                    <SheetDescription>
                        Narrow down your trip logs with specific criteria.
                    </SheetDescription>
                 </SheetHeader>
                 
                 <div className="py-6 space-y-6">
                    
                    {/* Vehicle */}
                    <div className="space-y-2">
                        <Label>Vehicle</Label>
                        <NativeSelect
                          value={filters.vehicleId}
                          onChange={(val) => updateFilter('vehicleId', val)}
                          options={[
                            { value: 'all', label: 'All Vehicles' },
                            ...vehicles.map(v => ({ value: v.id, label: v.plate }))
                          ]}
                        />
                    </div>

                    <Separator />

                    {/* Financials */}
                    <div className="space-y-4">
                        <Label>Financials</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-500">Min Earnings ($)</Label>
                                <Input 
                                    type="number" 
                                    placeholder="0" 
                                    value={filters.minEarnings}
                                    onChange={(e) => updateFilter('minEarnings', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-500">Max Earnings ($)</Label>
                                <Input 
                                    type="number" 
                                    placeholder="Any" 
                                    value={filters.maxEarnings}
                                    onChange={(e) => updateFilter('maxEarnings', e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-normal">Includes Tip?</Label>
                            <ToggleButtonGroup
                              value={filters.hasTip || 'all'}
                              onChange={(val) => updateFilter('hasTip', val)}
                              options={[
                                { value: 'all', label: 'Any' },
                                { value: 'yes', label: 'Yes' },
                                { value: 'no', label: 'No' },
                              ]}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-normal">Surge Pricing?</Label>
                            <ToggleButtonGroup
                              value={filters.hasSurge || 'all'}
                              onChange={(val) => updateFilter('hasSurge', val)}
                              options={[
                                { value: 'all', label: 'Any' },
                                { value: 'yes', label: 'Yes' },
                                { value: 'no', label: 'No' },
                              ]}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* Distance */}
                    <div className="space-y-2">
                        <Label>Minimum Distance (km)</Label>
                        <Input 
                            type="number" 
                            placeholder="e.g. 5" 
                            value={filters.minDistance}
                            onChange={(e) => updateFilter('minDistance', e.target.value)}
                        />
                    </div>

                 </div>

                 <SheetFooter>
                    <SheetClose asChild>
                        <Button type="submit" className="w-full">Show Results</Button>
                    </SheetClose>
                 </SheetFooter>
              </SheetContent>
           </Sheet>
        </div>
      </div>
    </div>
  );
}