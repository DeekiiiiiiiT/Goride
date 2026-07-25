/**
 * Pure Fuel Analytics aggregators — period-scoped fuel cost, volume, efficiency.
 */
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';
import type { FuelEntry } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import type { BusinessFinancePeriod } from '../components/business-finance/types';
import { inPeriod, ymd } from '../components/business-finance/periodRange';

export const EFFICIENCY_ALERT_KML = 10;
export const EFFICIENCY_CRASH_PCT = 20;

export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function entryDateYmd(e: FuelEntry): string {
  return String(e.date || '').slice(0, 10);
}

export function filterEntriesInPeriod(
  entries: FuelEntry[],
  period: BusinessFinancePeriod,
): FuelEntry[] {
  return entries.filter((e) => inPeriod(entryDateYmd(e), period));
}

export function normalizeFuelTypeLabel(raw?: string | null): string {
  if (!raw) return 'Unknown';
  const t = String(raw).toLowerCase();
  if (t.includes('diesel')) return 'Diesel';
  if (t.includes('electric') || t === 'ev') return 'Electric';
  if (t.includes('hybrid')) return 'Hybrid';
  if (t.includes('gas') || t.includes('petrol') || t.includes('gasoline')) return 'Petrol';
  return raw;
}

export function resolveEntryFuelType(entry: FuelEntry, vehicle?: Vehicle | null): string {
  const fromMeta =
    (entry as any).fuelType ||
    entry.metadata?.fuelType ||
    vehicle?.fuelSettings?.fuelType;
  return normalizeFuelTypeLabel(fromMeta);
}

export function isAnomalyEntry(e: FuelEntry): boolean {
  if (e.isFlagged) return true;
  const status = e.metadata?.integrityStatus || e.reconciliationStatus || e.auditStatus;
  if (status === 'critical' || status === 'Flagged') return true;
  const reason = String(e.metadata?.anomalyReason || '');
  return (
    reason.includes('Overfill') ||
    reason.includes('High Fuel') ||
    reason.includes('Leakage') ||
    reason.includes('Odometer Gap') ||
    reason.includes('Frequency')
  );
}

export type VehicleFuelStats = {
  vehicleId: string;
  label: string;
  model: string;
  fuelType: string;
  totalCost: number;
  totalLiters: number;
  distanceKm: number;
  efficiencyKmL: number | null;
  costPerKm: number | null;
  refuelCount: number;
  anomalyCost: number;
  status: 'optimal' | 'attention' | 'standard';
};

function vehicleLabel(v: Vehicle | undefined, id: string): string {
  if (!v) return id.slice(0, 8);
  return v.licensePlate || v.name || id.slice(0, 8);
}

/** Per-vehicle odo span + spend for a set of entries. */
export function buildVehicleFuelStats(
  entries: FuelEntry[],
  vehicles: Vehicle[],
): VehicleFuelStats[] {
  const byVehicle = new Map<string, FuelEntry[]>();
  entries.forEach((e) => {
    if (!e.vehicleId) return;
    if (!byVehicle.has(e.vehicleId)) byVehicle.set(e.vehicleId, []);
    byVehicle.get(e.vehicleId)!.push(e);
  });

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  return Array.from(byVehicle.entries()).map(([vehicleId, vEntries]) => {
    const vehicle = vehicleMap.get(vehicleId);
    const sorted = [...vEntries].sort((a, b) => {
      const d = entryDateYmd(a).localeCompare(entryDateYmd(b));
      if (d !== 0) return d;
      return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
    });

    const totalCost = sorted.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalLiters = sorted.reduce((s, e) => s + (Number(e.liters) || 0), 0);
    const anomalyCost = sorted
      .filter(isAnomalyEntry)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const odoVals = sorted
      .map((e) => Number(e.odometer) || 0)
      .filter((o) => o > 0);
    let distanceKm = 0;
    if (odoVals.length >= 2) {
      distanceKm = Math.max(0, Math.max(...odoVals) - Math.min(...odoVals));
    }

    const efficiencyKmL =
      distanceKm > 0 && totalLiters > 0 ? distanceKm / totalLiters : null;
    const costPerKm = distanceKm > 0 ? totalCost / distanceKm : null;

    let status: VehicleFuelStats['status'] = 'standard';
    if (efficiencyKmL != null) {
      if (efficiencyKmL >= EFFICIENCY_ALERT_KML + 2) status = 'optimal';
      else if (efficiencyKmL < EFFICIENCY_ALERT_KML) status = 'attention';
    } else if (anomalyCost > 0) {
      status = 'attention';
    }

    return {
      vehicleId,
      label: vehicleLabel(vehicle, vehicleId),
      model: vehicle?.model || vehicle?.make || '',
      fuelType: normalizeFuelTypeLabel(vehicle?.fuelSettings?.fuelType),
      totalCost,
      totalLiters,
      distanceKm,
      efficiencyKmL,
      costPerKm,
      refuelCount: sorted.length,
      anomalyCost,
      status,
    };
  });
}

