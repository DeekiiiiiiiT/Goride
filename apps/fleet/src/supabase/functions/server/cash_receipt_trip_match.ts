/**
 * Server mirror of apps/fleet/src/utils/cashReceiptTripMatch.ts — keep in sync.
 */

export const CASH_RECEIPT_TRIP_PROXIMITY_MINUTES = 90;
export const CASH_TAG_AMOUNT_DELTA_MAX = 15;

export function isCashOrPassageReceiptToll(tx: {
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  location?: string | null;
  plaza?: string | null;
  category?: string | null;
  description?: string | null;
}): boolean {
  const pm = String(tx.paymentMethod || "").toLowerCase();
  if (pm.includes("cash")) return true;
  if (tx.receiptUrl) return true;
  const blob = `${tx.location || ""} ${tx.plaza || ""} ${tx.category || ""} ${tx.description || ""}`.toLowerCase();
  if (blob.includes("passage receipt") || blob.includes("toll passage")) return true;
  return false;
}

export function cashReceiptAmountsAlign(
  tollAbs: number,
  tripTollCharges: number,
  maxDelta = CASH_TAG_AMOUNT_DELTA_MAX,
): boolean {
  const a = Math.abs(Number(tollAbs) || 0);
  const b = Math.abs(Number(tripTollCharges) || 0);
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) <= maxDelta + 1e-9;
}

export function minutesOutsideTripInterval(
  tollDate: Date,
  tripStart: Date | null | undefined,
  tripEnd: Date | null | undefined,
): number | null {
  const t = tollDate.getTime();
  if (isNaN(t)) return null;
  const starts = [tripStart, tripEnd]
    .filter((d): d is Date => !!d && !isNaN(d.getTime()))
    .map((d) => d.getTime())
    .sort((a, b) => a - b);
  if (starts.length === 0) return null;
  const lo = starts[0];
  const hi = starts[starts.length - 1];
  if (t >= lo && t <= hi) return 0;
  const distMs = t < lo ? lo - t : t - hi;
  return distMs / 60_000;
}

export interface CashReceiptSoftMatchHit {
  tripId: string;
  tripTollCharges: number;
  timeDifferenceMinutes: number;
  amountDelta: number;
  confidenceScore: number;
  reason: string;
}

export function findCashReceiptTripCreditHits(input: {
  tollAmountAbs: number;
  tollDate: Date;
  proximityMinutes?: number;
  maxAmountDelta?: number;
  trips: Array<{
    id: string;
    tollCharges?: number | null;
    requestTime?: string | null;
    dropoffTime?: string | null;
    date?: string | null;
    tripStart?: Date | null;
    tripEnd?: Date | null;
  }>;
}): CashReceiptSoftMatchHit[] {
  const proximity = input.proximityMinutes ?? CASH_RECEIPT_TRIP_PROXIMITY_MINUTES;
  const maxDelta = input.maxAmountDelta ?? CASH_TAG_AMOUNT_DELTA_MAX;
  const tollAbs = Math.abs(Number(input.tollAmountAbs) || 0);
  if (!(tollAbs > 0) || isNaN(input.tollDate.getTime())) return [];

  const hits: CashReceiptSoftMatchHit[] = [];

  for (const trip of input.trips) {
    const tripId = String(trip.id || "");
    if (!tripId) continue;
    const credit = Math.abs(Number(trip.tollCharges) || 0);
    if (credit <= 0.05) continue;
    if (!cashReceiptAmountsAlign(tollAbs, credit, maxDelta)) continue;

    let start = trip.tripStart ?? null;
    let end = trip.tripEnd ?? null;
    if (!start && trip.requestTime) {
      const d = new Date(trip.requestTime);
      if (!isNaN(d.getTime())) start = d;
    }
    if (!end && trip.dropoffTime) {
      const d = new Date(trip.dropoffTime);
      if (!isNaN(d.getTime())) end = d;
    }
    if (!start && !end && trip.date) {
      const d = new Date(trip.date);
      if (!isNaN(d.getTime())) {
        start = d;
        end = d;
      }
    }

    const gap = minutesOutsideTripInterval(input.tollDate, start, end);
    if (gap == null || gap > proximity) continue;

    const amountDelta = Math.round((credit - tollAbs) * 100) / 100;
    let score = 58;
    if (gap <= 15) score += 12;
    else if (gap <= 45) score += 8;
    else if (gap <= 60) score += 4;
    const absDelta = Math.abs(amountDelta);
    if (absDelta <= 0.05) score += 10;
    else if (absDelta <= 10) score += 6;
    else if (absDelta <= maxDelta) score += 2;

    hits.push({
      tripId,
      tripTollCharges: credit,
      timeDifferenceMinutes: Math.round(gap * 10) / 10,
      amountDelta,
      confidenceScore: Math.min(85, score),
      reason: `Cash receipt near trip with $${credit.toFixed(2)} platform toll credit (${Math.round(gap)} min, $${Math.abs(amountDelta).toFixed(2)} delta) — review match`,
    });
  }

  hits.sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    if (a.timeDifferenceMinutes !== b.timeDifferenceMinutes) {
      return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
    }
    return Math.abs(a.amountDelta) - Math.abs(b.amountDelta);
  });

  return hits;
}
