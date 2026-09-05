/**
 * Canonical period distance / fuel / spend for Transaction Logs + Full Tanks.
 *
 * Primary = progress **inside the selected period**, clipped per cycle.
 * A capacity-close that started before the week must NOT dump its full multi-week
 * totals into this week's KPI (e.g. Aug 19→Sep 1 close under Aug 31–Sep 6).
 */
import type { FuelCycle, FuelEntry } from '../types/fuel';
import { sumOdometerDeltasBetweenFills } from './fuelLogKpiMetrics';

export type PeriodDistance = {
  /** Canonical — km driven inside the selected period */
  primaryKm: number;
  /** Sum of raw cycle.distance for overlapping cycles (unclipped — display only) */
  fullCycleKm: number;
  /** Fill-to-fill within scoped entries */
  fillToFillKm: number;
  /** Km from before the period that overlapping cycles still carry in their full total */
  carriedInKm: number;
  primaryLabel: string;
  secondaryLabel: string;
};

export type PeriodBounds = {
  start?: string | null; // YYYY-MM-DD
  end?: string | null;
};

export type TrustedPeriodTotals = {
  distanceKm: number;
  fuelL: number;
  spend: number;
  carriedInKm: number;
  provisional: boolean;
};

function ymd(value: string | undefined | null): string {
  return String(value || '').split('T')[0];
}

function isValidOdo(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function inPeriodYmd(date: string | undefined | null, start: string, end: string): boolean {
  const d = ymd(date);
  if (!d) return false;
  return d >= start && d <= end;
}

/**
 * Distance of one cycle that falls inside [periodStart, periodEnd].
 * Uses fill odometers when present; never returns the full multi-week span when
 * the cycle opened before the period.
 */
export function clipCycleDistanceToPeriod(
  cycle: FuelCycle,
  periodStart?: string | null,
  periodEnd?: string | null,
): number {
  const full = Number(cycle.distance) || 0;
  if (!periodStart && !periodEnd) return full;

  const start = periodStart || '0000-01-01';
  const end = periodEnd || '9999-12-31';
  const cStart = ymd(cycle.startDate);
  const cEnd = ymd(cycle.endDate);

  // No overlap
  if (cEnd && cEnd < start) return 0;
  if (cStart && cStart > end) return 0;

  // Fully inside the period — entire cycle distance belongs here
  if (cStart && cEnd && cStart >= start && cEnd <= end) return full;

  const txs = [...(cycle.transactions || [])]
    .map((t) => ({ ymd: ymd(t.date), odo: Number(t.odometer) }))
    .filter((t) => isValidOdo(t.odo))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.odo - b.odo);

  // Odo at the moment the period begins (inside this cycle)
  let baseline: number | null = null;
  if (cStart >= start) {
    baseline = isValidOdo(Number(cycle.startOdometer)) ? Number(cycle.startOdometer) : null;
  } else {
    for (const t of txs) {
      if (t.ymd < start) baseline = t.odo;
      else break;
    }
    // No fill before the period — start counting from the first in-period fill
    if (baseline == null) {
      const firstIn = txs.find((t) => t.ymd >= start && t.ymd <= end);
      baseline = firstIn ? firstIn.odo : null;
    }
  }

  // Odo at the end of the period (or cycle end if it closes inside the period)
  let endOdo: number | null = null;
  if (cEnd && cEnd <= end && isValidOdo(Number(cycle.endOdometer))) {
    endOdo = Number(cycle.endOdometer);
  } else {
    for (const t of txs) {
      if (t.ymd <= end) endOdo = t.odo;
    }
  }

  if (baseline != null && endOdo != null && endOdo >= baseline) {
    return Math.round((endOdo - baseline) * 100) / 100;
  }

  // Last resort: sum positive fill-to-fill deltas strictly inside the period
  let prev: number | null = baseline;
  let sum = 0;
  for (const t of txs) {
    if (t.ymd < start || t.ymd > end) continue;
    if (prev != null && t.odo >= prev) sum += t.odo - prev;
    prev = t.odo;
  }
  return Math.round(sum * 100) / 100;
}

function cycleFillsForClip(
  cycle: FuelCycle,
  lookbackEntries?: FuelEntry[],
): FuelEntry[] {
  if (cycle.transactions?.length) return cycle.transactions;
  if (!lookbackEntries?.length) return [];
  const vid = cycle.vehicleId;
  const cStart = ymd(cycle.startDate);
  const cEnd = ymd(cycle.endDate) || cStart;
  return lookbackEntries.filter((e) => {
    if (vid && e.vehicleId && e.vehicleId !== vid) return false;
    const d = ymd(e.date);
    if (!d) return false;
    if (cStart && d < cStart) return false;
    if (cEnd && d > cEnd) return false;
    return true;
  });
}

/**
 * Fuel liters attributed to the selected period for one trusted cycle.
 * Prefer distance share when odo clip is known; else sum in-period fill liters.
 */
