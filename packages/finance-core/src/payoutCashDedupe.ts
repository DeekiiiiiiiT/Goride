import { round2, MONEY_EPS } from './money.ts';
import { periodKeyFor, DEFAULT_FLEET_TZ, type WeekKey } from './periodKey.ts';

export type PayoutCashLike = {
  id?: string;
  date?: string;
  netAmount?: number;
  grossAmount?: number;
  driverId?: string | null;
  eventType?: string;
};

/**
 * D1: one payout_cash figure per week. Duplicate rows (same date + amount,
 * one untagged) are collapsed to a single posting. Prefer the tagged driverId.
 */
export function foldPayoutCashByWeek(
  events: PayoutCashLike[],
  fleetTz: string = DEFAULT_FLEET_TZ,
): Map<WeekKey, number> {
  const seen = new Set<string>();
  const byWeek = new Map<WeekKey, number>();

  const cashEvents = (events || []).filter(
    (e) => String(e.eventType || 'payout_cash') === 'payout_cash',
  );
  const sorted = [...cashEvents].sort((a, b) => {
    const aTag = a.driverId ? 1 : 0;
    const bTag = b.driverId ? 1 : 0;
    return bTag - aTag;
  });

  for (const e of sorted) {
    const amt = round2(Math.abs(Number(e.netAmount) || Number(e.grossAmount) || 0));
    if (amt < MONEY_EPS) continue;
    const day = String(e.date || '').slice(0, 10);
    const dedupeKey = `${day}|${amt.toFixed(2)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const week = periodKeyFor(e, fleetTz);
    if (!week) continue;
    byWeek.set(week, round2((byWeek.get(week) || 0) + amt));
  }
  return byWeek;
}
