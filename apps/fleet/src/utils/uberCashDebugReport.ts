import { endOfDay, format, startOfDay } from "date-fns";
import type { DriverMetrics, Trip } from "../types/data";
import {
  countUberTripsInRange,
  filterUberCashEligibleMetrics,
  resolveUberPeriodCashCollected,
  type UberCashResolveBranch,
  type UberOperationalSignal,
} from "./resolveUberPeriodCash";

export type UberCashDebugRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  overlaps: boolean;
  uberPaymentsTransactionCashColumnSum: number | null | undefined;
  cashCollected: number | null | undefined;
  dataSources: string[] | undefined;
  txContribution: number;
  paymentDriverContribution: number;
};

export type UberCashDebugReport = {
  rangeStart: string;
  rangeEnd: string;
  isAllPlatforms: boolean;
  totalDriverMetricRows: number;
  overlappingRows: UberCashDebugRow[];
  nonOverlappingRows: Pick<UberCashDebugRow, "id" | "periodStart" | "periodEnd" | "overlaps">[];
  magnitude: number | null;
  branch: UberCashResolveBranch;
  operationalSignal: UberOperationalSignal;
  uberTripsInRange: number;
  uberCompletedTripsInRange: number;
};

/** Explains how `uberCsvCashCollectedMagnitude` is computed (delegates to resolveUberPeriodCashCollected). */
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
  const eligible = filterUberCashEligibleMetrics(all, rangeFrom, rangeTo);
  const eligibleIds = new Set(eligible.map((m) => m.id));
  const tripCounts = countUberTripsInRange(trips, rangeFrom, rangeTo);

  const overlappingRows: UberCashDebugRow[] = [];
  const nonOverlappingRows: UberCashDebugReport["nonOverlappingRows"] = [];

  for (const m of all) {
    const overlaps = eligibleIds.has(m.id);
    const vTx = m.uberPaymentsTransactionCashColumnSum;
    const txContribution = vTx != null && vTx !== 0 ? vTx : 0;
    const paymentOk =
      Array.isArray(m.dataSources) &&
      m.dataSources.includes("payment") &&
      m.cashCollected != null;
    const row: UberCashDebugRow = {
      id: m.id,
      periodStart: m.periodStart,
      periodEnd: m.periodEnd,
      overlaps,
      uberPaymentsTransactionCashColumnSum: m.uberPaymentsTransactionCashColumnSum,
      cashCollected: m.cashCollected,
      dataSources: m.dataSources,
      txContribution,
      paymentDriverContribution: paymentOk ? Number(m.cashCollected) || 0 : 0,
    };
    if (overlaps) overlappingRows.push(row);
    else nonOverlappingRows.push({ id: m.id, periodStart: m.periodStart, periodEnd: m.periodEnd, overlaps: false });
  }

  const resolved = resolveUberPeriodCashCollected({
    csvMetrics: all,
    rangeFrom,
    rangeTo,
    trips,
    isAllPlatforms,
  });

  return {
    rangeStart: format(start, "yyyy-MM-dd"),
    rangeEnd: format(end, "yyyy-MM-dd"),
    isAllPlatforms,
    totalDriverMetricRows: all.length,
    overlappingRows,
    nonOverlappingRows,
    magnitude: resolved.magnitude,
    branch: resolved.branch,
    operationalSignal: resolved.operationalSignal,
    uberTripsInRange: tripCounts.total,
    uberCompletedTripsInRange: tripCounts.completed,
  };
}
