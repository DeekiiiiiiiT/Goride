import { endOfDay, format, isWithinInterval, startOfDay } from "date-fns";
import type { DriverMetrics, Trip } from "../types/data";
import { isUberCashEligibleMetricPeriod } from "./driverMetricPeriod";
import { normalizePlatform } from "./normalizePlatform";

function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Calendar day from ISO timestamp — use date prefix, not local TZ shift. */
function ymdFromIso(iso: string | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed.length < 10) return null;
  return trimmed.slice(0, 10);
}

export type UberCashResolveBranch =
  | "transaction_column_sum"
  | "payment_driver_cash"
  | "skipped_not_all_platforms"
  | "skipped_no_overlap"
  | "blocked_no_operational_signal"
  | "blocked_no_eligible_metrics";

export type UberOperationalSignal = {
  completedTrips: number;
  earnings: number;
  distanceKm: number;
};

export type UberCashResolveResult = {
  magnitude: number | null;
  branch: UberCashResolveBranch;
  eligibleMetricIds: string[];
  operationalSignal: UberOperationalSignal;
};

function metricPeriodStartInRange(
  m: { periodStart?: string; periodEnd?: string },
  start: Date,
  end: Date,
): boolean {
  if (!isUberCashEligibleMetricPeriod(m)) return false;
  const mStartYmd = ymdFromIso(m.periodStart);
  const mEndYmd = ymdFromIso(m.periodEnd);
  if (!mStartYmd || !mEndYmd) return false;
  const startYmd = ymd(start);
  const endYmd = ymd(end);
  return mStartYmd >= startYmd && mStartYmd <= endYmd && mEndYmd >= startYmd;
}

/** Driver_metric rows whose statement week starts inside the selected range. */
export function filterUberCashEligibleMetrics(
  csvMetrics: DriverMetrics[] | undefined,
  rangeFrom: Date,
  rangeTo: Date,
): DriverMetrics[] {
  const start = startOfDay(rangeFrom);
  const end = endOfDay(rangeTo);
  return (csvMetrics || []).filter((m) => metricPeriodStartInRange(m, start, end));
}

export function countUberTripsInRange(
  trips: Trip[] | undefined,
  rangeFrom: Date,
  rangeTo: Date,
): { total: number; completed: number; earnings: number } {
  const start = startOfDay(rangeFrom);
  const end = endOfDay(rangeTo);
  let total = 0;
  let completed = 0;
  let earnings = 0;
  for (const t of trips || []) {
    if (normalizePlatform(t.platform) !== "Uber") continue;
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    if (!isWithinInterval(startOfDay(d), { start, end })) continue;
    total += 1;
    if (t.status === "Completed") {
      completed += 1;
      earnings += Number(t.amount) || 0;
    }
  }
  return { total, completed, earnings };
}

/** Uber cash requires trip evidence in the selected period — import rollups alone are not trusted. */
export function hasUberOperationalSignal(signal: UberOperationalSignal): boolean {
  return (
    signal.completedTrips > 0 ||
    signal.earnings > 0.005 ||
    signal.distanceKm > 0.05
  );
}

function buildOperationalSignal(
  tripSignal: ReturnType<typeof countUberTripsInRange>,
  uberPlatformStats?: { completed?: number; earnings?: number; distance?: number },
  uberDistanceKm?: number,
): UberOperationalSignal {
  return {
    completedTrips: Math.max(tripSignal.completed, uberPlatformStats?.completed ?? 0),
    earnings: Math.max(tripSignal.earnings, Number(uberPlatformStats?.earnings) || 0),
    distanceKm: Math.max(uberDistanceKm ?? 0, Number(uberPlatformStats?.distance) || 0),
  };
}

export function computeUberCsvCashMagnitudeFromMetrics(
  metrics: DriverMetrics[],
): Pick<UberCashResolveResult, "magnitude" | "branch"> {
  if (metrics.length === 0) {
    return { magnitude: null, branch: "skipped_no_overlap" };
  }

  // Prefer payments_driver Cash Collected — same figure PERIOD / payout_cash uses.
  // payments_transaction column sum can be larger and, when stacked with InDrive
  // trip cash, inflates Settlement Cash Still Held (~$64k vs ~$49k for Kenny).
  let sumDriver = 0;
  let hasDriver = false;
  for (const m of metrics) {
    if (m.dataSources?.includes("payment") && m.cashCollected != null) {
      sumDriver += Number(m.cashCollected) || 0;
      hasDriver = true;
    }
  }
  if (hasDriver) {
    return { magnitude: Math.abs(sumDriver), branch: "payment_driver_cash" };
  }

  let sumTx = 0;
  let hasTx = false;
  for (const m of metrics) {
    const v = m.uberPaymentsTransactionCashColumnSum;
    if (v != null && v !== 0) {
      sumTx += v;
      hasTx = true;
    }
  }
  if (hasTx) {
    return { magnitude: Math.abs(sumTx), branch: "transaction_column_sum" };
  }

  return { magnitude: null, branch: "skipped_no_overlap" };
}

/** Absolute bank settled from payment-sourced DriverMetrics (never cash risk). */
export function computeUberCsvBankMagnitudeFromMetrics(metrics: DriverMetrics[]): number {
  let sum = 0;
  let has = false;
  for (const m of metrics) {
    if (!m.dataSources?.includes("payment")) continue;
    if (m.bankTransferred == null) continue;
    sum += Number(m.bankTransferred) || 0;
    has = true;
  }
  return has ? Math.abs(sum) : 0;
}

/**
 * Single source of truth for Uber period cash on the driver overview.
 * Stale payment import rows cannot surface cash without trip evidence in the range.
 */
export function resolveUberPeriodCashCollected(opts: {
  csvMetrics: DriverMetrics[] | undefined;
  rangeFrom: Date;
  rangeTo: Date;
  trips: Trip[] | undefined;
  isAllPlatforms: boolean;
  uberPlatformStats?: { completed?: number; earnings?: number; distance?: number };
  uberDistanceKm?: number;
}): UberCashResolveResult {
  const tripSignal = countUberTripsInRange(opts.trips, opts.rangeFrom, opts.rangeTo);
  const operationalSignal = buildOperationalSignal(
    tripSignal,
    opts.uberPlatformStats,
    opts.uberDistanceKm,
  );

  if (!opts.isAllPlatforms) {
    return {
      magnitude: null,
      branch: "skipped_not_all_platforms",
      eligibleMetricIds: [],
      operationalSignal,
    };
  }

  const eligible = filterUberCashEligibleMetrics(opts.csvMetrics, opts.rangeFrom, opts.rangeTo);
  const eligibleMetricIds = eligible.map((m) => m.id);

  if (eligible.length === 0) {
    return {
      magnitude: null,
      branch: "blocked_no_eligible_metrics",
      eligibleMetricIds,
      operationalSignal,
    };
  }

  const { magnitude, branch } = computeUberCsvCashMagnitudeFromMetrics(eligible);
  if (magnitude == null) {
    return { magnitude: null, branch, eligibleMetricIds, operationalSignal };
  }

  if (!hasUberOperationalSignal(operationalSignal)) {
    return {
      magnitude: null,
      branch: "blocked_no_operational_signal",
      eligibleMetricIds,
      operationalSignal,
    };
  }

  return { magnitude, branch, eligibleMetricIds, operationalSignal };
}
