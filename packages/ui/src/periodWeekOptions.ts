import { format, startOfWeek, endOfWeek, subWeeks, eachWeekOfInterval, parseISO } from 'date-fns';

export interface PeriodWeekOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

/** Calendar day (yyyy-MM-dd) of `date` in the given IANA timezone. */
function fleetTzYmd(date: Date, timezone: string): string {
  try {
    // en-CA formats as yyyy-MM-dd.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return y && m && d ? `${y}-${m}-${d}` : '';
  } catch {
    return '';
  }
}

/**
 * Monday-start weeks covering [rangeStart, rangeEnd], newest first.
 * Used when week periods should align with a dashboard date range (e.g. fuel tracking).
 */
export function generateWeekOptionsForDateRange(rangeStart: Date, rangeEnd: Date): PeriodWeekOption[] {
  const s = startOfWeek(rangeStart, { weekStartsOn: 1 });
  const e = endOfWeek(rangeEnd, { weekStartsOn: 1 });
  if (s > e) return [];
  const starts = eachWeekOfInterval({ start: s, end: e }, { weekStartsOn: 1 });
  starts.sort((a, b) => b.getTime() - a.getTime());
  return starts.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return {
      id: `w-${weekStart.getTime()}`,
      label: `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    };
  });
}

/**
 * Monday-start weeks, same as Statement Summary / Uber-style reporting weeks.
 *
 * When `timezone` is supplied, "today" is anchored to that timezone's calendar
 * day so the generated week boundaries match the days rows are displayed/grouped
 * under. Falls back to browser-local when omitted.
 */
export function generatePeriodWeekOptions(weekCount = 12, timezone?: string): PeriodWeekOption[] {
  let today = new Date();
  if (timezone) {
    const ymd = fleetTzYmd(today, timezone);
    const parsed = ymd ? parseISO(ymd) : today;
    if (!isNaN(parsed.getTime())) today = parsed;
  }
  const periods: PeriodWeekOption[] = [];

  for (let i = 0; i < weekCount; i++) {
    const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(today, i), { weekStartsOn: 1 });

    periods.push({
      id: `week-${i}`,
      label: `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
    });
  }

  return periods;
}

export function findPeriodWeekOptionByRange(
  options: PeriodWeekOption[],
  startDate?: string,
  endDate?: string,
): PeriodWeekOption | undefined {
  if (!startDate || !endDate) return undefined;
  return options.find((p) => p.startDate === startDate && p.endDate === endDate);
}

export const ENTIRE_PERIOD_OPTION_ID = 'all';
