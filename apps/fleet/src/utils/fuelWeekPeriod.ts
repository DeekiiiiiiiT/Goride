/**
 * Fleet-timezone Monday–Sunday weeks for Consumption Reconciliation.
 * Period id = Monday yyyy-MM-dd (same contract as toll).
 */

import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { generatePeriodWeekOptions, type PeriodWeekOption } from './periodWeekOptions';
import { fleetTzDateKey, ymdToLocalDate } from './timezoneDisplay';
import { formatWeekPeriodLabel, periodConfirmLabelsMatch } from './tollWeekPeriod';

export { formatWeekPeriodLabel, periodConfirmLabelsMatch };
export type { PeriodWeekOption };

/** Monday key + Mon–Sun bounds for a calendar day (fleet TZ when provided). */
export function fuelWeekBucketForDate(
  d: Date,
  timezone?: string,
): { key: string; weekStart: Date; weekEnd: Date; label: string } {
  let dayDate = d;
  if (timezone) {
    const ymd = fleetTzDateKey(d, timezone);
    const parsed = ymd ? ymdToLocalDate(ymd) : d;
    dayDate = isNaN(parsed.getTime()) ? d : parsed;
  }
  const weekStart = startOfWeek(dayDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(dayDate, { weekStartsOn: 1 });
  return {
    key: format(weekStart, 'yyyy-MM-dd'),
    weekStart,
    weekEnd,
    label: formatWeekPeriodLabel(weekStart, weekEnd),
  };
}

/** Stable period id from a Monday yyyy-MM-dd (or ISO timestamp). */
export function fuelPeriodIdFromWeekStart(weekStart: string): string {
  return String(weekStart).split('T')[0];
}

export function fuelWeekBoundsFromPeriodId(periodId: string): {
  startDate: string;
  endDate: string;
  weekStart: Date;
  weekEnd: Date;
  label: string;
} {
  const key = fuelPeriodIdFromWeekStart(periodId);
  const weekStart = parseISO(key);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  return {
    startDate: key,
    endDate: format(weekEnd, 'yyyy-MM-dd'),
    weekStart,
    weekEnd,
    label: formatWeekPeriodLabel(weekStart, weekEnd),
  };
}

/** Rolling week options anchored to fleet timezone (default 16 weeks). */
export function generateFuelWeekOptions(weekCount = 16, timezone?: string): PeriodWeekOption[] {
  return generatePeriodWeekOptions(weekCount, timezone).map((o) => ({
    ...o,
    id: o.startDate, // period id = Monday yyyy-MM-dd
  }));
}

/** True when entry date (yyyy-MM-dd) falls in [startDate, endDate] inclusive. */
export function isYmdInFuelWeek(ymd: string, startDate: string, endDate: string): boolean {
  const d = String(ymd).split('T')[0];
  return d >= startDate && d <= endDate;
}

/** Calendar day YYYY-MM-DD from entry/adjustment date strings or Date objects. */
export function toEntryYmd(date: string | Date | undefined | null): string {
  if (date == null) return '';
  if (typeof date === 'string') {
    return date.split('T')[0]?.split(' ')[0] || '';
  }
  if (date instanceof Date && !isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

/** Inclusive week/range check using calendar YMD (safe for ISO timestamps). */
export function isEntryInInclusiveYmdRange(
  entryDate: string | Date | undefined | null,
  startYmd: string,
  endYmd: string,
): boolean {
  if (!startYmd || !endYmd) return true;
  const d = toEntryYmd(entryDate);
  if (!d) return false;
  return d >= startYmd && d <= endYmd;
}

/**
 * Normalize report week bounds to local YYYY-MM-DD.
 * Accepts legacy ISO timestamps (weekStart.toISOString()) and new YMD storage.
 */
export function reportWeekYmdBounds(report: {
  weekStart: string;
  weekEnd?: string;
}): { start: string; end: string } {
  const start = toEntryYmd(report.weekStart);
  const end = report.weekEnd ? toEntryYmd(report.weekEnd) : start;
  return { start, end };
}
