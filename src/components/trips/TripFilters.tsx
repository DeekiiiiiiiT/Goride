import React, { useState } from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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
import { Filter, X, Search } from 'lucide-react';
import { Separator } from "../ui/separator";

export interface TripFilterState {
  status: string;
  driverId: string;
  vehicleId: string;
  dateRange: string; // 'today', 'yesterday', 'week', 'month', 'custom'
  dateStart?: string;
  dateEnd?: string;
  minEarnings?: string;
  maxEarnings?: string;
  minDistance?: string;
  hasTip?: string; // 'yes', 'no', 'all'
  hasSurge?: string; // 'yes', 'no', 'all'
  tripType?: string; // 'all', 'manual', 'platform'
  platform?: string; // 'all', 'Uber', 'InDrive', 'GoRide'
}

interface TripFiltersProps {
  filters: TripFilterState;
  onFilterChange: (filters: TripFilterState) => void;
  drivers: { id: string; name: string }[];
  vehicles: { id: string; plate: string }[];
}

export function TripFilters({ filters, onFilterChange, drivers, vehicles }: TripFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof TripFilterState, value: any) => {
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
          
          {/* Time Range */}
          <div className="w-[140px]">
            <Select 
              value={filters.dateRange} 
              onValueChange={(val) => updateFilter('dateRange', val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filters.dateRange === 'custom' && (
             <div className="flex items-center gap-2">
                <Input 
                   type="date" 
                   className="w-auto" 
                   value={filters.dateStart}
                   onChange={(e) => updateFilter('dateStart', e.target.value)}
                />
                <span className="text-slate-400">-</span>
                <Input 
                   type="date" 
                   className="w-auto"
                   value={filters.dateEnd}
                   onChange={(e) => updateFilter('dateEnd', e.target.value)}
                />
             </div>
          )}

          <Separator orientation="vertical" className="h-8 hidden lg:block" />

          {/* Status */}
          <div className="w-[130px]">
            <Select 
              value={filters.status} 
              onValueChange={(val) => updateFilter('status', val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
                <SelectItem value="Processing">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Platform */}
          <div className="w-[140px]">
            <Select 
              value={filters.platform || 'all'} 
              onValueChange={(val) => updateFilter('platform', val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="Uber">Uber</SelectItem>
                <SelectItem value="Lyft">Lyft</SelectItem>
                <SelectItem value="Bolt">Bolt</SelectItem>
                <SelectItem value="InDrive">InDrive</SelectItem>
                <SelectItem value="GoRide">GoRide</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trip Type */}
          <div className="w-[140px]">
             <Select 
               value={filters.tripType || 'all'} 
               onValueChange={(val) => updateFilter('tripType', val)}
             >
              <SelectTrigger>
                <SelectValue placeholder="Trip Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="platform">Platform Import</SelectItem>
                <SelectItem value="manual">Manual Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Driver */}
          <div className="w-[160px]">
             <Select 
               value={filters.driverId} 
               onValueChange={(val) => updateFilter('driverId', val)}
             >
              <SelectTrigger>
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
           {activeFilterCount > 0 && (
               <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
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
                        <Select 
                           value={filters.vehicleId} 
                           onValueChange={(val) => updateFilter('vehicleId', val)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select Vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Vehicles</SelectItem>
                            {vehicles.map(v => (
                                <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                            <Select 
                               value={filters.hasTip} 
                               onValueChange={(val) => updateFilter('hasTip', val)}
                            >
                                <SelectTrigger className="w-[100px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any</SelectItem>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-normal">Surge Pricing?</Label>
                            <Select 
                               value={filters.hasSurge} 
                               onValueChange={(val) => updateFilter('hasSurge', val)}
                            >
                                <SelectTrigger className="w-[100px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any</SelectItem>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                            </Select>
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