export type DailyConsumptionPoint = {
  date: string;
  label: string;
  liters: number;
  distanceKm: number;
  cost: number;
};

/** Daily litres + odo-derived distance (fleet-wide, summed per vehicle day-span approx). */
export function buildDailyConsumption(
  entries: FuelEntry[],
  period: BusinessFinancePeriod,
): DailyConsumptionPoint[] {
  let days: Date[];
  try {
    days = eachDayOfInterval({
      start: parseISO(period.startYmd),
      end: parseISO(period.endYmd),
    });
  } catch {
    return [];
  }

  const byDay = new Map<string, { liters: number; cost: number }>();
  days.forEach((d) => byDay.set(ymd(d), { liters: 0, cost: 0 }));

  entries.forEach((e) => {
    const key = entryDateYmd(e);
    const bucket = byDay.get(key);
    if (!bucket) return;
    bucket.liters += Number(e.liters) || 0;
    bucket.cost += Number(e.amount) || 0;
  });

  // Distance proxy: odo deltas attributed to the later fill's day
  const byVehicle = new Map<string, FuelEntry[]>();
  entries.forEach((e) => {
    if (!e.vehicleId || !(Number(e.odometer) > 0)) return;
    if (!byVehicle.has(e.vehicleId)) byVehicle.set(e.vehicleId, []);
    byVehicle.get(e.vehicleId)!.push(e);
  });

  const distanceByDay = new Map<string, number>();
  byVehicle.forEach((list) => {
    const sorted = [...list].sort((a, b) => {
      const d = entryDateYmd(a).localeCompare(entryDateYmd(b));
      if (d !== 0) return d;
      return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
    });
    for (let i = 1; i < sorted.length; i++) {
      const prev = Number(sorted[i - 1].odometer) || 0;
      const cur = Number(sorted[i].odometer) || 0;
      const delta = cur - prev;
      if (delta <= 0) continue;
      const key = entryDateYmd(sorted[i]);
      distanceByDay.set(key, (distanceByDay.get(key) || 0) + delta);
    }
  });

  return days.map((d) => {
    const key = ymd(d);
    const b = byDay.get(key)!;
    return {
      date: key,
      label: format(d, 'EEE'),
      liters: Number(b.liters.toFixed(1)),
      distanceKm: Number((distanceByDay.get(key) || 0).toFixed(1)),
      cost: Number(b.cost.toFixed(2)),
    };
  });
}

export type WeeklyEfficiencyPoint = {
  weekStart: string;
  label: string;
  efficiencyKmL: number | null;
  movingAvg: number | null;
};

export function buildWeeklyEfficiencyTrend(
  entries: FuelEntry[],
  vehicles: Vehicle[],
  lookbackWeeks = 8,
  now = new Date(),
): WeeklyEfficiencyPoint[] {
  const end = startOfWeek(now, { weekStartsOn: 1 });
  const start = new Date(end);
  start.setDate(start.getDate() - (lookbackWeeks - 1) * 7);

  let weeks: Date[];
  try {
    weeks = eachWeekOfInterval(
      { start, end },
      { weekStartsOn: 1 },
    );
  } catch {
    return [];
  }

  const points: WeeklyEfficiencyPoint[] = weeks.map((w) => {
    const weekStart = ymd(w);
    const weekEnd = ymd(new Date(w.getTime() + 6 * 86400000));
    const period: BusinessFinancePeriod = {
      preset: 'custom',
      startYmd: weekStart,
      endYmd: weekEnd,
    };
    const weekEntries = filterEntriesInPeriod(entries, period);
    const stats = buildVehicleFuelStats(weekEntries, vehicles);
    const totalDist = stats.reduce((s, r) => s + r.distanceKm, 0);
    const totalLiters = stats.reduce((s, r) => s + r.totalLiters, 0);
    const efficiencyKmL =
      totalDist > 0 && totalLiters > 0 ? totalDist / totalLiters : null;
    return {
      weekStart,
      label: `W${format(w, 'w')}`,
      efficiencyKmL: efficiencyKmL != null ? Number(efficiencyKmL.toFixed(2)) : null,
      movingAvg: null,
    };
  });

  // 3-week simple moving average
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 2), i + 1).filter((p) => p.efficiencyKmL != null);
    if (window.length === 0) continue;
    const avg =
      window.reduce((s, p) => s + (p.efficiencyKmL || 0), 0) / window.length;
    points[i].movingAvg = Number(avg.toFixed(2));
  }

  return points;
}

