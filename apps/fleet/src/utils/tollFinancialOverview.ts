import type { DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import { fleetCalendarDay, fleetTzDateKey } from './timezoneDisplay';
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
  // Bare yyyy-MM-dd (ledger/claim) stays as-is via fleetTzDateKey.
  // Trip Z timestamps use honest UTC→fleet day (no legacy reinterpret).
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())
    ? fleetTzDateKey(dateStr, fleetTz)
    : fleetCalendarDay(String(dateStr), fleetTz) || fleetTzDateKey(dateStr, fleetTz);
  if (!ymd) return false;
  return ymd >= from && ymd <= to;
}

export function tripInPeriod(trip: Trip, from: string, to: string, fleetTz: string): boolean {
  const anchor = trip.dropoffTime || trip.date;
  return isDateInPeriod(anchor, from, to, fleetTz);
}

/**
 * Platform money paid back on trips (Uber/InDrive/Roam toll credits).
 * cash_wash still counts — Uber paid it; driver paid the plaza in cash.
 * phantom does not (fake credit, no real toll).
 */
export function countsTowardPlatformReimbursed(
  trip: Pick<Trip, 'tollRefundResolution'> | null | undefined,
): boolean {
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom') return false;
  return true;
}

/**
 * Credits that offset fleet tag spend for Net Loss math.
 * cash_wash / phantom must not wipe real tag leakage.
 */
