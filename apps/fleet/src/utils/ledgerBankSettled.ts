/**
 * Bank / cash settled for a week from ledger `payout_bank` / `payout_cash` events.
 * Week assignment: ADR 0007 `periodKeyFor` on posting `date` (America/Jamaica).
 */

import { format } from 'date-fns';
import { periodKeyFor, DEFAULT_FLEET_TZ } from '@roam/finance-core';

export type PayoutBankEventLike = Record<string, unknown>;

function ymdSlice(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Which Settlement Mon–Sun week key a payout_bank / payout_cash event belongs to.
 */
export function payoutBankEventWeekKey(
  ev: PayoutBankEventLike,
  timezone?: string,
): string | null {
  const date = ymdSlice(ev.date) || ymdSlice(ev.periodStart);
  if (!date) return null;
  return periodKeyFor(date, timezone || DEFAULT_FLEET_TZ);
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
