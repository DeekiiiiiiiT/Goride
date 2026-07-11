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
