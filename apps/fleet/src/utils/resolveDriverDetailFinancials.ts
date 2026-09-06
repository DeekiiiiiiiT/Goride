/**
 * Merge ledger driver-overview with trip operational metrics for Driver Detail.
 * Extracted from DriverDetail (Phase D) — behavior unchanged.
 */
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { LedgerDriverOverview, Trip } from '../types/data';
import { normalizePlatform } from '../utils/normalizePlatform';
import * as tripPhysicalCash from '../utils/tripPhysicalCash';
import type { DriverOperationalMetrics } from '../utils/driverOperationalMetrics';

export type DriverDetailDateRange = {
  from?: Date;
  to?: Date;
} | null | undefined;

export function resolveDriverDetailFinancials(args: {
  ledgerOverview: LedgerDriverOverview | null;
  ledgerOverviewLoaded: boolean;
  metrics: DriverOperationalMetrics;
  allTrips: Trip[];
  period: DriverDetailDateRange;
  periodCompletedFromOps: number | null;
}) {
  const {
    ledgerOverview,
    ledgerOverviewLoaded,
    metrics,
    allTrips,
    period: dateRange,
    periodCompletedFromOps,
  } = args;

  const ledgerHasData = !!ledgerOverview && (() => {
    const period = ledgerOverview.period || {};
    const lifetime = ledgerOverview.lifetime || {};
    const platformStats = ledgerOverview.platformStats || {};
    return (
      (Number(period.tripCount) || 0) > 0 ||
      (Number(lifetime.tripCount) || 0) > 0 ||
      Math.abs(Number(period.earnings) || 0) > 0.0001 ||
      Math.abs(Number(period.cashCollected) || 0) > 0.0001 ||
      Math.abs(Number(period.baseFare) || 0) > 0.0001 ||
      Object.keys(platformStats).length > 0
    );
  })();

  // ── Phase 1 Completeness Guard: detect if ledger covers all platforms with trip data ──
  // If any platform that has completed trips is missing from the ledger, the ledger is
  // incomplete and we must fall back entirely to trips — never create a hybrid.
  // Only require a platform in the ledger if it has COMPLETED trips in the period,
  // because generateTripLedgerEntries() only creates entries for status === 'Completed'.
  // Non-completed trips (Cancelled, In Progress) with non-zero amounts are expected
  // to be absent from the ledger — that is NOT a data gap.
  const tripPlatformsWithData = new Set<string>();
  for (const [platform, stats] of Object.entries(metrics.platformStats) as [string, any][]) {
    if (stats.completed > 0) {
      tripPlatformsWithData.add(platform);
    }
  }
  // TIGHTENED GUARD: Only check PERIOD-level ledger platforms, NOT lifetime.
  // Previously this also included lifetime.platformStats, which caused a bug:
  // if a platform had lifetime ledger entries (from old imports) but the CURRENT
  // period's trips had no ledger entries (e.g. fleet/sync gap), the guard would
  // pass and the period total would silently exclude that platform's earnings.
  const ledgerPlatforms = new Set<string>();
  if (ledgerOverview?.platformStats) {
    for (const rawPlat of Object.keys(ledgerOverview.platformStats)) {
      ledgerPlatforms.add(normalizePlatform(rawPlat));
    }
  }
  const missingFromLedger: string[] = [];
  for (const p of tripPlatformsWithData) {
    // Uber period money follows `trip.date` (same behavior as Roam/InDrive), not canonical ledger windows.
    if (p === 'Uber') continue;
    if (!ledgerPlatforms.has(p)) {
      missingFromLedger.push(p);
    }
  }
  const isLedgerComplete = missingFromLedger.length === 0;
  if (!isLedgerComplete && ledgerHasData) {
    // Ledger incomplete — auto-repair regenerates missing platforms below.
  }
  if (ledgerHasData && ledgerOverview) {
    // Merge ledger financial fields with trip-computed operational fields
    const platformStats: Record<string, any> = {};
    // Start with trip-computed platforms (keeps distance, ratings, completed counts)
    for (const [platform, stats] of Object.entries(metrics.platformStats)) {
      platformStats[platform] = { ...stats };
    }
    // Override financial fields from ledger for every platform (Uber included — trip ops stay for distance/ratings).
    for (const [rawPlat, stats] of Object.entries(ledgerOverview.platformStats)) {
      const platform = normalizePlatform(rawPlat);
      if (!platformStats[platform]) {
        platformStats[platform] = {
          earnings: 0,
          trips: 0,
          completed: 0,
          distance: 0,
          ratingSum: 0,
          ratingCount: 0,
          tolls: 0,
          cashCollected: 0,
        };
      }
      platformStats[platform].earnings = stats.earnings;
      platformStats[platform].trips = stats.tripCount;
      platformStats[platform].cashCollected = stats.cashCollected;
      platformStats[platform].tolls = stats.tolls;
    }

    // Build chart data from ledger dailyEarnings
    const weeklyEarningsData = ledgerOverview.dailyEarnings
      .filter((d: any) => !!d.date)
      .map((d: any) => ({
        day: (() => {
          try {
            return format(new Date(d.date + 'T00:00:00'), 'MMM d');
          } catch {
            return d.date;
          }
        })(),
        fullDate: d.date,
        ...d.byPlatform,
      }));

    // Phase 8: Surface dispute / toll-support refunds in overview breakdown (tolls column).
    const drAmt = Number(ledgerOverview.period.disputeRefunds) || 0;
    if (drAmt > 0) {
      platformStats['Dispute Recoveries'] = {
        earnings: 0,
        trips: 0,
        completed: 0,
        distance: 0,
        ratingSum: 0,
        ratingCount: 0,
        cashCollected: 0,
        tolls: drAmt,
      };
    }

    const uberCsvCash = metrics.uberCsvCashCollectedMagnitude;
    const uberLedgerCash = Number(platformStats.Uber?.cashCollected) || 0;
    const uberCashMismatch =
      uberCsvCash != null && Math.abs(uberCsvCash - uberLedgerCash) > 0.01
        ? { csv: uberCsvCash, ledger: uberLedgerCash, delta: uberCsvCash - uberLedgerCash }
        : null;

    // Ledger may count every Roam/InDrive fare as cash — trip evidence is a different cut.
    // Saved-week overlay already set period.cashCollected; do not smash it with chip sum.
    const fromSavedWeek = ledgerOverview.source === 'driver_financial_periods';
    if (!fromSavedWeek && dateRange?.from) {
      const periodStart = startOfDay(dateRange.from);
      const periodEnd = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      for (const [platform, stats] of Object.entries(platformStats)) {
        if (platform === 'Uber' || platform === 'Dispute Recoveries') continue;
        stats.cashCollected = allTrips
          .filter((t) => {
            const d = new Date(t.date);
            if (Number.isNaN(d.getTime())) return false;
            return (
              normalizePlatform(t.platform) === platform &&
              isWithinInterval(startOfDay(d), { start: periodStart, end: periodEnd })
            );
          })
          .reduce((sum, t) => sum + tripPhysicalCash.getTripPhysicalCashCollected(t), 0);
      }
    }

    /** Headline = saved week when overlay is on; otherwise fare/tip SSOT. */
    const displayPeriodEarnings = Number(ledgerOverview.period.earnings) || 0;
    const sumMergedCash = (() => {
      let t = 0;
      for (const [name, s] of Object.entries(platformStats)) {
        if (name === 'Dispute Recoveries') continue;
        t += Number((s as any)?.cashCollected) || 0;
      }
      return t;
    })();

    const displayCashCollected = fromSavedWeek
      ? Number(ledgerOverview.period.cashCollected) || 0
      : sumMergedCash;
    const prevEarningsNum = Number(ledgerOverview.prevPeriod.earnings) || 0;
    const trendPercentMerged =
      prevEarningsNum > 0
        ? ((displayPeriodEarnings - prevEarningsNum) / prevEarningsNum) * 100
        : displayPeriodEarnings > 0
          ? 100
          : 0;

    return {
      periodEarnings: displayPeriodEarnings,
      prevPeriodEarnings: ledgerOverview.prevPeriod.earnings,
      trendPercent: trendPercentMerged.toFixed(1),
      trendUp: displayPeriodEarnings >= prevEarningsNum,
      cashCollected: displayCashCollected,
      totalTolls: ledgerOverview.period.tolls,
      disputeRefunds: ledgerOverview.period.disputeRefunds || 0,
      totalTips: ledgerOverview.period.tips,
      totalBaseFare: ledgerOverview.period.baseFare,
      /** Canonical: bank transfer magnitude from `payout_bank` (display as outflow with minus in UI). */
      bankTransferred: ledgerOverview.period.bankTransferred ?? 0,
      uberLedgerReconciliation: ledgerOverview.period.uber || undefined,
      platformFees: ledgerOverview.period.platformFees ?? 0,
      platformFeesByPlatform: ledgerOverview.period.platformFeesByPlatform || {},
      fareGrossMinusNetByPlatform: ledgerOverview.period.fareGrossMinusNetByPlatform || {},
      cashSourceMismatch: uberCashMismatch,
      platformStats,
      weeklyEarningsData,
      tripCount: ledgerOverview.period.tripCount,
      readModelSource: fromSavedWeek
        ? 'driver_financial_periods'
        : ledgerOverview.readModelSource,
      source: 'ledger' as const,
      isLedgerComplete,
      dataIncomplete: !isLedgerComplete,
      missingPlatforms: missingFromLedger,
      lifetimeEarnings: ledgerOverview.lifetime.earnings,
      // Lifetime trips: DFP SUM (driver_financial_periods.trip_count), never the trip-window sample.
      lifetimeTrips:
        Number(ledgerOverview.lifetime.tripCount) > 0
          ? Number(ledgerOverview.lifetime.tripCount)
          : Number(ledgerOverview.lifetime.tripRecordCount) > 0
            ? Number(ledgerOverview.lifetime.tripRecordCount)
            : null,
      lifetimeCashCollected: Number(ledgerOverview.lifetime.cashCollected) || 0,
      lifetimeTolls: ledgerOverview.lifetime.tolls,
      lifetimeDisputeRefunds: ledgerOverview.lifetime.disputeRefunds || 0,
      lifetimePlatformStats: (ledgerOverview.lifetime as any).platformStats || {},
      tripFallback: false as const,
    };
  }
  // ⚠️ LEGACY FALLBACK — Phase 7 safety net. If this fires, ledger is incomplete.
  // Phase 6 monitoring should detect & auto-repair. Investigate if this persists.
  if (ledgerOverviewLoaded) {
    // Awaiting ledger completeness — auto-repair resolves missing platforms when needed.
  }

  // ── Trip-sourced fallback (production): canonical ledger often empty until backfill; trip logs still match Trip Ledger. ──
  const tripFinancialSignal =
    (periodCompletedFromOps || metrics.periodCompletedTrips || 0) > 0 ||
    Math.abs(Number(metrics.periodEarnings) || 0) > 0.0001 ||
    Math.abs(Number(metrics.cashCollected) || 0) > 0.0001 ||
    Math.abs(Number(metrics.totalTolls) || 0) > 0.0001;

  if (ledgerOverviewLoaded && !ledgerHasData && tripFinancialSignal) {
    return {
      periodEarnings: metrics.periodEarnings,
      prevPeriodEarnings: metrics.prevPeriodEarnings,
      trendPercent: metrics.trendPercent,
      trendUp: metrics.trendUp,
      cashCollected: metrics.cashCollected,
      totalTolls: metrics.totalTolls,
      disputeRefunds: 0,
      totalTips: metrics.totalTips ?? 0,
      totalBaseFare: metrics.totalBaseFare ?? 0,
      bankTransferred: 0,
      uberLedgerReconciliation: undefined,
      platformFees: 0,
      platformFeesByPlatform: {} as Record<string, number>,
      fareGrossMinusNetByPlatform: {} as Record<string, number>,
      platformStats: metrics.platformStats,
      weeklyEarningsData: metrics.weeklyEarningsData,
      tripCount: periodCompletedFromOps ?? metrics.periodCompletedTrips,
      readModelSource: 'trip_logs',
      source: 'trips' as const,
      tripFallback: true as const,
      isLedgerComplete,
      dataIncomplete: true,
      missingPlatforms: missingFromLedger,
      // Trip fallback must not pose as Lifetime — DFP is authoritative for that label.
      lifetimeEarnings: null as number | null,
      lifetimeTrips: null as number | null,
      lifetimeCashCollected: null as number | null,
      lifetimeTolls: null as number | null,
      lifetimeDisputeRefunds: 0,
      lifetimePlatformStats: {} as Record<string, any>,
    };
  }

  return {
    // No ledger and no usable trip signal in range — keep zeros
    periodEarnings: 0,
    prevPeriodEarnings: 0,
    trendPercent: '0.0',
    trendUp: true,
    cashCollected: 0,
    totalTolls: 0,
    disputeRefunds: 0,
    totalTips: 0,
    totalBaseFare: 0,
    bankTransferred: 0,
    uberLedgerReconciliation: undefined,
    platformFees: 0,
    platformFeesByPlatform: {} as Record<string, number>,
    fareGrossMinusNetByPlatform: {} as Record<string, number>,
    platformStats: metrics.platformStats,
    weeklyEarningsData: [],
    tripCount: periodCompletedFromOps ?? metrics.periodCompletedTrips,
    readModelSource: undefined,
    source: 'trips' as const,
    tripFallback: false as const,
    isLedgerComplete,
    dataIncomplete: true,
    missingPlatforms: missingFromLedger,
    lifetimeEarnings: null as number | null,
    lifetimeTrips: null as number | null,
    lifetimeCashCollected: null as number | null,
    lifetimeTolls: null as number | null,
    lifetimeDisputeRefunds: 0,
    lifetimePlatformStats: {} as Record<string, any>,
  };
}

export type DriverDetailResolvedFinancials = ReturnType<typeof resolveDriverDetailFinancials>;
