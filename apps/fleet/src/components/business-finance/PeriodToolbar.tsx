import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import type { PeriodPreset, BusinessFinancePeriod } from './types';
import { formatPeriodLabel } from './periodRange';

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
];

type Props = {
  period: BusinessFinancePeriod;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  onClear: () => void;
};

export function PeriodToolbar({
  period,
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
  onClear,
}: Props) {
  const customIncomplete = preset === 'custom' && !(customStart && customEnd);

  const handlePreset = (p: PeriodPreset) => {
    onCustomStart('');
    onCustomEnd('');
    onPreset(p);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={preset === p.id ? 'default' : 'outline'}
              className={cn('h-8', preset === p.id && 'bg-indigo-600 hover:bg-indigo-600')}
              onClick={() => handlePreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-0.5">
            <label className="text-[11px] text-slate-500">From</label>
            <Input
              type="date"
              className="h-8 w-36"
              value={customStart}
              onChange={(e) => {
                onCustomStart(e.target.value);
                onPreset('custom');
              }}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[11px] text-slate-500">To</label>
            <Input
              type="date"
              className="h-8 w-36"
              value={customEnd}
              onChange={(e) => {
                onCustomEnd(e.target.value);
                onPreset('custom');
              }}
            />
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-slate-500" onClick={onClear}>
            Clear
          </Button>
        </div>
        <p className="ml-auto text-xs text-slate-500 tabular-nums">{formatPeriodLabel(period)}</p>
      </div>
      {customIncomplete && (
        <p className="text-xs text-amber-700 dark:text-amber-400 px-0.5">
          Select both dates to apply. Showing last applied period until then.
        </p>
      )}
    </div>
  );
}