export function countsTowardFleetReimbursed(
  trip: Pick<Trip, 'tollRefundResolution'> | null | undefined,
): boolean {
  const status = trip?.tollRefundResolution?.status;
  if (status === 'cash_wash' || status === 'phantom') return false;
  return true;
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

/**
 * Trip tolls with no linked tag debit in this period — still real spend
 * (unlinked Uber/InDrive/Roam credits, cash washes, expense-logged leftovers).
 * Phantom credits are excluded (not real plaza spend).
 */
export function collectTripOnlyTollSpend(input: {
  tolls: TollWithLinkedTrip[];
  unclaimedRefunds: Trip[];
  resolvedRefunds?: Trip[];
}): { total: number; byPlatform: PlatformAmountBreakdown } {
  const linkedTripIds = new Set<string>();
  for (const tx of input.tolls) {
    if (tx.tripId) linkedTripIds.add(String(tx.tripId));
    if (tx.linkedTrip?.id) linkedTripIds.add(String(tx.linkedTrip.id));
  }

  const byPlatform = emptyPlatformBreakdown();
  const seen = new Set<string>();
  let total = 0;

  const add = (t: Trip | null | undefined) => {
    if (!t?.id || seen.has(t.id) || linkedTripIds.has(t.id)) return;
    if (t.tollRefundResolution?.status === 'phantom') return;
    const amount = Math.abs(Number(t.tollCharges) || 0);
    if (amount <= 0) return;
    seen.add(t.id);
    total += amount;
    byPlatform[normPlatformBucket(t.platform)] += amount;
  };

  for (const t of input.unclaimedRefunds || []) add(t);
  for (const t of input.resolvedRefunds || []) add(t);
  return { total, byPlatform };
}

/** Tag debits + trip-only tolls, merged by platform (no double-count). */
export function computeGrossTollSpendByPlatform(input: {
  tolls: TollWithLinkedTrip[];
  resolvePlatform: (tx: FinancialTransaction) => PlatformBucket;
  unclaimedRefunds: Trip[];
  resolvedRefunds?: Trip[];
}): { total: number; byPlatform: PlatformAmountBreakdown; tagTotal: number } {
  const tag = computeTollSpendByPlatform(input.tolls, input.resolvePlatform);
  const tripOnly = collectTripOnlyTollSpend({
    tolls: input.tolls,
    unclaimedRefunds: input.unclaimedRefunds,
    resolvedRefunds: input.resolvedRefunds,
  });
  const byPlatform = emptyPlatformBreakdown();
  for (const k of Object.keys(byPlatform) as PlatformBucket[]) {
    byPlatform[k] = tag.byPlatform[k] + tripOnly.byPlatform[k];
  }
  return {
    total: tag.total + tripOnly.total,
    byPlatform,
    tagTotal: tag.total,
  };
}

/** Server enrichment on reconciled/unreconciled toll rows (may be absent on older clients). */
export type TollLinkedTripStub = {
  id: string;
  platform?: string | null;
  tollCharges?: number | null;
  date?: string | null;
  dropoffTime?: string | null;
};

export type TollWithLinkedTrip = FinancialTransaction & {
  linkedTrip?: TollLinkedTripStub | null;
};

/**
 * Platform for a toll: linked trip first, then suggestion / Roam geofence, else Unlinked.
 * Prefer this over tripMap-only lookups — fetchAllTrips often misses older weeks.
 */
export function resolveTollPlatformBucket(
  tx: TollWithLinkedTrip,
  tripById: Map<string, Trip>,
  opts?: { suggestedPlatform?: string | null },
): PlatformBucket {
  const fromMap = tripById.get(tx.tripId || '')?.platform;
  if (fromMap) return normPlatformBucket(fromMap);
  const fromLinked = tx.linkedTrip?.platform;
  if (fromLinked) return normPlatformBucket(fromLinked);
  if ((tx as { metadata?: { source?: string } }).metadata?.source === 'roam_geofence') {
    return 'Roam';
  }
  if (opts?.suggestedPlatform) return normPlatformBucket(opts.suggestedPlatform);
  return 'Unlinked';
}

/**
 * Trips that feed the Reimbursed card (platform money on trips).
 * Includes cash_wash — Uber still paid; excludes phantom.
 * Pass mode: 'fleet' to exclude cash_wash for Net Loss math only.
 */
export function collectTripsForReimbursedCard(input: {
  trips: Trip[];
  unclaimedRefunds: Trip[];
  /** Resolved leftovers — cash_wash counts for platform display; expense_logged always. */
  resolvedRefunds?: Trip[];
  tolls: TollWithLinkedTrip[];
  /** 'platform' (default) = Reimbursed card; 'fleet' = Net Loss offsets only. */
  mode?: 'platform' | 'fleet';
}): Trip[] {
  const include = input.mode === 'fleet' ? countsTowardFleetReimbursed : countsTowardPlatformReimbursed;
  const byId = new Map<string, Trip>();
  const add = (t: Partial<Trip> & { id: string }) => {
    if (!t?.id) return;
    if (!include(t as Trip)) return;
    const prev = byId.get(t.id);
    if (!prev) {
      byId.set(t.id, t as Trip);
      return;
    }
    const prevTc = Number(prev.tollCharges) || 0;
    const nextTc = Number(t.tollCharges) || 0;
    byId.set(t.id, {
      ...prev,
      ...t,
      platform: prev.platform || t.platform,
      tollCharges: Math.max(prevTc, nextTc) || prev.tollCharges || t.tollCharges,
      date: prev.date || t.date,
      dropoffTime: prev.dropoffTime || t.dropoffTime,
      tollRefundResolution: prev.tollRefundResolution || t.tollRefundResolution,
    } as Trip);
  };

  for (const t of input.trips) {
    if (t?.id) add(t);
  }
  for (const t of input.unclaimedRefunds) {
    if (t?.id) add(t);
  }
  for (const t of input.resolvedRefunds || []) {
    if (t?.id) add(t);
  }
  for (const tx of input.tolls) {
    const lt = tx.linkedTrip;
    if (!lt?.id) continue;
    add({
      id: lt.id,
      platform: lt.platform || undefined,
      tollCharges: Number(lt.tollCharges) || 0,
      date: lt.date || undefined,
      dropoffTime: lt.dropoffTime || undefined,
    });
  }
  return [...byId.values()];
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
 * cash_wash counts (Uber paid); phantom does not.
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
    if (!countsTowardPlatformReimbursed(trip)) continue;
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
