import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { X } from 'lucide-react';

interface DateRangeExportFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onClear: () => void;
}

export function DateRangeExportFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: DateRangeExportFilterProps) {
  const hasRange = startDate || endDate;

  // Validate: start must be before end
  const isInvalid =
    startDate && endDate && new Date(startDate) > new Date(endDate);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Date Range Filter
        </Label>
        {hasRange && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-6 px-2 text-xs text-slate-400 hover:text-slate-600"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 w-full">
          <Label htmlFor="export-start-date" className="text-xs text-slate-500 mb-1 block">
            From
          </Label>
          <Input
            id="export-start-date"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="hidden sm:flex items-center pt-5 text-slate-300">
          &mdash;
        </div>
        <div className="flex-1 w-full">
          <Label htmlFor="export-end-date" className="text-xs text-slate-500 mb-1 block">
            To
          </Label>
          <Input
            id="export-end-date"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {isInvalid && (
        <p className="text-xs text-red-600 font-medium">
          Start date must be before end date.
        </p>
      )}

      {!hasRange && (
        <p className="text-xs text-slate-400 italic">
          Leave empty to export all records.
        </p>
      )}
    </div>
  );
}
