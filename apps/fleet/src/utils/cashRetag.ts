/**
 * Fleet Ops Cash Retag — Settlement Week tags for historical Log Cash.
 * Writes only workPeriod metadata; Cash Returned recomputes from existing SSOT.
 */

import { addDays, format, parseISO } from 'date-fns';
import type { FinancialTransaction } from '../types/data';
import {
  cashPaymentWeekKey,
  isClearedDriverCashPayment,
  isDriverCashPaymentTransaction,
} from './driverCashPayment';
import { weekBucketForDate } from './tollWeekPeriod';

export type CashRetagCandidate = {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  date: string;
  paymentMethod?: string;
  status?: string;
  currentWeekYmd: string | null;
  suggestedWeekYmd: string;
  description?: string;
};

export type CashRetagPreviewRow = CashRetagCandidate & {
  newWeekYmd: string;
  willReplaceExistingTag: boolean;
};

/** Monday yyyy-MM-dd from payment date (fleet tz when provided). */
export function suggestWeekFromPaymentDate(
  dateStr: string,
  timezone?: string,
): string {
  const day = String(dateStr || '').split('T')[0];
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T12:00:00`)
    : new Date(dateStr);
  return weekBucketForDate(isNaN(d.getTime()) ? new Date() : d, timezone).key;
}

export function listCashRetagCandidates(
  transactions: FinancialTransaction[],
  driverNameById: Record<string, string>,
  options?: {
    timezone?: string;
    /** When false (default), only untagged cleared cash. */
    includeTagged?: boolean;
    driverId?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): CashRetagCandidate[] {
  const includeTagged = options?.includeTagged === true;
  const out: CashRetagCandidate[] = [];
  for (const t of transactions) {
    if (!isDriverCashPaymentTransaction(t)) continue;
    if (!isClearedDriverCashPayment(t)) continue;
    const driverId = String(t.driverId || '').trim();
    if (!driverId) continue;
    if (options?.driverId && driverId !== options.driverId) continue;
    const dateYmd = String(t.date || '').split('T')[0];
    if (options?.dateFrom && dateYmd < options.dateFrom) continue;
    if (options?.dateTo && dateYmd > options.dateTo) continue;
    const currentWeekYmd = cashPaymentWeekKey(t);
    if (!includeTagged && currentWeekYmd) continue;
    out.push({
      id: String(t.id),
      driverId,
      driverName: driverNameById[driverId] || t.driverName || driverId,
      amount: Number(t.amount) || 0,
      date: dateYmd,
      paymentMethod: t.paymentMethod,
      status: t.status,
      currentWeekYmd,
      suggestedWeekYmd: suggestWeekFromPaymentDate(t.date, options?.timezone),
      description: t.description,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildCashRetagPreview(
  selected: CashRetagCandidate[],
  newWeekById: Record<string, string>,
  allowReplaceTagged: boolean,
): { preview: CashRetagPreviewRow[]; blocked: CashRetagCandidate[] } {
  const preview: CashRetagPreviewRow[] = [];
  const blocked: CashRetagCandidate[] = [];
  for (const c of selected) {
    const newWeekYmd = newWeekById[c.id] || c.suggestedWeekYmd;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newWeekYmd)) {
      blocked.push(c);
      continue;
    }
    const willReplace = !!c.currentWeekYmd && c.currentWeekYmd !== newWeekYmd;
    if (willReplace && !allowReplaceTagged) {
      blocked.push(c);
      continue;
    }
    preview.push({ ...c, newWeekYmd, willReplaceExistingTag: willReplace });
  }
  return { preview, blocked };
}

/** Build transaction patch for saveTransaction (existing payment save path). */
export function buildCashRetagSavePayload(
  original: FinancialTransaction,
  newWeekYmd: string,
  confirmedBy: string,
): FinancialTransaction {
  const weekEnd = format(addDays(parseISO(newWeekYmd), 6), 'yyyy-MM-dd');
  const prevWeek = cashPaymentWeekKey(original);
  const metadata = {
    ...(original.metadata || {}),
    workPeriodStart: `${newWeekYmd}T12:00:00.000Z`,
    workPeriodEnd: `${weekEnd}T12:00:00.000Z`,
    cashRetag: {
      previousWeekYmd: prevWeek,
      newWeekYmd,
      retaggedAt: new Date().toISOString(),
      retaggedBy: confirmedBy || 'unknown',
    },
  };
  return {
    ...original,
    metadata,
  };
}
