import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { fleetTzDateKey, ymdToLocalDate } from './timezoneDisplay';

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
    const parsed = ymd ? ymdToLocalDate(ymd) : d;
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

export interface WeekGroup<T> {
  key: string;
  weekStart: Date;
  weekEnd: Date;
  label: string;
  items: T[];
}

/** Group any date-bearing rows by Monday–Sunday week; newest weeks first. */
export function groupByWeek<T extends { date: string }>(rows: T[], timezone?: string): WeekGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const d = new Date(row.date);
    const validDate = !isNaN(d.getTime()) ? d : new Date(0);
    const { key } = weekBucketForDate(validDate, timezone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const groups: WeekGroup<T>[] = [];
  for (const [key, items] of map) {
    const weekStart = parseISO(key);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    groups.push({ key, weekStart, weekEnd, label: formatWeekPeriodLabel(weekStart, weekEnd), items });
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

/**
 * Single source of truth for "is this dispute refund matched" — mirrors
 * `DisputeRefundsList.tsx`'s own status check exactly. Every driver-financial
 * surface (Payout, Settlement, Expenses) must use this, not a hand-copied
 * re-implementation, so the counting rule can never silently drift between
 * views the way the toll-reconciliation counts already have.
 */
export function isDisputeRefundMatched(r: Pick<DisputeRefund, 'status'>): boolean {
  return r.status === 'matched' || r.status === 'auto_resolved';
}

/**
 * Matched/unmatched dispute-refund counts for a single period, bucketed by
 * the refund's OWN `date` — never its matched toll's date — so this always
 * agrees with the Dispute Refunds tab's own week grouping (`groupDisputeRefundsByWeek`,
 * above) about which period a given refund belongs to.
 */
export function computeDisputeRefundCounts(
  disputeRefunds: DisputeRefund[],
  periodStart: Date,
  periodEnd: Date,
): { matched: number; unmatched: number } {
  const startTime = periodStart.getTime();
  const endTime = periodEnd.getTime();
  let matched = 0;
  let unmatched = 0;
  for (const r of disputeRefunds) {
    const d = getDisputeRefundWeekDate(r).getTime();
    if (d < startTime || d > endTime) continue;
    if (isDisputeRefundMatched(r)) matched++;
    else unmatched++;
  }
  return { matched, unmatched };
}

/**
 * Which week a claim belongs to — needed because a claim's own `date` isn't
 * always set (see Phase F1's backfill) and its resolution timestamp
 * (`createdAt`) is NOT the same thing as when the underlying toll happened.
 * Fallback chain, in priority order: `claim.date` → the linked toll's date
 * (via the optional `tollDateById` map, keyed by `transactionId`) →
 * `claim.tripDate` → `claim.createdAt`. Returns epoch if nothing parses, same
 * "unparseable → oldest bucket" convention `getDisputeRefundWeekDate`/
 * `groupByWeek` already use.
 */
export function getClaimWeekDate(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate' | 'createdAt'>,
  tollDateById?: Map<string, string>,
): Date {
  const anchor = getClaimPeriodAnchorDate(claim, tollDateById);
  if (anchor) return new Date(anchor);
  if (claim.createdAt) {
    const d = new Date(claim.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}

/**
 * Strict claim date for period-scoped UI — toll/claim/trip dates only.
 * Never uses createdAt (resolution time), which can bucket claims into the wrong week.
 */
export function getClaimPeriodAnchorDate(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  tollDateById?: Map<string, string>,
): string | null {
  const candidates: (string | undefined)[] = [
    claim.date,
    claim.transactionId ? tollDateById?.get(claim.transactionId) : undefined,
    claim.tripDate,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return candidate;
  }
  return null;
}

/** True when a claim's toll/claim/trip anchor falls inside [startDate, endDate] (fleet tz). */
export function isClaimInPeriod(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  period: { startDate: string; endDate: string },
  tollDateById: Map<string, string> | undefined,
  fleetTz: string,
): boolean {
  const anchor = getClaimPeriodAnchorDate(claim, tollDateById);
  if (!anchor) return false;
  const ymd = fleetTzDateKey(anchor, fleetTz);
  if (!ymd) return false;
  return ymd >= period.startDate && ymd <= period.endDate;
}
