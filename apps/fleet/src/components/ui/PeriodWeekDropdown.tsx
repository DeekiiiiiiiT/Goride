import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from './utils';
import { Calendar } from './calendar';
import { Button } from './button';
import {
  generatePeriodWeekOptions,
  findPeriodWeekOptionByRange,
  type PeriodWeekOption,
  ENTIRE_PERIOD_OPTION_ID,
  CUSTOM_RANGE_OPTION_ID,
} from '../../utils/periodWeekOptions';

function fmtYmd(ymd: string, fmt: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return format(new Date(y, m - 1, d), fmt);
}

function ymdToDate(ymd?: string): Date | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export interface PeriodWeekDropdownProps {
  /** yyyy-MM-dd — when set with selectedEnd, highlights matching preset row */
  selectedStart?: string;
  selectedEnd?: string;
  onSelect: (period: PeriodWeekOption) => void;
  weekCount?: number;
  /** When set, these options replace rolling week presets (e.g. weeks for a chosen date range). */
  optionsOverride?: PeriodWeekOption[];
  /** IANA fleet timezone — anchors the rolling week presets to the fleet-tz calendar day. */
  timezone?: string;
  /** Context label on the trigger when no specific week is highlighted (e.g. overall range). Must not be set when a week row is selected, or it hides the selected week label. */
  headerLabel?: string;
  /** Prepends “Entire selected period” to clear a week drill-down. */
  prependEntireOption?: boolean;
  /** Appends “Custom range…” with a calendar for any start/end (beyond rolling week presets). */
  allowCustomRange?: boolean;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  /** When true, the control is non-interactive (e.g. primary date preset is not “All time”). */
  disabled?: boolean;
  /** Native tooltip when disabled */
  title?: string;
}

export function PeriodWeekDropdown({
  selectedStart,
  selectedEnd,
  onSelect,
  weekCount = 12,
  optionsOverride,
  timezone,
  headerLabel,
  prependEntireOption = false,
  allowCustomRange = false,
  className,
  buttonClassName,
  placeholder = 'Select week period',
  disabled = false,
  title,
}: PeriodWeekDropdownProps) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'weeks' | 'custom'>('weeks');
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  const options = useMemo(() => {
    const base = optionsOverride ?? generatePeriodWeekOptions(weekCount, timezone);
    if (prependEntireOption) {
      const entire: PeriodWeekOption = {
        id: ENTIRE_PERIOD_OPTION_ID,
        label: 'Entire selected period',
        startDate: '',
        endDate: '',
      };
      return [entire, ...base];
    }
    return base;
  }, [optionsOverride, weekCount, prependEntireOption, timezone]);

  const matched = useMemo(() => {
    if (prependEntireOption && !selectedStart && !selectedEnd) {
      return options[0];
    }
    return findPeriodWeekOptionByRange(options, selectedStart, selectedEnd);
  }, [prependEntireOption, options, selectedStart, selectedEnd]);

  const isCustomSelected = allowCustomRange && !matched && Boolean(selectedStart && selectedEnd);

  const displayLabel =
    headerLabel && headerLabel.trim().length > 0
      ? headerLabel
      : (matched?.label ??
        (selectedStart && selectedEnd
          ? `${fmtYmd(selectedStart, 'MMM d, yyyy')} – ${fmtYmd(selectedEnd, 'MMM d, yyyy')}`
          : placeholder));

  // Seed calendar when opening custom panel (or when already on a custom selection)
  useEffect(() => {
    if (!open || panel !== 'custom') return;
    setDraftRange({
      from: ymdToDate(selectedStart),
      to: ymdToDate(selectedEnd),
    });
  }, [open, panel, selectedStart, selectedEnd]);

  const close = () => {
    setOpen(false);
    setPanel('weeks');
  };

  const openCustomPanel = () => {
    setDraftRange({
      from: ymdToDate(selectedStart),
      to: ymdToDate(selectedEnd),
    });
    setPanel('custom');
  };

  const applyCustomRange = () => {
    if (!draftRange?.from) return;
    const from = draftRange.from;
    const to = draftRange.to ?? draftRange.from;
    onSelect({
      id: CUSTOM_RANGE_OPTION_ID,
      label: `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`,
      startDate: format(from, 'yyyy-MM-dd'),
      endDate: format(to, 'yyyy-MM-dd'),
    });
    close();
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
            return;
          }
          // Re-open on custom panel when current filter is a non-week range
          setPanel(isCustomSelected ? 'custom' : 'weeks');
          setOpen(true);
        }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
          matched || isCustomSelected
            ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-800 dark:text-indigo-200'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          buttonClassName,
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate max-w-[200px] sm:max-w-[260px]">{displayLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={close} />
          <div
            className={cn(
              'absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800',
              panel === 'custom' ? 'w-auto' : 'w-72 max-h-80',
            )}
            role="listbox"
          >
            {panel === 'weeks' ? (
              <>
                <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Week periods
                  </p>
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {options.map((period) => {
                    const isSel = matched?.id === period.id;
                    return (
                      <button
                        key={period.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => {
                          onSelect(period);
                          close();
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
                            isSel ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                          )}
                        />
                        <span className="font-medium">{period.label}</span>
                      </button>
                    );
                  })}
                </div>
                {allowCustomRange && (
                  <div className="border-t border-slate-100 dark:border-slate-700">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCustomSelected}
                      onClick={openCustomPanel}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold transition-colors',
                        isCustomSelected
                          ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200'
                          : 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/20',
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                      Custom range…
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 space-y-3 min-w-[280px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPanel('weeks')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Weeks
                  </button>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Custom range
                  </p>
                </div>
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  defaultMonth={draftRange?.from ?? ymdToDate(selectedStart) ?? new Date()}
                  selected={draftRange}
                  onSelect={setDraftRange}
                  initialFocus
                />
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    disabled={!draftRange?.from}
                    onClick={applyCustomRange}
                  >
                    Apply
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPanel('weeks')}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
