import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { fleetTzDateKey, ymdToLocalDate } from './timezoneDisplay';
import { getTollTransactionDate } from './tollDate';
import { VARIANCE_THRESHOLD } from './tollReconciliation';
import { dateWeekKey } from './fleetMondayWeekKey';

export {
  isDisputeRefundMatched,
  isTollCoveredByDisputeRefund,
  isVisiblePartialShortfallClaim,
  isActionablePartialShortfall,
  hasMatchedDisputeRefund,
  isDisputeRefundInWizardPeriod,
  disputeRefundPeriodWeekKey,
} from './tollPeriodDisputeHelpers';

/** Edge-safe Monday week key (shared with unlinked shortfall scoring). */
export { dateWeekKey };

/**
 * Monday-start week key + bounds for a row's date.
 *
 * When `timezone` is supplied the row is first collapsed to its fleet-tz
 * calendar day (the day it is displayed under), so week buckets always align
 * with the dates shown on each row. Without a timezone it falls back to the
 * browser-local week (legacy behavior).
 */
export function weekBucketForDate(
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

/** The single entry point for toll date parsing (see `./tollDate`). */
export { parseTollDate, getTollTransactionDate } from './tollDate';

/** Monday 00:00 – Sunday end for the calendar week containing `d` (week starts Monday). */
export function getMondaySundayForDate(d: Date): { start: Date; end: Date } {
  const start = startOfWeek(d, { weekStartsOn: 1 });
  const end = endOfWeek(d, { weekStartsOn: 1 });
  return { start, end };
}

export function formatWeekPeriodLabel(start: Date, end: Date): string {
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

/** Loose match for typed confirmation (hyphen vs en-dash, extra spaces). */
export function periodConfirmLabelsMatch(typed: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[-–—]/g, '-');
  return norm(typed) === norm(expected);
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

/**
 * Period visibility for dispute refunds — mirrors period_reset inventory:
 * toll-first when matched to a period toll, else refund-date week key.
 */

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
 * Strict claim date for period-scoped UI — linked toll date first, then claim/trip.
 * Never uses createdAt (resolution time), which can bucket claims into the wrong week.
 */
export function getClaimPeriodAnchorDate(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  tollDateById?: Map<string, string>,
): string | null {
  const candidates: (string | undefined)[] = [
    claim.transactionId ? tollDateById?.get(claim.transactionId) : undefined,
    claim.date,
    claim.tripDate,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return candidate;
  }
  return null;
}

/** Monday-start week key for a claim (matches period landing `period.id`). */
export function claimPeriodWeekKey(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  tollDateById: Map<string, string> | undefined,
  fleetTz: string,
): string | null {
  const anchor = getClaimPeriodAnchorDate(claim, tollDateById);
  if (!anchor) return null;
  const ymd = fleetTzDateKey(anchor, fleetTz);
  if (!ymd) return null;
  const d = ymdToLocalDate(ymd);
  if (isNaN(d.getTime())) return null;
  return weekBucketForDate(d, fleetTz).key;
}

/** Human-readable week label for a claim row (toll-first anchor). */
export function formatClaimPeriodLabel(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  tollDateById?: Map<string, string>,
): string {
  const anchor = getClaimPeriodAnchorDate(claim, tollDateById);
  if (!anchor) return 'Unknown';
  // Date-only anchors must use local calendar midnight — `new Date('yyyy-MM-dd')`
  // is UTC and shifts Mon Jun 29 → Sun Jun 28 in US timezones (wrong prior week).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? ymdToLocalDate(anchor) : new Date(anchor);
  if (isNaN(d.getTime())) return 'Unknown';
  const { start, end } = getMondaySundayForDate(d);
  return formatWeekPeriodLabel(start, end);
}

/** Monday-start week key for a toll row (matches period landing `period.id`). */
export function tollWeekKey(
  tx: Pick<FinancialTransaction, 'date' | 'time'>,
  timezone?: string,
): string {
  // Date-only ledger days: week from calendar date (matches server fleetTzDay slice).
  // Avoids AM/PM parse failures + UTC midnight shifting Mon → prior Sunday week.
  const dateStr = String(tx.date || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return weekBucketForDate(ymdToLocalDate(dateStr), timezone).key;
  }
  const d = getTollTransactionDate(tx as FinancialTransaction);
  return weekBucketForDate(d, timezone).key;
}

/** True when a toll belongs to the same Monday-start week as the wizard period. */
export function isTollInWizardPeriod(
  tx: Pick<FinancialTransaction, 'date' | 'time'>,
  periodWeekKey: string,
  timezone?: string,
): boolean {
  return tollWeekKey(tx, timezone) === periodWeekKey;
}

/** Keep only tolls whose week key matches the active wizard period. */
export function filterTollsToWizardPeriod<T extends Pick<FinancialTransaction, 'date' | 'time'>>(
  tolls: readonly T[],
  periodWeekKey: string,
  fleetTz: string,
): T[] {
  return tolls.filter((tx) => isTollInWizardPeriod(tx, periodWeekKey, fleetTz));
}

/** Keep only claims whose toll-first anchor week matches the wizard period. */
export function filterClaimsToWizardPeriod(
  claims: readonly Claim[],
  period: { startDate: string; endDate: string },
  tollDateById: Map<string, string> | undefined,
  fleetTz: string,
): Claim[] {
  return claims.filter((c) => isClaimVisibleInPeriod(c, period, tollDateById, fleetTz));
}

export type TollPeriodAssertResult =
  | { ok: true }
  | { ok: false; weekLabel: string };

/** Guard before period-scoped mutations (charge, write-off, send to driver). */
export function assertTollInWizardPeriod(
  tx: Pick<FinancialTransaction, 'date' | 'time'>,
  periodWeekKey: string,
  fleetTz: string,
): TollPeriodAssertResult {
  if (isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) return { ok: true };
  const d = getTollTransactionDate(tx as FinancialTransaction);
  const { start, end } = getMondaySundayForDate(d);
  return { ok: false, weekLabel: formatWeekPeriodLabel(start, end) };
}

/** Human-readable week label for a toll row. */
export function formatTollPeriodLabel(
  tx: Pick<FinancialTransaction, 'date' | 'time'>,
  fleetTz?: string,
): string {
  const d = getTollTransactionDate(tx as FinancialTransaction);
  if (isNaN(d.getTime())) return 'Unknown';
  const { start, end } = getMondaySundayForDate(d);
  return formatWeekPeriodLabel(start, end);
}

/** Monday-start week key for any date-ish string (trip, toll, claim).
 *  Implementation lives in fleetMondayWeekKey.ts (Deno Edge-safe). */

/** Human-readable Mon–Sun label for a date-ish string. */
export function formatDateWeekLabel(
  dateStr: string | undefined | null,
  fleetTz?: string,
): string | null {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  if (!raw) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? ymdToLocalDate(raw)
    : new Date(raw);
  if (isNaN(d.getTime())) return null;
  const { start, end } = fleetTz
    ? (() => {
        const key = dateWeekKey(raw, fleetTz);
        if (!key) return getMondaySundayForDate(d);
        const startD = ymdToLocalDate(key);
        return { start: startD, end: endOfWeek(startD, { weekStartsOn: 1 }) };
      })()
    : getMondaySundayForDate(d);
  return formatWeekPeriodLabel(start, end);
}

/**
 * True when a refund/credit date and the underpaid toll/claim date fall in
 * different Mon–Sun fleet weeks — Apply to underpaid crossed period boundaries.
 */
export function isCrossPeriodCoverage(
  sourceDate: string | undefined | null,
  targetDate: string | undefined | null,
  fleetTz: string,
): boolean {
  const a = dateWeekKey(sourceDate, fleetTz);
  const b = dateWeekKey(targetDate, fleetTz);
  if (!a || !b) return false;
  return a !== b;
}

export type CrossPeriodCoverageInfo = {
  sourceWeekKey: string;
  targetWeekKey: string;
  sourceWeekLabel: string;
  targetWeekLabel: string;
};

/** Details for UI badges when apply spans two recon weeks. */
export function getCrossPeriodCoverage(
  sourceDate: string | undefined | null,
  targetDate: string | undefined | null,
  fleetTz: string,
): CrossPeriodCoverageInfo | null {
  if (!isCrossPeriodCoverage(sourceDate, targetDate, fleetTz)) return null;
  const sourceWeekKey = dateWeekKey(sourceDate, fleetTz)!;
  const targetWeekKey = dateWeekKey(targetDate, fleetTz)!;
  return {
    sourceWeekKey,
    targetWeekKey,
    sourceWeekLabel: formatDateWeekLabel(sourceDate, fleetTz) || sourceWeekKey,
    targetWeekLabel: formatDateWeekLabel(targetDate, fleetTz) || targetWeekKey,
  };
}

/**
 * Toll IDs scoped to the active wizard week — date-filtered rows plus same-week
 * reconciled tolls the API date filter may drop. Never includes all-time history.
 */
export function buildPeriodTollIdSet(
  unreconciled: FinancialTransaction[],
  reconciled: FinancialTransaction[],
  allReconciled: FinancialTransaction[],
  periodWeekKey: string,
  fleetTz: string,
): Set<string> {
  const ids = new Set<string>();
  for (const tx of [...unreconciled, ...reconciled]) {
    if (tx?.id) ids.add(tx.id);
  }
  for (const tx of allReconciled) {
    if (tx?.id && isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) {
      ids.add(tx.id);
    }
  }
  return ids;
}

/** True when a claim is Open with credits applied and a remaining shortfall. */
export function isOpenPartialClaim(
  claim: Pick<Claim, 'status' | 'paidAmount' | 'amount'> | null | undefined,
): boolean {
  if (!claim || claim.status !== 'Open') return false;
  return (
    (Number(claim.paidAmount) || 0) > VARIANCE_THRESHOLD &&
    (Number(claim.amount) || 0) > VARIANCE_THRESHOLD
  );
}

/**
 * Partial shortfall still owed — Open claims OR wrongly auto-Resolved after
 * unlinked apply left amount > 0 (logs: f1bc030a toll, Resolved, paid 275, amt 10).
 */

/** True when a matched dispute refund is linked to this claim's toll. */

/**
 * True when a matched dispute has settled this toll — no shortfall left to act on.
 * A partial dispute credit (Open claim still has amount remaining) is NOT covered.
 */

/**
 * Partial shortfall rows visible in Underpaid → Partially Covered.
 * Excludes tolls already closed by a matched dispute refund.
 * Open claims always list here (fleet still decides) unless a dispute covers them.
 */

/** True when a claim's toll-first anchor week matches the wizard period week key. */
export function isClaimInPeriod(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  period: { startDate: string; endDate: string },
  tollDateById: Map<string, string> | undefined,
  fleetTz: string,
): boolean {
  const weekKey = claimPeriodWeekKey(claim, tollDateById, fleetTz);
  if (!weekKey) return false;
  return weekKey === period.startDate;
}

/** Wizard period visibility — strict week-key match on toll-first anchor. */
export function isClaimVisibleInPeriod(
  claim: Pick<Claim, 'date' | 'transactionId' | 'tripDate'>,
  period: { startDate: string; endDate: string },
  tollDateById: Map<string, string> | undefined,
  fleetTz: string,
  _periodTollIds?: ReadonlySet<string>,
): boolean {
  return isClaimInPeriod(claim, period, tollDateById, fleetTz);
}
