import { round2 } from './money.ts';
import { DEFAULT_FLEET_TZ, periodKeyFor } from './periodKey.ts';

export type StatementWeekWeight = { weekKey: string; date: string; weight: number };
export type StatementWeekSlice = { weekKey: string; date: string; amount: number };

/** Uber trip dates → Mon week buckets (ADR 0007). Weight = trip amount so spanning CSVs split fairly. */
export function statementWeekWeightsFromTrips(
  trips: Array<{ date?: string; platform?: string; amount?: number }>,
  tz: string = DEFAULT_FLEET_TZ,
): StatementWeekWeight[] {
  const map = new Map<string, { minDate: string; weight: number }>();
  for (const t of trips) {
    if (String(t.platform || '').toLowerCase() !== 'uber') continue;
    const d = String(t.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const week = periodKeyFor(d, tz);
    if (!week) continue;
    const w = Math.abs(Number(t.amount) || 0) || 1;
    const cur = map.get(week);
    if (!cur) map.set(week, { minDate: d, weight: w });
    else {
      cur.weight += w;
      if (d < cur.minDate) cur.minDate = d;
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekKey, v]) => ({ weekKey, date: v.minDate, weight: v.weight }));
}

/** One slice when the file is a single fleet week; otherwise cents land on the last week. */
export function splitAmountByStatementWeeks(
  total: number,
  weights: StatementWeekWeight[],
  fallbackDate: string,
): StatementWeekSlice[] {
  const mag = Math.abs(Number(total) || 0);
  if (mag < 1e-9) return [];
  if (weights.length <= 1) {
    const w = weights[0];
    const weekKey = w?.weekKey || periodKeyFor(fallbackDate) || fallbackDate;
    return [{ weekKey, date: w?.date || fallbackDate, amount: mag }];
  }
  const sumW = weights.reduce((s, x) => s + x.weight, 0) || weights.length;
  const slices: StatementWeekSlice[] = [];
  let allocated = 0;
  for (let i = 0; i < weights.length; i++) {
    const last = i === weights.length - 1;
    const amt = last ? round2(mag - allocated) : round2((mag * weights[i].weight) / sumW);
    allocated = round2(allocated + amt);
    if (amt > 1e-9) {
      slices.push({ weekKey: weights[i].weekKey, date: weights[i].date, amount: amt });
    }
  }
  return slices;
}
