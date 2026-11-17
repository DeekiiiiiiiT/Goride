/**
 * WRA-66 / D4: Tier month-to-date = sum of full-week fares for every Monday anchor
 * in the same calendar month as this week's anchor, through and including this week.
 */
import type { LedgerFareLike } from './periodShareCash.ts';
import { fleetCalendarDay, DEFAULT_FLEET_TZ, periodEndForAnchor } from './periodKey.ts';
import { isLedgerReversal } from './platformFeeRecognition.ts';
import { round2 } from './money.ts';

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function fareGrossForTier(e: LedgerFareLike): number {
  const magnitude = Number.isFinite(e.grossAmount)
    ? Math.abs(Number(e.grossAmount))
    : Math.abs(Number(e.netAmount) || 0);
  return isLedgerReversal(e) ? -magnitude : magnitude;
}

function dayKey(d: string | undefined, timezone: string): string {
  return fleetCalendarDay(String(d || ''), timezone);
}

/** Gross fare revenue for one Mon–Sun week (fleet calendar days). */
export function sumWeekFareGross(
  fareEntries: LedgerFareLike[],
  periodAnchor: string,
  periodEnd: string,
  timezone: string = DEFAULT_FLEET_TZ,
): number {
  return fareEntries.reduce((s, e) => {
    const d = dayKey(e.date, timezone);
    if (d >= periodAnchor && d <= periodEnd) return s + fareGrossForTier(e);
    return s;
  }, 0);
}

/** Monday anchors in `periodAnchor`'s month from the first Monday in that month through `periodAnchor`. */
export function mondayAnchorsInMonthThrough(periodAnchor: string): string[] {
  const anchor = String(periodAnchor || '').slice(0, 10);
  const month = anchor.slice(0, 7);
  const collected: string[] = [];
  let cursor = anchor;
  while (cursor.slice(0, 7) === month) {
    collected.push(cursor);
    cursor = addDaysYmd(cursor, -7);
  }
  return collected.reverse();
}

export function computeTierMonthToDateFares(params: {
  fareEntries: LedgerFareLike[];
  periodAnchor: string;
  timezone?: string;
}): number {
  const timezone = params.timezone ?? DEFAULT_FLEET_TZ;
  const anchor = String(params.periodAnchor || '').slice(0, 10);
  let total = 0;
  for (const weekAnchor of mondayAnchorsInMonthThrough(anchor)) {
    const weekEnd = periodEndForAnchor(weekAnchor);
    total += sumWeekFareGross(params.fareEntries, weekAnchor, weekEnd, timezone);
  }
  return round2(total);
}

/** Pre-WRA-66 calendar logic (1st of anchor month through this week's Sunday) — for correction preview only. */
export function computeTierMonthToDateFaresCalendarLegacy(params: {
  fareEntries: LedgerFareLike[];
  periodAnchor: string;
  periodEnd: string;
  timezone?: string;
}): number {
  const timezone = params.timezone ?? DEFAULT_FLEET_TZ;
  const mStart = `${String(params.periodAnchor || '').slice(0, 7)}-01`;
  const periodEnd = String(params.periodEnd || '').slice(0, 10);
  const total = params.fareEntries.reduce((s, e) => {
    const d = dayKey(e.date, timezone);
    if (d >= mStart && d <= periodEnd) return s + fareGrossForTier(e);
    return s;
  }, 0);
  return round2(total);
}

export function computeTierMonthToDateFromTrips<T>(params: {
  trips: T[];
  periodAnchor: string;
  tripEarnings: (trip: T) => number;
  tripDate: (trip: T) => string | undefined;
  timezone?: string;
}): number {
  const fareEntries: LedgerFareLike[] = (params.trips || []).map((t) => ({
    date: params.tripDate(t),
    eventType: 'fare_earning',
    grossAmount: params.tripEarnings(t),
  }));
  return computeTierMonthToDateFares({
    fareEntries,
    periodAnchor: params.periodAnchor,
    timezone: params.timezone,
  });
}