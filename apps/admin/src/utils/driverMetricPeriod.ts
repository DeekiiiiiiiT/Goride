/**
 * Driver import metrics use periodStart / periodEnd for Fleet Analytics overlap.
 * Same timestamp for both (or end <= start) makes bogus Uber cash match random weeks.
 */

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Uber payment CSV rows represent one statement week — reject month-long bogus spans. */
const MAX_UBER_CASH_METRIC_DAYS = 10;

/** True when periodEnd is strictly after periodStart (finite dates). */
export function isValidDriverMetricPeriod(m: { periodStart?: string; periodEnd?: string }): boolean {
  const s = m.periodStart ? new Date(m.periodStart).getTime() : NaN;
  const e = m.periodEnd ? new Date(m.periodEnd).getTime() : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return e > s;
}

/** Stricter gate for Uber CSV cash override — valid week-sized period only. */
export function isUberCashEligibleMetricPeriod(m: { periodStart?: string; periodEnd?: string }): boolean {
  if (!isValidDriverMetricPeriod(m)) return false;
  const s = new Date(m.periodStart!).getTime();
  const e = new Date(m.periodEnd!).getTime();
  const spanDays = (e - s) / (24 * 60 * 60 * 1000);
  return spanDays <= MAX_UBER_CASH_METRIC_DAYS;
}


/**
 * If end is missing, equal to start, or before start, expand to 7 days from start (Uber-style week).
 */
export function coerceDriverMetricPeriodIfDegenerate(
  periodStart: string,
  periodEnd: string,
): { periodStart: string; periodEnd: string } {
  const s = new Date(periodStart).getTime();
  const e = new Date(periodEnd).getTime();
  if (!Number.isFinite(s)) return { periodStart, periodEnd };
  if (!Number.isFinite(e) || e <= s) {
    return {
      periodStart,
      periodEnd: new Date(s + MS_WEEK - 1).toISOString(),
    };
  }
  return { periodStart, periodEnd };
}
