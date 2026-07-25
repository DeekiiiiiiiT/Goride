/**
 * Pure Driver Analytics aggregators — trips + imported DriverMetrics only.
 * No invented CX/onboarding fields.
 */
import { eachDayOfInterval, format, parseISO, differenceInCalendarDays } from 'date-fns';
import type { Trip, DriverMetrics } from '../types/data';
import type { BusinessFinancePeriod } from '../components/business-finance/types';
import { inPeriod, ymd } from '../components/business-finance/periodRange';
import { getTripGrossRevenue } from './tripEarnings';

export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function tripDateYmd(t: Trip): string {
  return String(t.date || '').slice(0, 10);
}

export function filterTripsInPeriod(trips: Trip[], period: BusinessFinancePeriod): Trip[] {
  return trips.filter((t) => inPeriod(tripDateYmd(t), period));
}

export function isCompletedTrip(t: Trip): boolean {
  const s = String(t.status || '').toLowerCase();
  return !s || s === 'completed';
}

export function isCancelledTrip(t: Trip): boolean {
  return String(t.status || '').toLowerCase() === 'cancelled';
}

/** Latest metrics row per driverId (by periodEnd). */
export function latestMetricsByDriver(metrics: DriverMetrics[]): Map<string, DriverMetrics> {
  const map = new Map<string, DriverMetrics>();
  metrics.forEach((m) => {
    if (!m.driverId) return;
    const prev = map.get(m.driverId);
    if (!prev) {
      map.set(m.driverId, m);
      return;
    }
    const prevEnd = String(prev.periodEnd || prev.periodStart || '');
    const nextEnd = String(m.periodEnd || m.periodStart || '');
    if (nextEnd >= prevEnd) map.set(m.driverId, m);
  });
  return map;
}

export type DriverRow = {
  driverId: string;
  name: string;
  trips: number;
  cancelled: number;
  earnings: number;
  distanceKm: number;
  onlineHours: number | null;
  onTripHours: number | null;
  utilizationPct: number | null;
  acceptanceRate: number | null; // 0-1
  cancellationRate: number | null; // 0-1 from metrics, else cancelled/(trips+cancelled)
  rating: number | null;
  tier: string | null;
  status: 'active' | 'inactive';
};

export function buildDriverRows(
  trips: Trip[],
  drivers: Array<{ id?: string; driverId?: string; name?: string; status?: string }>,
  metricsMap: Map<string, DriverMetrics>,
): DriverRow[] {
  const byDriver = new Map<string, Trip[]>();
  trips.forEach((t) => {
    if (!t.driverId || t.driverId === 'unknown') return;
    if (!byDriver.has(t.driverId)) byDriver.set(t.driverId, []);
    byDriver.get(t.driverId)!.push(t);
  });

  const driverIds = new Set<string>();
  drivers.forEach((d) => {
    const id = d.id || d.driverId;
    if (id) driverIds.add(id);
  });
  byDriver.forEach((_, id) => driverIds.add(id));

  const nameById = new Map<string, string>();
  drivers.forEach((d) => {
    const id = d.id || d.driverId;
    if (id && d.name) nameById.set(id, d.name);
  });

  return Array.from(driverIds).map((driverId) => {
    const dTrips = byDriver.get(driverId) || [];
    const completed = dTrips.filter(isCompletedTrip);
    const cancelled = dTrips.filter(isCancelledTrip);
    const earnings = completed.reduce((s, t) => s + getTripGrossRevenue(t), 0);
    const distanceKm = completed.reduce((s, t) => s + (Number(t.distance) || 0), 0);
    const m = metricsMap.get(driverId);
    const onlineHours = m?.onlineHours != null && m.onlineHours > 0 ? m.onlineHours : null;
    const onTripHours = m?.onTripHours != null ? m.onTripHours : null;
    const utilizationPct =
      onlineHours != null && onlineHours > 0 && onTripHours != null
        ? (onTripHours / onlineHours) * 100
        : null;

    const tripCancelRate =
      completed.length + cancelled.length > 0
        ? cancelled.length / (completed.length + cancelled.length)
        : null;

    const name =
      nameById.get(driverId) ||
      m?.driverName ||
      completed[0]?.driverName ||
      dTrips[0]?.driverName ||
      driverId.slice(0, 8);

    return {
      driverId,
      name,
      trips: completed.length,
      cancelled: cancelled.length,
      earnings,
      distanceKm,
      onlineHours,
      onTripHours,
      utilizationPct,
      acceptanceRate: m?.acceptanceRate != null ? m.acceptanceRate : null,
      cancellationRate: m?.cancellationRate != null ? m.cancellationRate : tripCancelRate,
      rating: m?.ratingLast500 != null && m.ratingLast500 > 0 ? m.ratingLast500 : m?.ratingLast4Weeks || null,
      tier: m?.tier || null,
      status: completed.length > 0 ? 'active' : 'inactive',
    };
  });
}

