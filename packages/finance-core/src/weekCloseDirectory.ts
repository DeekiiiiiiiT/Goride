/**
 * Year directory rollups for Close Week Open/Closed lists.
 * Pure — same math for server listOpenWeeks / listClosedWeeks and unit tests.
 */

export type WeekDirPeriodInput = {
  weekKey: string;
  frozen: boolean;
  settled: boolean;
  signedAt?: string | null;
};

export type WeekDirAgg = {
  weekKey: string;
  driversTotal: number;
  driversFrozen: number;
  driversSettled: number;
  closedAt: string | null;
};

export type OpenWeekSummary = WeekDirAgg & {
  cashAllSettled: boolean;
};

export function cashAllSettled(agg: Pick<WeekDirAgg, 'driversTotal' | 'driversSettled'>): boolean {
  return agg.driversTotal > 0 && agg.driversSettled === agg.driversTotal;
}

/** Fold driver-period rows into per-week aggregates. */
export function accumulateWeekDirectory(periods: readonly WeekDirPeriodInput[]): WeekDirAgg[] {
  const byWeek = new Map<string, WeekDirAgg>();
  for (const p of periods) {
    const weekKey = String(p.weekKey || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) continue;
    const cur = byWeek.get(weekKey) || {
      weekKey,
      driversTotal: 0,
      driversFrozen: 0,
      driversSettled: 0,
      closedAt: null as string | null,
    };
    cur.driversTotal += 1;
    if (p.settled) cur.driversSettled += 1;
    if (p.frozen) {
      cur.driversFrozen += 1;
      const signed = p.signedAt ? String(p.signedAt) : null;
      if (signed && (!cur.closedAt || signed < cur.closedAt)) cur.closedAt = signed;
    }
    byWeek.set(weekKey, cur);
  }
  return [...byWeek.values()];
}

/** Weeks with activity that are not fully frozen (Open directory). */
export function selectOpenWeeks(aggs: readonly WeekDirAgg[]): OpenWeekSummary[] {
  return aggs
    .filter((a) => a.driversTotal > 0 && a.driversFrozen < a.driversTotal)
    .map((a) => ({ ...a, cashAllSettled: cashAllSettled(a) }))
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

/** Weeks where every driver-period is frozen (Closed directory). */
export function selectFullyFrozenWeeks(aggs: readonly WeekDirAgg[]): WeekDirAgg[] {
  return aggs
    .filter((a) => a.driversTotal > 0 && a.driversFrozen === a.driversTotal)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}
