import { round2, MONEY_EPS } from './money.ts';
import { periodKeyFor, DEFAULT_FLEET_TZ, type WeekKey } from './periodKey.ts';

export type PayoutCashLike = {
  id?: string;
  date?: string;
  netAmount?: number;
  grossAmount?: number;
  driverId?: string | null;
  eventType?: string;
  idempotencyKey?: string;
};

/**
 * One payout_cash figure per remittance per week.
 * Distinct source keys (file-hash / batch line) are kept even if day+amount match.
 * Untagged same-day same-amount twins of a tagged row are still collapsed (C1 safety).
 */
export function foldPayoutCashByWeek(
  events: PayoutCashLike[],
  fleetTz: string = DEFAULT_FLEET_TZ,
): Map<WeekKey, number> {
  const seenId = new Set<string>();
  const seenAmt = new Set<string>();
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
    const amtKey = `${day}|${amt.toFixed(2)}`;
    const idKey = String(e.idempotencyKey || e.id || '').trim();
    if (idKey) {
      if (seenId.has(idKey)) continue;
      seenId.add(idKey);
    }
    const tagged = Boolean(String(e.driverId || '').trim());
    if (seenAmt.has(amtKey) && !tagged) continue;
    if (!idKey && seenAmt.has(amtKey)) continue;
    seenAmt.add(amtKey);
    const week = periodKeyFor(e, fleetTz);
    if (!week) continue;
    byWeek.set(week, round2((byWeek.get(week) || 0) + amt));
  }
  return byWeek;
}
