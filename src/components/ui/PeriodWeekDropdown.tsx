import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from './utils';
import {
  generatePeriodWeekOptions,
  findPeriodWeekOptionByRange,
  type PeriodWeekOption,
} from '../../utils/periodWeekOptions';

function fmtYmd(ymd: string, fmt: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return format(new Date(y, m - 1, d), fmt);
}

export interface PeriodWeekDropdownProps {
  /** yyyy-MM-dd — when set with selectedEnd, highlights matching preset row */
  selectedStart?: string;
  selectedEnd?: string;
  onSelect: (period: PeriodWeekOption) => void;
  weekCount?: number;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
}

export function PeriodWeekDropdown({
  selectedStart,
  selectedEnd,
  onSelect,
  weekCount = 12,
  className,
  buttonClassName,
  placeholder = 'Select week period',
}: PeriodWeekDropdownProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => generatePeriodWeekOptions(weekCount), [weekCount]);
  const matched = findPeriodWeekOptionByRange(options, selectedStart, selectedEnd);
  const displayLabel =
    matched?.label ??
    (selectedStart && selectedEnd
      ? `${fmtYmd(selectedStart, 'MMM d, yyyy')} – ${fmtYmd(selectedEnd, 'MMM d, yyyy')}`
      : placeholder);

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
          matched
            ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-800 dark:text-indigo-200'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500',
          buttonClassName,
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate max-w-[200px] sm:max-w-[260px]">{displayLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-50 mt-1 w-72 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
            role="listbox"
          >
            <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Week periods
              </p>
            </div>
            <div className="py-1">
              {options.map((period, index) => {
                const isSel = matched?.id === period.id;
                return (
                  <button
                    key={period.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onSelect(period);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors',
                      isSel
                        ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        index === 0 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                      )}
                    />
                    <span className="font-medium">{period.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
