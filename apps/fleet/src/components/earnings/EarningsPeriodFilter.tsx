import { useMemo, useState } from 'react';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import {
  generatePeriodWeekOptions,
  findPeriodWeekOptionByRange,
  type PeriodWeekOption,
} from '../../utils/periodWeekOptions';

const SETTLEMENT_WINDOW_COUNT = 8;
/** Uber-style display: settlement windows open/close in the early morning. */
const SETTLEMENT_DISPLAY_HOUR = 4;
const SETTLEMENT_DISPLAY_MINUTE = 0;

export type EarningsPeriodValue = {
  startDate: string;
  endDate: string;
};

type Props = {
  value: EarningsPeriodValue;
  onChange: (next: EarningsPeriodValue) => void;
  className?: string;
};

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Monday 4:00 AM → next Monday 4:00 AM display labels (API still uses Mon–Sun dates). */
function formatSettlementWindowLabel(startDate: string, endDate: string): string {
  const start = ymdToLocalDate(startDate);
  start.setHours(SETTLEMENT_DISPLAY_HOUR, SETTLEMENT_DISPLAY_MINUTE, 0, 0);
  // Statement weeks end Sunday; settlement window closes Monday morning after.
  const end = addDays(ymdToLocalDate(endDate), 1);
  end.setHours(SETTLEMENT_DISPLAY_HOUR, SETTLEMENT_DISPLAY_MINUTE, 0, 0);
  const stamp = (d: Date) => format(d, 'dd/MM/yyyy hh:mm a');
  return `${stamp(start)} - ${stamp(end)}`;
}

function formatCustomRangeLabel(startDate: string, endDate: string): string {
  const start = ymdToLocalDate(startDate);
  start.setHours(0, 0, 0, 0);
  const end = ymdToLocalDate(endDate);
  end.setHours(23, 59, 0, 0);
  const stamp = (d: Date) => format(d, 'dd/MM/yyyy hh:mm a');
  return `${stamp(start)} - ${stamp(end)}`;
}

export function generateEarningsSettlementWindows(
  count = SETTLEMENT_WINDOW_COUNT,
): PeriodWeekOption[] {
  return generatePeriodWeekOptions(count).map((w) => ({
    ...w,
    label: formatSettlementWindowLabel(w.startDate, w.endDate),
  }));
}

export function EarningsPeriodFilter({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'settlement' | 'custom'>('settlement');
  const [listOpen, setListOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  const windows = useMemo(() => generateEarningsSettlementWindows(), []);

  const matched = useMemo(
    () => findPeriodWeekOptionByRange(windows, value.startDate, value.endDate),
    [windows, value.startDate, value.endDate],
  );

  const triggerLabel = matched
    ? matched.label
    : value.startDate && value.endDate
      ? formatCustomRangeLabel(value.startDate, value.endDate)
      : 'Select period';

  const applyCustom = () => {
    if (!draftRange?.from) return;
    const from = draftRange.from;
    const to = draftRange.to ?? draftRange.from;
    onChange({
      startDate: format(from, 'yyyy-MM-dd'),
      endDate: format(to, 'yyyy-MM-dd'),
    });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTab(matched ? 'settlement' : 'custom');
          setListOpen(false);
          setDraftRange({
            from: value.startDate ? ymdToLocalDate(value.startDate) : undefined,
            to: value.endDate ? ymdToLocalDate(value.endDate) : undefined,
          });
        } else {
          setListOpen(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-10 max-w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate font-medium tabular-nums">
            {triggerLabel}
          </span>
          <CalendarIcon className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(100vw-2rem,420px)] border-slate-200 p-0 shadow-lg dark:border-slate-700"
      >
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => {
              setTab('settlement');
              setListOpen(false);
            }}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              tab === 'settlement'
                ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-50'
                : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            Settlement window
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('custom');
              setListOpen(false);
            }}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              tab === 'custom'
                ? 'border-b-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-50'
                : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            Custom range
          </button>
        </div>

        {tab === 'settlement' ? (
          <div className="p-3">
            <button
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-200 bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <span className="min-w-0 flex-1 truncate tabular-nums text-slate-800 dark:text-slate-100">
                {matched?.label ?? 'Select a settlement window'}
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                  listOpen && 'rotate-180',
                )}
              />
            </button>

            {listOpen ? (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                {windows.map((period) => {
                  const selected = matched?.id === period.id;
                  return (
                    <button
                      key={period.id}
                      type="button"
                      onClick={() => {
                        onChange({
                          startDate: period.startDate,
                          endDate: period.endDate,
                        });
                        setListOpen(false);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center border-b border-slate-100 px-3 py-2.5 text-left text-xs tabular-nums last:border-b-0 dark:border-slate-800',
                        selected
                          ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-50'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50',
                      )}
                    >
                      {period.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <Calendar
              mode="range"
              numberOfMonths={1}
              defaultMonth={draftRange?.from ?? (value.startDate ? ymdToLocalDate(value.startDate) : new Date())}
              selected={draftRange}
              onSelect={setDraftRange}
              initialFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9 flex-1"
                disabled={!draftRange?.from}
                onClick={applyCustom}
              >
                Apply range
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Default = most recent settlement window (this week). */
export function initialEarningsPeriod(): EarningsPeriodValue {
  const week = generateEarningsSettlementWindows(1)[0];
  return {
    startDate: week?.startDate ?? format(new Date(), 'yyyy-MM-dd'),
    endDate: week?.endDate ?? format(new Date(), 'yyyy-MM-dd'),
  };
}
