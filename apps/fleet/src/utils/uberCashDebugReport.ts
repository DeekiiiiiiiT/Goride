import { endOfDay, format, isWithinInterval, startOfDay } from "date-fns";
import type { DriverMetrics, Trip } from "../types/data";
import { normalizePlatform } from "./normalizePlatform";
import { isUberCashEligibleMetricPeriod } from "./driverMetricPeriod";

export type UberCashDebugRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  overlaps: boolean;
  uberPaymentsTransactionCashColumnSum: number | null | undefined;
  cashCollected: number | null | undefined;
  dataSources: string[] | undefined;
  /** How this row would contribute if using tx-column path (non-null sum counts) */
  txContribution: number;
  /** Would count toward payment_driver path */
  paymentDriverContribution: number;
};

export type UberCashDebugReport = {
  rangeStart: string;
  rangeEnd: string;
  isAllPlatforms: boolean;
  totalDriverMetricRows: number;
  overlappingRows: UberCashDebugRow[];
  nonOverlappingRows: Pick<UberCashDebugRow, "id" | "periodStart" | "periodEnd" | "overlaps">[];
  /** Mirrors DriverDetail `uberCsvCashCollectedMagnitude` */
  magnitude: number | null;
  branch: "transaction_column_sum" | "payment_driver_cash" | "skipped_not_all_platforms" | "skipped_no_overlap";
  uberTripsInRange: number;
  uberCompletedTripsInRange: number;
};

function intervalsOverlap(
  mStart: Date,
  mEnd: Date,
  start: Date,
  end: Date,
): boolean {
  return mStart <= end && mEnd >= start;
}

/**
 * Explains how `uberCsvCashCollectedMagnitude` would be computed — keep in sync with
 * `DriverDetail.tsx` (metrics useMemo, Uber CSV cash block).
 */
export function buildUberCashDebugReport(
  csvMetrics: DriverMetrics[] | undefined,
  rangeFrom: Date,
  rangeTo: Date,
  trips: Trip[] | undefined,
  isAllPlatforms: boolean,
): UberCashDebugReport {
  const start = startOfDay(rangeFrom);
  const end = endOfDay(rangeTo);

  const all = csvMetrics || [];
  const rows: UberCashDebugRow[] = [];
  const nonOverlap: Pick<UberCashDebugRow, "id" | "periodStart" | "periodEnd" | "overlaps">[] = [];

  for (const m of all) {
    const mStart = new Date(m.periodStart);
    const mEnd = new Date(m.periodEnd);
    const overlaps =
      isUberCashEligibleMetricPeriod(m) && intervalsOverlap(mStart, mEnd, start, end);
    const vTx = m.uberPaymentsTransactionCashColumnSum;
    const txContrib = vTx != null && vTx !== 0 ? vTx : 0;
    const paymentOk =
      Array.isArray(m.dataSources) &&
      m.dataSources.includes("payment") &&
      m.cashCollected != null;
    const paymentContrib = paymentOk ? Number(m.cashCollected) || 0 : 0;

    const row: UberCashDebugRow = {
      id: m.id,
      periodStart: m.periodStart,
      periodEnd: m.periodEnd,
      overlaps,
      uberPaymentsTransactionCashColumnSum: m.uberPaymentsTransactionCashColumnSum,
      cashCollected: m.cashCollected,
      dataSources: m.dataSources,
      txContribution: txContrib,
      paymentDriverContribution: paymentContrib,
    };
    if (overlaps) rows.push(row);
    else nonOverlap.push({ id: m.id, periodStart: m.periodStart, periodEnd: m.periodEnd, overlaps: false });
  }

  let magnitude: number | null = null;
  let branch: UberCashDebugReport["branch"] = "skipped_no_overlap";

  if (!isAllPlatforms) {
    branch = "skipped_not_all_platforms";
  } else if (rows.length === 0) {
    branch = "skipped_no_overlap";
  } else {
    let sumTx = 0;
    let hasTx = false;
    for (const r of rows) {
      const v = r.uberPaymentsTransactionCashColumnSum;
      if (v != null && v !== 0) {
        sumTx += v;
        hasTx = true;
      }
    }
    if (hasTx) {
      magnitude = Math.abs(sumTx);
      branch = "transaction_column_sum";
    } else {
      let sumDriver = 0;
      let hasDriver = false;
      for (const r of rows) {
        if (Array.isArray(r.dataSources) && r.dataSources.includes("payment") && r.cashCollected != null) {
          sumDriver += Number(r.cashCollected) || 0;
          hasDriver = true;
        }
      }
      if (hasDriver) {
        magnitude = Math.abs(sumDriver);
        branch = "payment_driver_cash";
      }
    }
  }

  let uberTripsInRange = 0;
  let uberCompletedInRange = 0;
  for (const t of trips || []) {
    if (normalizePlatform(t.platform) !== "Uber") continue;
    const tripDateObj = new Date(t.date);
    if (Number.isNaN(tripDateObj.getTime())) continue;
    if (!isWithinInterval(startOfDay(tripDateObj), { start, end })) continue;
    uberTripsInRange += 1;
    if (t.status === "Completed") uberCompletedInRange += 1;
  }

  return {
    rangeStart: format(start, "yyyy-MM-dd"),
    rangeEnd: format(end, "yyyy-MM-dd"),
    isAllPlatforms,
    totalDriverMetricRows: all.length,
    overlappingRows: rows,
    nonOverlappingRows: nonOverlap,
    magnitude,
    branch,
    uberTripsInRange,
    uberCompletedTripsInRange: uberCompletedInRange,
  };
}