export type DriverKpis = {
  activeDrivers: number;
  totalDrivers: number;
  activeRatePct: number;
  activeDeltaPct: number | null;
  grossRevenue: number;
  revenueDeltaPct: number | null;
  avgEarnings: number | null;
  avgEarningsDeltaPct: number | null;
  utilizationPct: number | null;
  utilizationDeltaPct: number | null;
  acceptancePct: number | null;
  acceptanceDeltaPct: number | null;
  avgRating: number | null;
  ratingDeltaPct: number | null;
  revenueSpark: number[];
  tripsSpark: number[];
};

export function sparklineFromTrips(
  trips: Trip[],
  period: BusinessFinancePeriod,
  valueFn: (t: Trip) => number,
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
    return trips
      .filter((t) => tripDateYmd(t) === key && isCompletedTrip(t))
      .reduce((s, t) => s + valueFn(t), 0);
  });
}

export function buildDriverKpis(
  periodRows: DriverRow[],
  priorRows: DriverRow[],
  periodTrips: Trip[],
  priorTrips: Trip[],
  period: BusinessFinancePeriod,
  totalDrivers: number,
): DriverKpis {
  const active = periodRows.filter((r) => r.status === 'active');
  const priorActive = priorRows.filter((r) => r.status === 'active');
  const grossRevenue = periodTrips.filter(isCompletedTrip).reduce((s, t) => s + getTripGrossRevenue(t), 0);
  const priorRevenue = priorTrips.filter(isCompletedTrip).reduce((s, t) => s + getTripGrossRevenue(t), 0);

  const avgEarnings = active.length > 0 ? grossRevenue / active.length : null;
  const priorAvg =
    priorActive.length > 0 ? priorRevenue / priorActive.length : null;

  const utilVals = active.map((r) => r.utilizationPct).filter((u): u is number => u != null);
  const utilizationPct =
    utilVals.length > 0 ? utilVals.reduce((a, b) => a + b, 0) / utilVals.length : null;
  const priorUtilVals = priorActive.map((r) => r.utilizationPct).filter((u): u is number => u != null);
  const priorUtil =
    priorUtilVals.length > 0 ? priorUtilVals.reduce((a, b) => a + b, 0) / priorUtilVals.length : null;

  const acceptVals = active.map((r) => r.acceptanceRate).filter((u): u is number => u != null);
  const acceptancePct =
    acceptVals.length > 0 ? (acceptVals.reduce((a, b) => a + b, 0) / acceptVals.length) * 100 : null;
  const priorAcceptVals = priorActive.map((r) => r.acceptanceRate).filter((u): u is number => u != null);
  const priorAccept =
    priorAcceptVals.length > 0
      ? (priorAcceptVals.reduce((a, b) => a + b, 0) / priorAcceptVals.length) * 100
      : null;

  const ratingVals = active.map((r) => r.rating).filter((u): u is number => u != null && u > 0);
  const avgRating =
    ratingVals.length > 0 ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : null;
  const priorRatingVals = priorActive.map((r) => r.rating).filter((u): u is number => u != null && u > 0);
  const priorRating =
    priorRatingVals.length > 0
      ? priorRatingVals.reduce((a, b) => a + b, 0) / priorRatingVals.length
      : null;

  const total = Math.max(totalDrivers, periodRows.length);

  return {
    activeDrivers: active.length,
    totalDrivers: total,
    activeRatePct: total > 0 ? (active.length / total) * 100 : 0,
    activeDeltaPct: pctDelta(active.length, priorActive.length),
    grossRevenue,
    revenueDeltaPct: pctDelta(grossRevenue, priorRevenue),
    avgEarnings,
    avgEarningsDeltaPct:
      avgEarnings != null && priorAvg != null ? pctDelta(avgEarnings, priorAvg) : null,
    utilizationPct: utilizationPct != null ? Number(utilizationPct.toFixed(1)) : null,
    utilizationDeltaPct:
      utilizationPct != null && priorUtil != null ? pctDelta(utilizationPct, priorUtil) : null,
    acceptancePct: acceptancePct != null ? Number(acceptancePct.toFixed(1)) : null,
    acceptanceDeltaPct:
      acceptancePct != null && priorAccept != null ? pctDelta(acceptancePct, priorAccept) : null,
    avgRating: avgRating != null ? Number(avgRating.toFixed(2)) : null,
    ratingDeltaPct: avgRating != null && priorRating != null ? pctDelta(avgRating, priorRating) : null,
    revenueSpark: sparklineFromTrips(periodTrips, period, (t) => getTripGrossRevenue(t)),
    tripsSpark: sparklineFromTrips(periodTrips, period, () => 1),
  };
}

export type HeatCell = { day: number; hour: number; count: number };

