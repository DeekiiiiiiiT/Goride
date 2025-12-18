import React from 'react';
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Badge } from "../ui/badge";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../ui/utils";
import { TransactionType, TransactionStatus } from "../../types/data";

export interface TransactionFilterState {
  dateRange: 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';
  dateStart?: string;
  dateEnd?: string;
  type: TransactionType | 'all';
  status: TransactionStatus | 'all';
  driverId: string;
  minAmount: string;
  maxAmount: string;
  category: string;
  reconciled: 'all' | 'yes' | 'no';
  batchId: string;
}

interface TransactionFiltersProps {
  filters: TransactionFilterState;
  onFilterChange: (filters: TransactionFilterState) => void;
  drivers: { id: string; name: string }[];
  categories: string[];
  batches: { id: string; name: string }[];
}

export function TransactionFilters({ filters, onFilterChange, drivers, categories, batches }: TransactionFiltersProps) {
  
  const handleDateSelect = (range: TransactionFilterState['dateRange']) => {
    onFilterChange({ ...filters, dateRange: range });
  };

  const clearFilters = () => {
    onFilterChange({
      dateRange: 'all',
      dateStart: '',
      dateEnd: '',
      type: 'all',
      status: 'all',
      driverId: 'all',
      minAmount: '',
      maxAmount: '',
      category: 'all',
      reconciled: 'all',
      batchId: 'all'
    });
  };

  const activeFilterCount = [
    filters.type !== 'all',
    filters.status !== 'all',
    filters.driverId !== 'all',
    filters.minAmount !== '',
    filters.maxAmount !== '',
    filters.category !== 'all',
    filters.reconciled !== 'all',
    filters.dateRange !== 'all',
    filters.batchId !== 'all'
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Date Filter */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-md border shadow-sm">
            <Button 
                variant={filters.dateRange === 'today' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => handleDateSelect('today')}
                className="text-xs h-7"
            >
                Today
            </Button>
            <Button 
                variant={filters.dateRange === 'week' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => handleDateSelect('week')}
                className="text-xs h-7"
            >
                This Week
            </Button>
            <Button 
                variant={filters.dateRange === 'month' ? 'secondary' : 'ghost'} 
                size="sm"
                onClick={() => handleDateSelect('month')}
                className="text-xs h-7"
            >
                This Month
            </Button>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant={filters.dateRange === 'custom' ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7 gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {filters.dateRange === 'custom' && filters.dateStart ? 
                          `${format(new Date(filters.dateStart), 'MMM d')} - ${filters.dateEnd ? format(new Date(filters.dateEnd), 'MMM d') : '...'}` 
                          : 'Custom'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        selected={{
                            from: filters.dateStart ? new Date(filters.dateStart) : undefined,
                            to: filters.dateEnd ? new Date(filters.dateEnd) : undefined
                        }}
                        onSelect={(range) => {
                            if (range?.from) {
                                onFilterChange({
                                    ...filters,
                                    dateRange: 'custom',
                                    dateStart: range.from.toISOString(),
                                    dateEnd: range.to ? range.to.toISOString() : ''
                                });
                            }
                        }}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* Batch/File Filter */}
        <Select 
            value={filters.batchId} 
            onValueChange={(val) => onFilterChange({...filters, batchId: val})}
        >
            <SelectTrigger className="w-[160px] h-9 text-xs font-medium text-indigo-700 bg-indigo-50 border-indigo-200">
                <SelectValue placeholder="Select Import File" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Import Files</SelectItem>
                {batches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>

        {/* Type Filter */}
        <Select 
            value={filters.type} 
            onValueChange={(val) => onFilterChange({...filters, type: val as any})}
        >
            <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Revenue">Revenue</SelectItem>
                <SelectItem value="Expense">Expense</SelectItem>
                <SelectItem value="Payout">Payout</SelectItem>
                <SelectItem value="Transfer">Transfer</SelectItem>
            </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select 
            value={filters.status} 
            onValueChange={(val) => onFilterChange({...filters, status: val as any})}
        >
            <SelectTrigger className="w-[130px] h-9 text-xs">
                <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Reconciled">Reconciled</SelectItem>
            </SelectContent>
        </Select>

        {/* Driver Filter */}
        <Select 
            value={filters.driverId} 
            onValueChange={(val) => onFilterChange({...filters, driverId: val})}
        >
            <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="All Drivers" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>

        {/* More Filters Popover */}
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-dashed gap-1 text-xs">
                    <Filter className="h-3 w-3" />
                    More Filters
                    {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="h-5 px-1 ml-1 text-[10px]">{activeFilterCount}</Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none text-sm">Category</h4>
                        <Select 
                            value={filters.category} 
                            onValueChange={(val) => onFilterChange({...filters, category: val})}
                        >
                            <SelectTrigger className="w-full text-xs">
                                <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-medium leading-none text-sm">Amount Range</h4>
                        <div className="flex items-center gap-2">
                            <Input 
                                type="number" 
                                placeholder="Min" 
                                className="h-8 text-xs"
                                value={filters.minAmount}
                                onChange={(e) => onFilterChange({...filters, minAmount: e.target.value})} 
                            />
                            <span className="text-slate-400">-</span>
                            <Input 
                                type="number" 
                                placeholder="Max" 
                                className="h-8 text-xs"
                                value={filters.maxAmount}
                                onChange={(e) => onFilterChange({...filters, maxAmount: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-medium leading-none text-sm">Reconciled Status</h4>
                        <div className="flex gap-2">
                            <Button 
                                variant={filters.reconciled === 'all' ? 'default' : 'outline'} 
                                size="sm" 
                                className="flex-1 text-xs h-7"
                                onClick={() => onFilterChange({...filters, reconciled: 'all'})}
                            >
                                All
                            </Button>
                            <Button 
                                variant={filters.reconciled === 'yes' ? 'default' : 'outline'} 
                                size="sm" 
                                className="flex-1 text-xs h-7"
                                onClick={() => onFilterChange({...filters, reconciled: 'yes'})}
                            >
                                Yes
                            </Button>
                            <Button 
                                variant={filters.reconciled === 'no' ? 'default' : 'outline'} 
                                size="sm" 
                                className="flex-1 text-xs h-7"
                                onClick={() => onFilterChange({...filters, reconciled: 'no'})}
                            >
                                No
                            </Button>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>

        {activeFilterCount > 0 && (
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-9 px-2 text-slate-500 hover:text-slate-900"
                onClick={clearFilters}
            >
                <X className="h-4 w-4 mr-1" />
                Clear
            </Button>
        )}
      </div>
    </div>
  );
}