export type HeatmapCell = {
  vehicleId: string;
  label: string;
  weekStart: string;
  weekLabel: string;
  efficiencyKmL: number | null;
};

export function buildEfficiencyHeatmap(
  entries: FuelEntry[],
  vehicles: Vehicle[],
  lookbackWeeks = 6,
  maxVehicles = 8,
  now = new Date(),
): { weeks: string[]; weekLabels: string[]; rows: Array<{ vehicleId: string; label: string; cells: HeatmapCell[] }> } {
  const end = startOfWeek(now, { weekStartsOn: 1 });
  const start = new Date(end);
  start.setDate(start.getDate() - (lookbackWeeks - 1) * 7);

  let weeks: Date[];
  try {
    weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  } catch {
    return { weeks: [], weekLabels: [], rows: [] };
  }

  const weekStarts = weeks.map((w) => ymd(w));
  const weekLabels = weeks.map((w) => format(w, 'dd/MM'));

  const activeStats = buildVehicleFuelStats(
    filterEntriesInPeriod(entries, {
      preset: 'custom',
      startYmd: weekStarts[0],
      endYmd: ymd(new Date(weeks[weeks.length - 1].getTime() + 6 * 86400000)),
    }),
    vehicles,
  )
    .sort((a, b) => b.totalLiters - a.totalLiters)
    .slice(0, maxVehicles);

  const rows = activeStats.map((v) => {
    const cells: HeatmapCell[] = weeks.map((w, i) => {
      const weekStart = weekStarts[i];
      const weekEnd = ymd(new Date(w.getTime() + 6 * 86400000));
      const weekEntries = filterEntriesInPeriod(entries, {
        preset: 'custom',
        startYmd: weekStart,
        endYmd: weekEnd,
      }).filter((e) => e.vehicleId === v.vehicleId);
      const stats = buildVehicleFuelStats(weekEntries, vehicles)[0];
      return {
        vehicleId: v.vehicleId,
        label: v.label,
        weekStart,
        weekLabel: weekLabels[i],
        efficiencyKmL: stats?.efficiencyKmL ?? null,
      };
    });
    return { vehicleId: v.vehicleId, label: v.label, cells };
  });

  return { weeks: weekStarts, weekLabels, rows };
}

export type FuelCompositionSlice = {
  name: string;
  value: number;
  pct: number;
  color: string;
};

const COMPOSITION_COLORS: Record<string, string> = {
  Diesel: '#4f46e5',
  Petrol: '#10b981',
  Electric: '#f59e0b',
  Hybrid: '#06b6d4',
  Unknown: '#94a3b8',
};

export function buildFuelComposition(
  entries: FuelEntry[],
  vehicles: Vehicle[],
): FuelCompositionSlice[] {
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const totals = new Map<string, number>();
  let sum = 0;
  entries.forEach((e) => {
    const label = resolveEntryFuelType(e, e.vehicleId ? vehicleMap.get(e.vehicleId) : null);
    const cost = Number(e.amount) || 0;
    totals.set(label, (totals.get(label) || 0) + cost);
    sum += cost;
  });
  if (sum <= 0) return [];
  return Array.from(totals.entries())
    .map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
      pct: Number(((value / sum) * 100).toFixed(1)),
      color: COMPOSITION_COLORS[name] || COMPOSITION_COLORS.Unknown,
    }))
    .sort((a, b) => b.value - a.value);
}

export type PricePoint = {
  date: string;
  label: string;
  avgPrice: number | null;
};

export function buildPriceSeries(
  entries: FuelEntry[],
  period: BusinessFinancePeriod,
): PricePoint[] {
  let days: Date[];
  try {
    days = eachDayOfInterval({
      start: parseISO(period.startYmd),
      end: parseISO(period.endYmd),
    });
  } catch {
    return [];
  }

  return days.map((d) => {
    const key = ymd(d);
    const dayEntries = entries.filter((e) => entryDateYmd(e) === key);
    let weighted = 0;
    let liters = 0;
    dayEntries.forEach((e) => {
      const L = Number(e.liters) || 0;
      const p =
        Number(e.pricePerLiter) ||
        (L > 0 ? (Number(e.amount) || 0) / L : 0);
      if (L > 0 && p > 0) {
        weighted += p * L;
        liters += L;
      }
    });
    return {
      date: key,
      label: format(d, 'MMM d'),
      avgPrice: liters > 0 ? Number((weighted / liters).toFixed(2)) : null,
    };
  });
}

