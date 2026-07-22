/**
 * Expense Hub Overview — coverage-overlap run-rate math.
 * View-layer only: does not change ledger / P&L recognition.
 *
 * Spread lens: prepaid / recurring costs land on every day that overlaps
 * the selected period (even months with no due-date cash hit).
 * As-paid lens: full amounts on ledger / due dates inside the period.
 */

export type CoverageRuleInput = {
  id: string;
  category: string;
  amount: number;
  frequency: string;
  startDate: string;
  endDate?: string;
  isActive?: boolean;
};

/** Point-in-time spend (ledger event or regenerated occurrence). */
export type PointSpendEvent = {
  dateYmd: string;
  category: string;
  amount: number;
  /**
   * fixed_expense → as-paid only (spread comes from coverage rules).
   * All other kinds → both lenses on the event date.
   */
  kind: 'fixed_expense' | 'operating' | 'fuel' | 'toll' | 'maintenance' | 'other';
};

export type SpendCategoryAmount = {
  category: string;
  amount: number;
};

export type SpendDailyPoint = {
  dateYmd: string;
  amount: number;
};

export type SpendLensBreakdown = {
  periodTotal: number;
  byCategory: SpendCategoryAmount[];
  seriesDaily: SpendDailyPoint[];
};

export type ExpenseSpendBreakdown = {
  periodStartYmd: string;
  periodEndYmd: string;
  asPaid: SpendLensBreakdown;
  spread: SpendLensBreakdown;
  meta: {
    hasCashInPeriod: boolean;
    hasCoverageInPeriod: boolean;
  };
};

