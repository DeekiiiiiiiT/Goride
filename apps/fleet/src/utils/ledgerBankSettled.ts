/**
 * Bank / cash settled for a week from ledger `payout_bank` / `payout_cash` events.
 *
 * Org/import often stamps periodStart===periodEnd (pay/settlement day). Matching
 * Settlement weeks via canonicalEventInSelectedWindow then piles many batches into
 * whatever Mon–Sun contains that pay day (e.g. $724k on Apr 6). When the period
 * span is degenerate, bucket by event `date` (earliest trip day in the batch) —
 * the real statement-week signal.
 */

import { format } from 'date-fns';
import { weekBucketForDate } from './tollWeekPeriod';

export type PayoutBankEventLike = Record<string, unknown>;

function ymdSlice(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function periodSpanDays(ps: string, pe: string): number {
  const a = new Date(`${ps}T12:00:00.000Z`).getTime();
  const b = new Date(`${pe}T12:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return (b - a) / (24 * 60 * 60 * 1000);
}

/**
 * Which Settlement Mon–Sun week key a payout_bank / payout_cash event belongs to.
 * Proper week-sized period → week of periodStart; otherwise → week of event date.
 */
export function payoutBankEventWeekKey(
  ev: PayoutBankEventLike,
  timezone?: string,
): string | null {
  const ps = ymdSlice(ev.periodStart);
  const pe = ymdSlice(ev.periodEnd);
  const d = ymdSlice(ev.date);
  if (ps && pe) {
    const span = periodSpanDays(ps, pe);
    // Real statement week (~Mon–Sun). Degenerate single-day stamps are pay dates.
    if (span >= 5 && span <= 10) {
      return weekBucketForDate(new Date(`${ps}T12:00:00`), timezone).key;
    }
  }
  if (d) {
    return weekBucketForDate(new Date(`${d}T12:00:00`), timezone).key;
  }
  return null;
}

function sumLedgerPayoutForWeek(
  events: PayoutBankEventLike[] | undefined,
  weekStart: Date,
  timezone: string | undefined,
  eventType: 'payout_bank' | 'payout_cash',
): number {
  if (!events?.length) return 0;
  const weekKey = format(weekStart, 'yyyy-MM-dd');
  let sum = 0;
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    if (String(raw.eventType || '') !== eventType) continue;
    const eventWeek = payoutBankEventWeekKey(raw, timezone);
    if (!eventWeek || eventWeek !== weekKey) continue;
    sum += Math.abs(Number(raw.netAmount) || 0);
  }
  return sum;
}

export function sumLedgerBankSettledForWeek(
  events: PayoutBankEventLike[] | undefined,
  weekStart: Date,
  _weekEnd: Date,
  timezone?: string,
): number {
  return sumLedgerPayoutForWeek(events, weekStart, timezone, 'payout_bank');
}

/** Uber Cash Collected for the week — same PERIOD SSOT as Transferred to Bank. */
export function sumLedgerCashCollectedForWeek(
  events: PayoutBankEventLike[] | undefined,
  weekStart: Date,
  _weekEnd: Date,
  timezone?: string,
): number {
  return sumLedgerPayoutForWeek(events, weekStart, timezone, 'payout_cash');
}
