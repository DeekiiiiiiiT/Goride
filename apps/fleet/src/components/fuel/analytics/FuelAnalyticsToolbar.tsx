import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { AnalyticsPeriodToolbar } from '../../vehicles/analytics/AnalyticsPeriodToolbar';
import type { PeriodPreset, BusinessFinancePeriod } from '../../business-finance/types';

type Props = {
  period: BusinessFinancePeriod;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  onClear: () => void;
  fuelTypeFilter: string;
  onFuelType: (v: string) => void;
  fuelTypeOptions: string[];
  bodyTypeFilter: string;
  onBodyType: (v: string) => void;
  bodyTypeOptions: string[];
  onExport: () => void;
};

export function FuelAnalyticsToolbar({
  period,
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  onClear,
  fuelTypeFilter,
  onFuelType,
  fuelTypeOptions,
  bodyTypeFilter,
  onBodyType,
  bodyTypeOptions,
  onExport,
}: Props) {
  return (
    <div className="space-y-3">
      <AnalyticsPeriodToolbar
        period={period}
        preset={preset}
        onPreset={onPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={onCustomStart}
        onCustomEnd={onCustomEnd}
        onClear={onClear}
      />
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-0.5">
          <label className="text-[11px] text-slate-500">Vehicle Group</label>
          <Select value={bodyTypeFilter} onValueChange={onBodyType}>
            <SelectTrigger className="min-h-11 w-[200px]">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicle Groups</SelectItem>
              {bodyTypeOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] text-slate-500">Fuel Type</label>
          <Select value={fuelTypeFilter} onValueChange={onFuelType}>
            <SelectTrigger className="min-h-11 w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fuel Types</SelectItem>
              {fuelTypeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="min-h-11 ml-auto bg-indigo-600 hover:bg-indigo-600"
          onClick={onExport}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </div>
    </div>
  );
}
