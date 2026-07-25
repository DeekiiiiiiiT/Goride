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
  tierFilter: string;
  onTierFilter: (v: string) => void;
  tierOptions: string[];
  onExport: () => void;
};

export function DriverAnalyticsToolbar({
  period,
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  onClear,
  tierFilter,
  onTierFilter,
  tierOptions,
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
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-0.5 w-full sm:w-auto">
          <label className="text-[11px] text-slate-500">Tier (from imports)</label>
          <Select value={tierFilter} onValueChange={onTierFilter}>
            <SelectTrigger className="min-h-11 w-full sm:w-[200px]">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {tierOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto sm:ml-auto bg-indigo-600 hover:bg-indigo-600"
          onClick={onExport}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Data
        </Button>
      </div>
    </div>
  );
}