/** Trip density by weekday (0=Mon) × hour — uses timeOfDay or requestTime/date. */
export function buildUtilizationHeatmap(trips: Trip[]): { days: string[]; hours: number[]; cells: number[][] } {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  trips.filter(isCompletedTrip).forEach((t) => {
    let hour = t.timeOfDay;
    if (hour == null || hour < 0 || hour > 23) {
      const rt = t.requestTime || t.dropoffTime;
      if (rt) {
        const d = new Date(rt);
        if (!Number.isNaN(d.getTime())) hour = d.getHours();
      }
    }
    if (hour == null || hour < 0 || hour > 23) hour = 12; // midday bucket if unknown

    let dow: number | null = null;
    if (t.dayOfWeek) {
      const map: Record<string, number> = {
        mon: 0, monday: 0, tue: 1, tuesday: 1, wed: 2, wednesday: 2,
        thu: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
      };
      dow = map[String(t.dayOfWeek).toLowerCase()] ?? null;
    }
    if (dow == null) {
      const d = parseISO(tripDateYmd(t));
      if (!Number.isNaN(d.getTime())) {
        // JS: 0=Sun → convert to Mon=0
        const js = d.getDay();
        dow = js === 0 ? 6 : js - 1;
      }
    }
    if (dow == null) return;
    grid[dow][hour] += 1;
  });

  return { days, hours, cells: grid };
}

export type PlatformSlice = { name: string; earnings: number; trips: number; pct: number; color: string };

const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  Roam: '#6366f1',
  Private: '#f59e0b',
  Cash: '#84cc16',
  Other: '#64748b',
};

export function buildPlatformMix(trips: Trip[]): PlatformSlice[] {
  const map = new Map<string, { earnings: number; trips: number }>();
  trips.filter(isCompletedTrip).forEach((t) => {
    const name = t.platform || 'Other';
    const cur = map.get(name) || { earnings: 0, trips: 0 };
    cur.earnings += getTripGrossRevenue(t);
    cur.trips += 1;
    map.set(name, cur);
  });
  const total = Array.from(map.values()).reduce((s, v) => s + v.earnings, 0);
  if (total <= 0) return [];
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      earnings: Number(v.earnings.toFixed(2)),
      trips: v.trips,
      pct: Number(((v.earnings / total) * 100).toFixed(1)),
      color: PLATFORM_COLORS[name] || PLATFORM_COLORS.Other,
    }))
    .sort((a, b) => b.earnings - a.earnings);
}

export type DriverAlert = {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  driverId?: string;
};

export function buildDriverAlerts(
  periodRows: DriverRow[],
  priorRows: DriverRow[],
): DriverAlert[] {
  const priorMap = new Map(priorRows.map((r) => [r.driverId, r]));
  const alerts: DriverAlert[] = [];

  periodRows.forEach((r) => {
    const cancelPct = (r.cancellationRate ?? 0) * 100;
    if (r.trips + r.cancelled >= 3 && cancelPct >= 20) {
      alerts.push({
        id: `cancel-${r.driverId}`,
        severity: 'critical',
        title: `${r.name} Cancellation Surge`,
        detail: `Cancelled ${(cancelPct).toFixed(0)}% of trips in this period (${r.cancelled} of ${r.trips + r.cancelled}).`,
        driverId: r.driverId,
      });
    }

    const prev = priorMap.get(r.driverId);
    if (prev && prev.earnings > 0 && r.status === 'active') {
      const drop = ((prev.earnings - r.earnings) / prev.earnings) * 100;
      if (drop >= 35) {
        alerts.push({
          id: `earn-${r.driverId}`,
          severity: 'warning',
          title: `Earnings Drop: ${r.name}`,
          detail: `${drop.toFixed(0)}% below previous period ($${r.earnings.toFixed(0)} vs $${prev.earnings.toFixed(0)}).`,
          driverId: r.driverId,
        });
      }
    }

    if (r.rating != null && r.rating > 0 && r.rating < 4.0 && r.trips >= 3) {
      alerts.push({
        id: `rating-${r.driverId}`,
        severity: 'warning',
        title: `Low Rating: ${r.name}`,
        detail: `Rating ${r.rating.toFixed(1)} / 5 across ${r.trips} trips.`,
        driverId: r.driverId,
      });
    }
  });

  return alerts.slice(0, 8);
}

/** Tenure buckets from driver createdAt / hireDate when present. */
export function buildTenureDistribution(
  drivers: Array<{ id?: string; driverId?: string; createdAt?: string; hireDate?: string; startDate?: string }>,
  now = new Date(),
): Array<{ label: string; count: number }> {
  const buckets = [
    { label: '0–3 months', maxDays: 90, count: 0 },
    { label: '3–6 months', maxDays: 180, count: 0 },
    { label: '6–12 months', maxDays: 365, count: 0 },
    { label: '1 year+', maxDays: Infinity, count: 0 },
  ];
  let used = 0;
  drivers.forEach((d) => {
    const raw = d.createdAt || d.hireDate || d.startDate;
    if (!raw) return;
    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) return;
    const days = Math.max(0, differenceInCalendarDays(now, start));
    used += 1;
    if (days <= 90) buckets[0].count += 1;
    else if (days <= 180) buckets[1].count += 1;
    else if (days <= 365) buckets[2].count += 1;
    else buckets[3].count += 1;
  });
  if (used === 0) return [];
  return buckets.map((b) => ({ label: b.label, count: b.count }));
}
