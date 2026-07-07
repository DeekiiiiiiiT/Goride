import type { DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { fleetTzDateKey } from './timezoneDisplay';
import { normalizePlatform } from './normalizePlatform';

export type RidesharePlatform = 'Uber' | 'InDrive' | 'Roam';
export type PlatformBucket = RidesharePlatform | 'Unlinked';

export type PlatformAmountBreakdown = Record<PlatformBucket, number>;

const PLATFORMS: RidesharePlatform[] = ['Uber', 'InDrive', 'Roam'];

export function emptyPlatformBreakdown(): PlatformAmountBreakdown {
  return { Uber: 0, InDrive: 0, Roam: 0, Unlinked: 0 };
}

export function normPlatformBucket(p?: string | null): PlatformBucket {
  if (!p) return 'Unlinked';
  const n = normalizePlatform(p);
  if (n === 'Uber' || n === 'InDrive' || n === 'Roam') return n;
  return 'Unlinked';
}

/** Fleet-tz calendar day within [from, to] inclusive (yyyy-MM-dd strings). */
export function isDateInPeriod(
  dateStr: string | undefined | null,
  from: string,
  to: string,
  fleetTz: string,
): boolean {
  if (!dateStr) return false;
  const ymd = fleetTzDateKey(dateStr, fleetTz);
  if (!ymd) return false;
  return ymd >= from && ymd <= to;
}

export function tripInPeriod(trip: Trip, from: string, to: string, fleetTz: string): boolean {
  const anchor = trip.dropoffTime || trip.date;
  return isDateInPeriod(anchor, from, to, fleetTz);
}

export function computeTollSpendByPlatform(
  tolls: FinancialTransaction[],
  resolvePlatform: (tx: FinancialTransaction) => PlatformBucket,
): { total: number; byPlatform: PlatformAmountBreakdown } {
  const byPlatform = emptyPlatformBreakdown();
  let total = 0;
  for (const tx of tolls) {
    const amount = tx.amount < 0 ? Math.abs(tx.amount) : 0;
    if (amount <= 0) continue;
    total += amount;
    byPlatform[resolvePlatform(tx)] += amount;
  }
  return { total, byPlatform };
}

export interface ReimbursedTotalsInput {
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  period?: { startDate: string; endDate: string };
  fleetTz: string;
  platformFilter?: 'all' | RidesharePlatform;
}

/**
 * Platform toll refunds paid through trip fares (+ matched dispute adjustments).
 * When `period` is set, only trips whose dropoff/date falls in that period count.
 */
export function computeReimbursedTotals(input: ReimbursedTotalsInput): {
  total: number;
  byPlatform: PlatformAmountBreakdown;
  disputeRefundAmount: number;
} {
  const { trips, disputeRefunds, period, fleetTz, platformFilter = 'all' } = input;
  const byPlatform = emptyPlatformBreakdown();
  const seenTripIds = new Set<string>();

  for (const trip of trips) {
    if (!trip?.id || seenTripIds.has(trip.id)) continue;
    const refund = Math.abs(Number(trip.tollCharges) || 0);
    if (refund <= 0) continue;
    if (period && !tripInPeriod(trip, period.startDate, period.endDate, fleetTz)) continue;

    const bucket = normPlatformBucket(trip.platform);
    if (platformFilter !== 'all' && bucket !== platformFilter) continue;

    seenTripIds.add(trip.id);
    byPlatform[bucket] += refund;
  }

  const disputeRefundAmount = disputeRefunds
    .filter((r) => r.status === 'matched' || r.status === 'auto_resolved')
    .filter((r) => !period || isDateInPeriod(r.date, period.startDate, period.endDate, fleetTz))
    .filter(() => platformFilter === 'all' || platformFilter === 'Uber')
    .reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);

  if (disputeRefundAmount > 0) {
    byPlatform.Uber += disputeRefundAmount;
  }

  const total = (Object.keys(byPlatform) as PlatformBucket[]).reduce((s, k) => s + byPlatform[k], 0);

  return { total, byPlatform, disputeRefundAmount };
}

/** Non-zero platform lines for compact card display. */
export function platformBreakdownLines(
  byPlatform: PlatformAmountBreakdown,
  opts?: { hideUnlinked?: boolean },
): { label: string; amount: number }[] {
  const lines: { label: string; amount: number }[] = [];
  for (const p of PLATFORMS) {
    if (byPlatform[p] > 0) lines.push({ label: p, amount: byPlatform[p] });
  }
  if (!opts?.hideUnlinked && byPlatform.Unlinked > 0) {
    lines.push({ label: 'Unlinked', amount: byPlatform.Unlinked });
  }
  return lines;
}
