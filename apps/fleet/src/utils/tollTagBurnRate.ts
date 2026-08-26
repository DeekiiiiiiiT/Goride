import { parseTollDate } from './tollDate';

export interface BurnRateRow {
  date?: string | null;
  time?: string | null;
  amount?: number;
}

export interface BurnRateResult {
  /** Average tag spend per 7 days over the observed span. */
  perWeek: number;
  /** Days actually covered by the rows (never below 1). */
  spanDays: number;
  /** False when there is too little history to state a rate honestly. */
  reliable: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Burn rate over the span the data actually covers.
 *
 * The old version divided by a hardcoded 7 days whenever the period had no
 * explicit bounds, so "All Time" reported a full year of spend as one week's
 * burn. The span now comes from the first and last usage row, clamped to the
 * selected period when one is set.
 */
export function computeTagBurnRate(
  usageRows: BurnRateRow[],
  period?: { start: Date | null; end: Date | null },
): BurnRateResult {
  const spent = usageRows.reduce((sum, r) => sum + Math.abs(r.amount ?? 0), 0);
  if (usageRows.length === 0 || spent === 0) {
    return { perWeek: 0, spanDays: 0, reliable: false };
  }

  const times = usageRows
    .map((r) => parseTollDate(r.date, r.time).getTime())
    .filter((t) => Number.isFinite(t));

  if (times.length === 0) return { perWeek: 0, spanDays: 0, reliable: false };

  // An explicit period wins, but never extend past today — a range ending next
  // month would otherwise dilute the rate with days that have not happened.
  const now = Date.now();
  const firstRow = Math.min(...times);
  const lastRow = Math.max(...times);
  const start = period?.start ? Math.max(period.start.getTime(), firstRow) : firstRow;
  const end = period?.end ? Math.min(period.end.getTime(), now) : Math.min(lastRow, now);

  // A single day of activity still represents one day of burn, not zero.
  const rawDays = (end - start) / MS_PER_DAY;
  const spanDays = Math.max(1, rawDays);

  return {
    perWeek: spent / (spanDays / 7),
    spanDays,
    // One row, or under a week of history, cannot support a weekly claim.
    reliable: usageRows.length >= 2 && spanDays >= 7,
  };
}

/** Average absolute spend per passage; null when there is nothing to divide by. */
export function avgCostPerPassage(usageRows: BurnRateRow[]): number | null {
  if (usageRows.length === 0) return null;
  const spent = usageRows.reduce((sum, r) => sum + Math.abs(r.amount ?? 0), 0);
  if (!(spent > 0)) return null;
  return spent / usageRows.length;
}

/**
 * How many more passages the balance can cover at the observed average cost.
 * Returns null when we cannot honestly estimate (no passage history).
 */
export function estimateTripsRemaining(
  balance: number,
  avgPassageCost: number | null,
): number | null {
  if (avgPassageCost == null || !(avgPassageCost > 0) || !Number.isFinite(balance)) {
    return null;
  }
  if (balance <= 0) return 0;
  return Math.floor(balance / avgPassageCost);
}

/** Days until empty from weekly burn; null when burn is not reliable. */
export function estimateDaysToEmpty(
  balance: number,
  burn: BurnRateResult,
): number | null {
  if (!burn.reliable || !(burn.perWeek > 0) || !Number.isFinite(balance)) return null;
  if (balance <= 0) return 0;
  const perDay = burn.perWeek / 7;
  if (!(perDay > 0)) return null;
  return Math.floor(balance / perDay);
}

export type BalanceRingState = 'healthy' | 'watch' | 'low' | 'empty';

/**
 * B8 ring: green ≥ 2× threshold, watch between threshold and 2×,
 * amber below threshold, red at or below zero.
 */
export function balanceRingState(
  balance: number,
  threshold: number,
): BalanceRingState {
  if (!(Number.isFinite(balance)) || balance <= 0) return 'empty';
  const t = Number.isFinite(threshold) && threshold > 0 ? threshold : 500;
  if (balance < t) return 'low';
  if (balance < t * 2) return 'watch';
  return 'healthy';
}