export type FlaggedEvent = {
  id: string;
  date: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  vehicleId?: string;
  plate?: string;
};

export function buildFlaggedEvents(
  entries: FuelEntry[],
  vehicles: Vehicle[],
  limit = 8,
): FlaggedEvent[] {
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  return entries
    .filter(isAnomalyEntry)
    .sort((a, b) => entryDateYmd(b).localeCompare(entryDateYmd(a)))
    .slice(0, limit)
    .map((e) => {
      const reason = String(e.metadata?.anomalyReason || 'Anomaly Detected');
      const plate = e.vehicleId
        ? vehicleLabel(vehicleMap.get(e.vehicleId), e.vehicleId)
        : 'Unknown';
      const liters = Number(e.liters) || 0;
      const cost = Number(e.amount) || 0;
      const severity: FlaggedEvent['severity'] =
        e.metadata?.integrityStatus === 'critical' || reason.includes('Overfill') || reason.includes('Leakage')
          ? 'critical'
          : 'warning';
      return {
        id: e.id,
        date: entryDateYmd(e),
        severity,
        title: reason,
        detail: `${plate} · ${liters.toFixed(1)} L · $${cost.toFixed(2)}${
          e.location ? ` · ${e.location}` : ''
        }`,
        vehicleId: e.vehicleId,
        plate,
      };
    });
}

/** Detect week-over-week efficiency crashes (>20% drop). */
export function detectEfficiencyCrashes(
  entries: FuelEntry[],
  vehicles: Vehicle[],
  now = new Date(),
): FlaggedEvent[] {
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisStart = ymd(thisWeekStart);
  const thisEnd = ymd(new Date(thisWeekStart.getTime() + 6 * 86400000));
  const prevStart = ymd(new Date(thisWeekStart.getTime() - 7 * 86400000));
  const prevEnd = ymd(new Date(thisWeekStart.getTime() - 1 * 86400000));

  const curr = buildVehicleFuelStats(
    filterEntriesInPeriod(entries, { preset: 'custom', startYmd: thisStart, endYmd: thisEnd }),
    vehicles,
  );
  const prev = buildVehicleFuelStats(
    filterEntriesInPeriod(entries, { preset: 'custom', startYmd: prevStart, endYmd: prevEnd }),
    vehicles,
  );
  const prevMap = new Map(prev.map((r) => [r.vehicleId, r]));

  const crashes: FlaggedEvent[] = [];
  curr.forEach((c) => {
    const p = prevMap.get(c.vehicleId);
    if (!c.efficiencyKmL || !p?.efficiencyKmL || p.efficiencyKmL <= 0) return;
    const dropPct = ((p.efficiencyKmL - c.efficiencyKmL) / p.efficiencyKmL) * 100;
    if (dropPct < EFFICIENCY_CRASH_PCT) return;
    crashes.push({
      id: `crash-${c.vehicleId}`,
      date: thisStart,
      severity: 'critical',
      title: 'Efficiency Crash',
      detail: `${c.label} dropped from ${p.efficiencyKmL.toFixed(1)} to ${c.efficiencyKmL.toFixed(1)} km/L (−${dropPct.toFixed(0)}%).`,
      vehicleId: c.vehicleId,
      plate: c.label,
    });
  });
  return crashes;
}

export function sparklineFromEntries(
  entries: FuelEntry[],
  period: BusinessFinancePeriod,
  valueFn: (e: FuelEntry) => number,
): number[] {
  let days: Date[];
  try {
    days = eachDayOfInterval({
      start: parseISO(period.startYmd),
      end: parseISO(period.endYmd),
    });
  } catch {
    return [];
  }
  const slice = days.length > 14 ? days.slice(-14) : days;
  return slice.map((d) => {
    const key = ymd(d);
    return entries
      .filter((e) => entryDateYmd(e) === key)
      .reduce((s, e) => s + valueFn(e), 0);
  });
}

/** Fleet target km/L from vehicle city efficiency (L/100km → km/L) when available. */
export function fleetTargetKmL(vehicles: Vehicle[]): number {
  const vals = vehicles
    .map((v) => Number(v.fuelSettings?.efficiencyCity) || 0)
    .filter((n) => n > 0)
    .map((l100) => (l100 > 0 ? 100 / l100 : 0))
    .filter((n) => n > 0 && n < 50);
  if (vals.length === 0) return 12;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}
