/**
 * Close Week year → week picker helpers.
 * Weeks are Monday anchors (yyyy-MM-dd). Close is only for fully ended weeks.
 */
import {
  addDays,
  eachDayOfInterval,
  endOfYear,
  format,
  getYear,
  isMonday,
  parseISO,
  startOfWeek,
  startOfYear,
  subWeeks,
} from 'date-fns';

const EARLIEST_CLOSE_YEAR = 2024;

/** Years newest-first: current down to EARLIEST_CLOSE_YEAR. */
export function closeWeekYearOptions(now = new Date()): number[] {
  const current = getYear(now);
  const start = Math.min(EARLIEST_CLOSE_YEAR, current);
  const years: number[] = [];
  for (let y = current; y >= start; y -= 1) years.push(y);
  return years;
}

/**
 * Monday week keys in `year`, newest first.
 * Includes the current week Monday when year === current year; never future Mondays.
 */
export function mondayWeekKeysForYear(year: number, now = new Date()): string[] {
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 0, 1));
  const rangeEnd = thisMonday < yearEnd ? thisMonday : yearEnd;

  if (rangeEnd < yearStart) return [];

  const days = eachDayOfInterval({ start: yearStart, end: rangeEnd });
  const mondays = days
    .filter((d) => isMonday(d))
    .map((d) => format(d, 'yyyy-MM-dd'))
    .reverse();
  return mondays;
}

/** Default: last fully completed week (previous Monday). */
export function defaultCloseWeekKey(now = new Date()): string {
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  return format(subWeeks(thisMonday, 1), 'yyyy-MM-dd');
}

/** True when the settlement week has ended (Sunday before today, or older). */
export function isCloseWeekEnded(weekKey: string, now = new Date()): boolean {
  try {
    const start = parseISO(`${weekKey.slice(0, 10)}T12:00:00`);
    const periodEnd = addDays(start, 6);
    // End of period day must be before "today" start — current in-progress week is not closable.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return periodEnd < todayStart;
  } catch {
    return false;
  }
}

export function yearFromWeekKey(weekKey: string): number {
  const y = Number(String(weekKey || '').slice(0, 4));
  return Number.isFinite(y) ? y : getYear(new Date());
}
