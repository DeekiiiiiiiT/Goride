import React, { useMemo } from 'react';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import type { PeriodPreset, BusinessFinancePeriod } from './types';
import { formatPeriodLabel, ymd } from './periodRange';

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
];

/** Last 12 calendar months (current month first). */
function buildMonthOptions(now = new Date()) {
  const opts: Array<{ value: string; label: string; startYmd: string; endYmd: string }> = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMM yyyy'),
      startYmd: ymd(startOfMonth(d)),
      endYmd: ymd(endOfMonth(d)),
    });
  }
  return opts;
}

function monthKeyFromRange(startYmd: string, endYmd: string): string {
  if (!startYmd || !endYmd) return '';
  try {
    const start = parseISO(startYmd);
    const end = parseISO(endYmd);
    if (ymd(startOfMonth(start)) !== startYmd) return '';
    if (ymd(endOfMonth(start)) !== endYmd) return '';
    if (ymd(startOfMonth(end)) !== startYmd) return '';
    return format(start, 'yyyy-MM');
  } catch {
    return '';
  }
}

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
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const selectedMonth =
    monthKeyFromRange(customStart || period.startYmd, customEnd || period.endYmd) ||
    monthKeyFromRange(period.startYmd, period.endYmd);

  const handlePreset = (p: PeriodPreset) => {
    onCustomStart('');
    onCustomEnd('');
    onPreset(p);
  };

  const handleMonth = (value: string) => {
    const opt = monthOptions.find((o) => o.value === value);
    if (!opt) return;
    onCustomStart(opt.startYmd);
    onCustomEnd(opt.endYmd);
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
        <div className="space-y-0.5">
          <label htmlFor="bf-month-filter" className="text-[11px] text-slate-500">
            Month
          </label>
          <select
            id="bf-month-filter"
            className={cn(
              'h-8 w-[8.5rem] rounded-md border border-slate-200 bg-white px-2 text-sm',
              'dark:border-slate-700 dark:bg-slate-950',
              selectedMonth && preset === 'custom' && 'border-indigo-300 ring-1 ring-indigo-200',
            )}
            value={selectedMonth}
            onChange={(e) => handleMonth(e.target.value)}
          >
            <option value="" disabled>
              Select month
            </option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
