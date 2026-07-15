/**
 * Bank settled for a week from the same ledger `payout_bank` events the PERIOD
 * modal uses for "Transferred to Bank" — no CSV re-import required.
 */

import { format } from 'date-fns';
import { canonicalEventInSelectedWindow } from './ledgerMoneyAggregate';

export type PayoutBankEventLike = Record<string, unknown>;

export function sumLedgerBankSettledForWeek(
  events: PayoutBankEventLike[] | undefined,
  weekStart: Date,
  weekEnd: Date,
): number {
  if (!events?.length) return 0;
  const startDate = format(weekStart, 'yyyy-MM-dd');
  const endDate = format(weekEnd, 'yyyy-MM-dd');
  let sum = 0;
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    if (String(raw.eventType || '') !== 'payout_bank') continue;
    if (!canonicalEventInSelectedWindow(raw, startDate, endDate)) continue;
    sum += Math.abs(Number(raw.netAmount) || 0);
  }
  return sum;
}