export function clipCycleFuelToPeriod(
  cycle: FuelCycle,
  period?: PeriodBounds,
  lookbackEntries?: FuelEntry[],
): number {
  const fullLiters = Number(cycle.totalLiters) || 0;
  if (!period?.start && !period?.end) return fullLiters;

  const start = period?.start || '0000-01-01';
  const end = period?.end || '9999-12-31';
  const fullDist = Number(cycle.distance) || 0;
  const clippedDist = clipCycleDistanceToPeriod(cycle, period?.start, period?.end);

  if (fullDist > 0 && clippedDist >= 0) {
    if (clippedDist === 0) return 0;
    if (Math.abs(clippedDist - fullDist) < 0.5) return Math.round(fullLiters * 100) / 100;
    return Math.round(fullLiters * (clippedDist / fullDist) * 100) / 100;
  }

  const fills = cycleFillsForClip(cycle, lookbackEntries);
  const sum = fills.reduce((s, t) => {
    if (!inPeriodYmd(t.date, start, end)) return s;
    const L = Number(t.volumeContributed ?? t.liters) || 0;
    return s + L;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Spend attributed to the selected period for one trusted cycle.
 */
export function clipCycleSpendToPeriod(
  cycle: FuelCycle,
  period?: PeriodBounds,
  lookbackEntries?: FuelEntry[],
): number {
  const fullSpend = Number(cycle.totalCost) || 0;
  if (!period?.start && !period?.end) return fullSpend;

  const start = period?.start || '0000-01-01';
  const end = period?.end || '9999-12-31';
  const fullDist = Number(cycle.distance) || 0;
  const clippedDist = clipCycleDistanceToPeriod(cycle, period?.start, period?.end);

  if (fullDist > 0 && clippedDist >= 0) {
    if (clippedDist === 0) return 0;
    if (Math.abs(clippedDist - fullDist) < 0.5) return Math.round(fullSpend * 100) / 100;
    return Math.round(fullSpend * (clippedDist / fullDist) * 100) / 100;
  }

  const fills = cycleFillsForClip(cycle, lookbackEntries);
  const sum = fills.reduce((s, t) => {
    if (!inPeriodYmd(t.date, start, end) || t.isCarryover) return s;
    const liters = Number(t.liters) || 0;
    const contrib = Number(t.volumeContributed);
    const amount = Number(t.amount) || 0;
    if (Number.isFinite(contrib) && liters > 0 && contrib < liters) {
      return s + amount * (contrib / liters);
    }
    return s + amount;
  }, 0);
  return Math.round(sum * 100) / 100;
}

export function resolvePeriodDistance(
  cycles: FuelCycle[],
  scopedEntries: FuelEntry[],
  period?: PeriodBounds,
): PeriodDistance {
  const fullCycleKm =
    Math.round(cycles.reduce((s, c) => s + (Number(c.distance) || 0), 0) * 100) / 100;

  const primaryKm =
    Math.round(
      cycles.reduce(
        (s, c) => s + clipCycleDistanceToPeriod(c, period?.start, period?.end),
        0,
      ) * 100,
    ) / 100;

  const fillToFillKm = sumOdometerDeltasBetweenFills(scopedEntries);
  const carriedInKm = Math.max(0, Math.round((fullCycleKm - primaryKm) * 100) / 100);

  return {
    primaryKm,
    fullCycleKm,
    fillToFillKm,
    carriedInKm,
    primaryLabel: 'In this week.',
    secondaryLabel:
      carriedInKm > 0
        ? `Full overlapping cycles ${fullCycleKm.toLocaleString()} km (incl. ${carriedInKm.toLocaleString()} km before period)`
        : 'Fill-to-fill (excludes leg into first fill)',
  };
}

/**
 * Headline Full Tanks totals from the trusted partition only (period-clipped).
 */
export function buildTrustedPeriodTotals(args: {
  trusted: FuelCycle[];
  entries?: FuelEntry[];
  period?: PeriodBounds;
  provisional?: boolean;
}): TrustedPeriodTotals {
  const { trusted, entries, period, provisional = false } = args;

  const distanceKm =
    Math.round(
      trusted.reduce(
        (s, c) => s + clipCycleDistanceToPeriod(c, period?.start, period?.end),
        0,
      ) * 100,
    ) / 100;

  const fullCycleKm =
    Math.round(trusted.reduce((s, c) => s + (Number(c.distance) || 0), 0) * 100) / 100;

  const fuelL =
    Math.round(
      trusted.reduce((s, c) => s + clipCycleFuelToPeriod(c, period, entries), 0) * 100,
    ) / 100;

  const spend =
    Math.round(
      trusted.reduce((s, c) => s + clipCycleSpendToPeriod(c, period, entries), 0) * 100,
    ) / 100;

  const carriedInKm = Math.max(0, Math.round((fullCycleKm - distanceKm) * 100) / 100);

  return {
    distanceKm,
    fuelL,
    spend,
    carriedInKm,
    provisional,
  };
}
