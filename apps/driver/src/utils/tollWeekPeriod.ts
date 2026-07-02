import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import type { DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { fleetTzDateKey } from './timezoneDisplay';

/**
 * Monday-start week key + bounds for a row's date.
 *
 * When `timezone` is supplied the row is first collapsed to its fleet-tz
 * calendar day (the day it is displayed under), so week buckets always align
 * with the dates shown on each row. Without a timezone it falls back to the
 * browser-local week (legacy behavior).
 */
function weekBucketForDate(
  d: Date,
  timezone?: string,
): { key: string; weekStart: Date; weekEnd: Date } {
  let dayDate = d;
  if (timezone) {
    const ymd = fleetTzDateKey(d, timezone);
    const parsed = ymd ? parseISO(ymd) : d;
    dayDate = isNaN(parsed.getTime()) ? d : parsed;
  }
  const weekStart = startOfWeek(dayDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(dayDate, { weekStartsOn: 1 });
  return { key: format(weekStart, 'yyyy-MM-dd'), weekStart, weekEnd };
}

/** Parse toll charge date/time (same rules as reconciliation tables). */
export function getTollTransactionDate(tx: FinancialTransaction): Date {
  try {
    // If date already includes a time component, parse as ISO directly.
    if (tx.date && tx.date.includes('T')) {
      const d = parseISO(tx.date);
      return !isNaN(d.getTime()) ? d : new Date(tx.date);
    }
    const timeStr = tx.time || '12:00:00';
    const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
    const localDate = new Date(`${tx.date}T${cleanTime}`);
    return !isNaN(localDate.getTime()) ? localDate : new Date(tx.date);
  } catch {
    return new Date(tx.date);
  }
}

/** Monday 00:00 – Sunday end for the calendar week containing `d` (week starts Monday). */
export function getMondaySundayForDate(d: Date): { start: Date; end: Date } {
  const start = startOfWeek(d, { weekStartsOn: 1 });
  const end = endOfWeek(d, { weekStartsOn: 1 });
  return { start, end };
}

export function formatWeekPeriodLabel(start: Date, end: Date): string {
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export interface TollWeekGroup {
  key: string;
  weekStart: Date;
  weekEnd: Date;
  label: string;
  items: FinancialTransaction[];
}

/** Group toll transactions by Monday–Sunday week; newest weeks first. */
export function groupTollsByWeek(tolls: FinancialTransaction[], timezone?: string): TollWeekGroup[] {
  const map = new Map<string, FinancialTransaction[]>();
  for (const tx of tolls) {
    const d = getTollTransactionDate(tx);
    const { key } = weekBucketForDate(d, timezone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }

  const groups: TollWeekGroup[] = [];
  for (const [key, items] of map) {
    const weekStart = parseISO(key);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    items.sort((a, b) => getTollTransactionDate(a).getTime() - getTollTransactionDate(b).getTime());
    groups.push({
      key,
      weekStart,
      weekEnd,
      label: formatWeekPeriodLabel(weekStart, weekEnd),
      items,
    });
  }
  groups.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  return groups;
}

/** Date used for week grouping — matches Unclaimed Refunds table (`trip.date`). */
export function getTripWeekDate(trip: Trip): Date {
  const d = new Date(trip.date);
  return !isNaN(d.getTime()) ? d : new Date(0);
}

export interface TripWeekGroup {
  key: string;
  weekStart: Date;
  weekEnd: Date;
  label: string;
  items: Trip[];
}

/** Group trips by Monday–Sunday week (by `trip.date`); newest weeks first. */
export function groupTripsByWeek(trips: Trip[], timezone?: string): TripWeekGroup[] {
  const map = new Map<string, Trip[]>();
  for (const trip of trips) {
    const d = getTripWeekDate(trip);
    const { key } = weekBucketForDate(d, timezone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(trip);
  }

  const groups: TripWeekGroup[] = [];
  for (const [key, items] of map) {
    const weekStart = parseISO(key);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    items.sort((a, b) => getTripWeekDate(a).getTime() - getTripWeekDate(b).getTime());
    groups.push({
      key,
      weekStart,
      weekEnd,
      label: formatWeekPeriodLabel(weekStart, weekEnd),
      items,
    });
  }
  groups.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  return groups;
}

/** ISO timestamp on refund — matches Dispute Refunds table column. */
export function getDisputeRefundWeekDate(r: DisputeRefund): Date {
  const d = new Date(r.date);
  return !isNaN(d.getTime()) ? d : new Date(0);
}

export interface DisputeRefundWeekGroup {
  key: string;
  weekStart: Date;
  weekEnd: Date;
  label: string;
  items: DisputeRefund[];
}

/** Group dispute refunds by Monday–Sunday week (`refund.date`); newest weeks first. */
export function groupDisputeRefundsByWeek(refunds: DisputeRefund[], timezone?: string): DisputeRefundWeekGroup[] {
  const map = new Map<string, DisputeRefund[]>();
  for (const r of refunds) {
    const d = getDisputeRefundWeekDate(r);
    const { key } = weekBucketForDate(d, timezone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  const groups: DisputeRefundWeekGroup[] = [];
  for (const [key, items] of map) {
    const weekStart = parseISO(key);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    items.sort((a, b) => getDisputeRefundWeekDate(a).getTime() - getDisputeRefundWeekDate(b).getTime());
    groups.push({
      key,
      weekStart,
      weekEnd,
      label: formatWeekPeriodLabel(weekStart, weekEnd),
      items,
    });
  }
  groups.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  return groups;
}