export type SpendGrain = 'day' | 'week' | 'month';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseYmd(ymd: string): Date | null {
  if (!YMD_RE.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

function formatYmd(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inclusive calendar-day count between two YMD strings. */
export function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const a = parseYmd(startYmd);
  const b = parseYmd(endYmd);
  if (!a || !b || b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function addUtcDays(dt: Date, days: number): Date {
  const next = new Date(dt.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addCadence(startYmd: string, frequency: string): string {
  const start = parseYmd(startYmd);
  if (!start) return startYmd;
  const f = String(frequency || '').toLowerCase().replace(/-/g, '_');
  const end = new Date(start.getTime());
  if (f === 'daily') {
    // one_time-style single day handled elsewhere; daily cadence window = 1 day
    return startYmd;
  }
  if (f === 'weekly') {
    end.setUTCDate(end.getUTCDate() + 6);
    return formatYmd(end);
  }
  if (f === 'quarterly') {
    end.setUTCMonth(end.getUTCMonth() + 3);
    end.setUTCDate(end.getUTCDate() - 1);
    return formatYmd(end);
  }
  if (f === 'annually' || f === 'yearly') {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    return formatYmd(end);
  }
  if (f === 'one_time' || f === 'onetime') {
    return startYmd;
  }
  // monthly default
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return formatYmd(end);
}

/** Days in one cadence used when coverage has no end (open-ended rate). */
export function cadenceDayDivisor(frequency: string): number {
  const f = String(frequency || '').toLowerCase().replace(/-/g, '_');
  if (f === 'daily') return 1;
  if (f === 'weekly') return 7;
  if (f === 'quarterly') return 365 / 4;
  if (f === 'annually' || f === 'yearly') return 365;
  if (f === 'one_time' || f === 'onetime') return 365;
  return 365 / 12; // monthly
}

export function normalizeSpendCategory(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  if (key === 'fuel') return 'Fuel';
  if (key === 'toll' || key === 'tolls') return 'Toll';
  if (key === 'maintenance') return 'Maintenance';
  if (key === 'insurance') return 'Insurance';
  if (key === 'lease' || key === 'financing') return 'Lease';
  if (key === 'security' || key === 'tracking') return 'Security';
  if (key === 'software' || key === 'software/subscription') return 'Software';
  if (key === 'permits' || key === 'registration' || key === 'license') return 'Permits';
  if (key === 'equipment') return 'Equipment';
  if (!raw) return 'Other';
  // Preserve known title-case categories from rules/ledger
  if (raw === 'Insurance' || raw === 'Lease' || raw === 'Security' || raw === 'Software') return raw;
  if (raw === 'Permits' || raw === 'Equipment' || raw === 'Maintenance' || raw === 'Fuel') return raw;
  if (raw === 'Toll' || raw === 'Other' || raw === 'Parking') return raw;
  return raw;
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(formatYmd(cur));
    cur = addUtcDays(cur, 1);
  }
  return out;
}

function emptyLens(periodStartYmd: string, periodEndYmd: string): SpendLensBreakdown {
  return {
    periodTotal: 0,
    byCategory: [],
    seriesDaily: eachYmdInclusive(periodStartYmd, periodEndYmd).map((dateYmd) => ({
      dateYmd,
      amount: 0,
    })),
  };
}

function finalizeLens(
  daily: Map<string, number>,
  byCat: Map<string, number>,
  periodStartYmd: string,
  periodEndYmd: string,
): SpendLensBreakdown {
  const seriesDaily = eachYmdInclusive(periodStartYmd, periodEndYmd).map((dateYmd) => ({
    dateYmd,
    amount: round2(daily.get(dateYmd) || 0),
  }));
  const periodTotal = round2(seriesDaily.reduce((s, p) => s + p.amount, 0));
  const byCategory = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .filter((c) => Math.abs(c.amount) > 0.0005)
    .sort((a, b) => b.amount - a.amount);
  return { periodTotal, byCategory, seriesDaily };
}

function addToDay(
  daily: Map<string, number>,
  byCat: Map<string, number>,
  dateYmd: string,
  category: string,
  amount: number,
) {
  if (!amount) return;
  daily.set(dateYmd, (daily.get(dateYmd) || 0) + amount);
  const cat = normalizeSpendCategory(category);
  byCat.set(cat, (byCat.get(cat) || 0) + amount);
}

/**
 * Resolve the coverage window used for spread.
 * - Explicit endDate → amount / inclusive coverage days.
 * - Missing endDate → open-ended: frequency daily rate from start through periodEnd.
 * - Missing endDate + finite prepaid cadence (annually/one_time/quarterly) →
 *   infer one cadence window from start (amount covers that window).
 */
export function resolveCoverageWindow(
  rule: CoverageRuleInput,
  periodEndYmd: string,
): { startYmd: string; endYmd: string; dailyRate: number } | null {
  if (rule.isActive === false) return null;
  const amount = Number(rule.amount);
  if (!(amount > 0) || !YMD_RE.test(rule.startDate)) return null;

  const freq = String(rule.frequency || 'monthly');
  const f = freq.toLowerCase().replace(/-/g, '_');

  if (rule.endDate && YMD_RE.test(rule.endDate)) {
    const days = inclusiveDayCount(rule.startDate, rule.endDate);
    if (days <= 0) return null;
    return {
      startYmd: rule.startDate,
      endYmd: rule.endDate,
      dailyRate: amount / days,
    };
  }

  // Open-ended / missing end
  if (f === 'annually' || f === 'yearly' || f === 'one_time' || f === 'onetime' || f === 'quarterly') {
    const inferredEnd = addCadence(rule.startDate, freq);
    const days = inclusiveDayCount(rule.startDate, inferredEnd);
    if (days <= 0) return null;
    return {
      startYmd: rule.startDate,
      endYmd: inferredEnd,
      dailyRate: amount / days,
    };
  }

  // Ongoing monthly/weekly/daily — rate by cadence, active through selected period end
  const divisor = cadenceDayDivisor(freq);
  return {
    startYmd: rule.startDate,
    endYmd: periodEndYmd,
    dailyRate: amount / divisor,
  };
}

export function coverageOverlapsPeriod(
  coverageStart: string,
  coverageEnd: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  return coverageStart <= periodEnd && coverageEnd >= periodStart;
}

/**
 * Build as-paid + spread breakdowns for a selected period.
 */
export function buildExpenseSpendBreakdown(
  periodStartYmd: string,
  periodEndYmd: string,
  rules: CoverageRuleInput[],
  pointEvents: PointSpendEvent[],
): ExpenseSpendBreakdown {
  if (!YMD_RE.test(periodStartYmd) || !YMD_RE.test(periodEndYmd) || periodEndYmd < periodStartYmd) {
    return {
      periodStartYmd,
      periodEndYmd,
      asPaid: emptyLens(periodStartYmd, periodEndYmd),
      spread: emptyLens(periodStartYmd, periodEndYmd),
      meta: { hasCashInPeriod: false, hasCoverageInPeriod: false },
    };
  }

  const asPaidDaily = new Map<string, number>();
  const asPaidCat = new Map<string, number>();
  const spreadDaily = new Map<string, number>();
  const spreadCat = new Map<string, number>();

  let hasCashInPeriod = false;
  let hasCoverageInPeriod = false;

  for (const ev of pointEvents) {
    if (!YMD_RE.test(ev.dateYmd)) continue;
    if (ev.dateYmd < periodStartYmd || ev.dateYmd > periodEndYmd) continue;
    const amt = Number(ev.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    hasCashInPeriod = true;
    addToDay(asPaidDaily, asPaidCat, ev.dateYmd, ev.category, amt);
    // Operational / one-off also appear in spread on the event date.
    // Recurring fixed_expense is represented via coverage rules instead.
    if (ev.kind !== 'fixed_expense') {
      addToDay(spreadDaily, spreadCat, ev.dateYmd, ev.category, amt);
    }
  }

  for (const rule of rules) {
    const window = resolveCoverageWindow(rule, periodEndYmd);
    if (!window) continue;
    if (!coverageOverlapsPeriod(window.startYmd, window.endYmd, periodStartYmd, periodEndYmd)) {
      continue;
    }
    hasCoverageInPeriod = true;
    const overlapStart = maxYmd(window.startYmd, periodStartYmd);
    const overlapEnd = minYmd(window.endYmd, periodEndYmd);
    for (const day of eachYmdInclusive(overlapStart, overlapEnd)) {
      addToDay(spreadDaily, spreadCat, day, rule.category, window.dailyRate);
    }
  }

  return {
    periodStartYmd,
    periodEndYmd,
    asPaid: finalizeLens(asPaidDaily, asPaidCat, periodStartYmd, periodEndYmd),
    spread: finalizeLens(spreadDaily, spreadCat, periodStartYmd, periodEndYmd),
    meta: { hasCashInPeriod, hasCoverageInPeriod },
  };
}

/** Smart default grain from selected range length. */
export function defaultSpendGrain(periodStartYmd: string, periodEndYmd: string): SpendGrain {
  const days = inclusiveDayCount(periodStartYmd, periodEndYmd);
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

/**
 * Roll daily series into week or month buckets.
 * Week buckets start on Monday (UTC) containing the day.
 */
export function rollSpendSeries(
  seriesDaily: SpendDailyPoint[],
  grain: SpendGrain,
): Array<{ key: string; label: string; amount: number }> {
  if (grain === 'day') {
    return seriesDaily.map((p) => ({
      key: p.dateYmd,
      label: p.dateYmd.slice(5), // MM-DD
      amount: p.amount,
    }));
  }

  const buckets = new Map<string, { label: string; amount: number }>();

  for (const p of seriesDaily) {
    const dt = parseYmd(p.dateYmd);
    if (!dt) continue;
    if (grain === 'month') {
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = key;
      const prev = buckets.get(key) || { label, amount: 0 };
      prev.amount += p.amount;
      buckets.set(key, prev);
    } else {
      // ISO-ish week: Monday start
      const day = dt.getUTCDay(); // 0 Sun … 6 Sat
      const offset = day === 0 ? -6 : 1 - day;
      const monday = addUtcDays(dt, offset);
      const key = formatYmd(monday);
      const label = `W ${key.slice(5)}`;
      const prev = buckets.get(key) || { label, amount: 0 };
      prev.amount += p.amount;
      buckets.set(key, prev);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: v.label, amount: round2(v.amount) }));
}

/** Avg / day · week · month from a period total and day count. */
export function runRateAverages(
  periodTotal: number,
  periodStartYmd: string,
  periodEndYmd: string,
): { perDay: number; perWeek: number; perMonth: number } {
  const days = Math.max(1, inclusiveDayCount(periodStartYmd, periodEndYmd));
  const perDay = periodTotal / days;
  return {
    perDay: round2(perDay),
    perWeek: round2(perDay * 7),
    perMonth: round2(perDay * (365 / 12)),
  };
}
