/**
 * Projection stub for future `driver_operational_periods` table.
 * Pure summary from trip rows — can later persist per (driverId, from, to).
 */

export type OperationalTripLike = {
  status?: string | null;
  date?: string | null;
  requestTime?: string | null;
  distance?: number | null;
  distanceKm?: number | null;
  platform?: string | null;
};

export type OperationalPeriodSummary = {
  from: string;
  to: string;
  totalTrips: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  cancellationRate: number;
  totalDistanceKm: number;
  byPlatform: Record<string, { trips: number; completed: number; cancelled: number }>;
};

function tripDay(t: OperationalTripLike): string {
  const raw = String(t.requestTime || t.date || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

function inRange(day: string, from: string, to: string): boolean {
  if (!day || day.length < 10) return false;
  return day >= from && day <= to;
}

/**
 * Build an operational period rollup from trips in [from, to] (inclusive YMD).
 */
export function buildOperationalPeriodSummary(
  trips: OperationalTripLike[],
  from: string,
  to: string,
): OperationalPeriodSummary {
  const fromYmd = String(from || "").slice(0, 10);
  const toYmd = String(to || "").slice(0, 10);
  let completed = 0;
  let cancelled = 0;
  let totalDistanceKm = 0;
  const byPlatform: Record<string, { trips: number; completed: number; cancelled: number }> = {};

  for (const t of trips || []) {
    const day = tripDay(t);
    if (!inRange(day, fromYmd, toYmd)) continue;
    const status = String(t.status || "");
    const platform = String(t.platform || "Other").trim() || "Other";
    if (!byPlatform[platform]) {
      byPlatform[platform] = { trips: 0, completed: 0, cancelled: 0 };
    }
    byPlatform[platform].trips += 1;
    const dist = Number(t.distanceKm ?? t.distance) || 0;
    if (status === "Completed") {
      completed += 1;
      byPlatform[platform].completed += 1;
      totalDistanceKm += dist;
    } else if (status === "Cancelled") {
      cancelled += 1;
      byPlatform[platform].cancelled += 1;
    }
  }

  const totalTrips = completed + cancelled;
  return {
    from: fromYmd,
    to: toYmd,
    totalTrips,
    completed,
    cancelled,
    completionRate: totalTrips > 0 ? (completed / totalTrips) * 100 : 0,
    cancellationRate: totalTrips > 0 ? (cancelled / totalTrips) * 100 : 0,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    byPlatform,
  };
}
