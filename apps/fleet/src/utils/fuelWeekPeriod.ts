/**
 * Fleet-timezone Monday–Sunday weeks for Consumption Reconciliation.
 * Period id = Monday yyyy-MM-dd (same contract as toll).
 */

import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import {
  generatePeriodWeekOptions,
  generateWeekOptionsForDateRange,
  type PeriodWeekOption,
} from './periodWeekOptions';
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

/** Filter any dated items into an inclusive fuel week using calendar YMD. */
export function entriesInFuelWeek<T extends { date?: string | null }>(
  items: T[],
  startYmd: string,
  endYmd: string,
): T[] {
  return items.filter((item) => isEntryInInclusiveYmdRange(item.date, startYmd, endYmd));
}

/**
 * Current Mon–Sun statement week in fleet timezone (falls back to browser local).
 * Same Monday identity as PeriodWeekDropdown options.
 */
export function currentFuelWeekRange(timezone?: string): { from: Date; to: Date } {
  const bucket = fuelWeekBucketForDate(new Date(), timezone);
  return { from: bucket.weekStart, to: bucket.weekEnd };
}

/**
 * Earliest recon Monday from real fuel activity (entries + finalized weeks).
 * Falls back to the current Monday when there is no history yet — never a hard-coded launch date.
 */
export function resolveFuelActivityEarliestMonday(
  entryDates: Array<string | Date | null | undefined>,
  finalizedWeekStarts: Array<string | null | undefined> = [],
  timezone?: string,
  asOf: Date = new Date(),
): string {
  let earliestYmd = '';
  for (const raw of entryDates) {
    const ymd = toEntryYmd(raw);
    if (!ymd) continue;
    if (!earliestYmd || ymd < earliestYmd) earliestYmd = ymd;
  }
  for (const raw of finalizedWeekStarts) {
    const ymd = toEntryYmd(raw);
    if (!ymd) continue;
    if (!earliestYmd || ymd < earliestYmd) earliestYmd = ymd;
  }
  if (!earliestYmd) {
    return fuelWeekBucketForDate(asOf, timezone).key;
  }
  return fuelWeekBucketForDate(ymdToLocalDate(earliestYmd), timezone).key;
}

/**
 * Consumption Reconciliation week list: first activity Monday → today (fleet TZ).
 * Empty pre-ops weeks are not offered.
 */
export function buildFuelReconciliationWeekOptions(
  earliestMondayYmd: string,
  timezone?: string,
  asOf: Date = new Date(),
): PeriodWeekOption[] {
  const today = timezone ? ymdToLocalDate(fleetTzDateKey(asOf, timezone)) : asOf;
  const start = ymdToLocalDate(String(earliestMondayYmd).split('T')[0]);
  if (isNaN(start.getTime())) {
    return generateWeekOptionsForDateRange(today, today);
  }
  return generateWeekOptionsForDateRange(start, today);
}

/**
 * Finalize / lock identity: same driver + Monday YMD only.
 * Never match on vehicleId alone (shared-car safe).
 */
export function isSameFuelStatement(
  a: { driverId?: string; weekStart: string; weekEnd?: string },
  b: { driverId?: string; weekStart: string; weekEnd?: string },
): boolean {
  if (!a.driverId || !b.driverId || a.driverId !== b.driverId) return false;
  return reportWeekYmdBounds(a).start === reportWeekYmdBounds(b).start;
}
