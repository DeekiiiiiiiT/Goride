/**
 * ARCHITECTURE: list = roster (GET /drivers/roster), detail money/ops =
 * driverOperationalMetrics + ledger overview APIs. Analytics should reuse these
 * helpers rather than re-deriving platform stats or cash figures ad hoc.
 *
 * Pure operational metrics for Driver Detail / Service Quality.
 * Extracted from DriverDetail metrics useMemo — keep side-effect free for tests.
 */
import {
  format,
  subDays,
  isWithinInterval,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  differenceInDays,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type {
  Trip,
  DriverMetrics,
  FinancialTransaction,
  VehicleMetrics,
  TierConfig,
} from '../types/data';
import {
  AVG_OPEN_SPEED_KMH,
  GAP_THRESHOLD_MINS as OPS_GAP_THRESHOLD_MINS,
  MIN_UNAVAILABLE_BLOCK_HOURS as OPS_MIN_UNAVAILABLE_BLOCK_HOURS,
  resolveDriverFuelEconomyKmPerL,
} from '../config/driverOpsDefaults';
import type { TimeFilterValue } from '../components/drivers/TimeFilterDropdown';
import { isHourInTimeFilter } from '../components/drivers/TimeFilterDropdown';
import { normalizePlatform } from './normalizePlatform';
import { getTripPhysicalCashCollected } from './tripPhysicalCash';
import { isDriverCashPaymentTransaction } from './driverCashPayment';
import { isUberCashEligibleMetricPeriod, isValidDriverMetricPeriod } from './driverMetricPeriod';
import { resolveUberPeriodCashCollected } from './resolveUberPeriodCash';
import { estimateEnrouteFallback } from './enrouteStrategy';

export interface ReconstructedMetrics {
    onTrip: { time: number; distance: number };
    enroute: { time: number; distance: number };
    open: { time: number; distance: number };
    unavailable: { time: number; distance: number };
    fuel: {
        rideShare: number;
        companyOps: number;
        personal: number;
        misc: number;
        total: number;
    };
}

export const parseTripDate = (dateStr: string | Date | null | undefined): Date | null => {
    if (dateStr == null || dateStr === '') return null;
    if (dateStr instanceof Date) return dateStr;

    try {
        let dateObj: Date;
        if (dateStr.includes('T')) {
            dateObj = new Date(dateStr);
        } else if (dateStr.includes('/')) {
            // US vs UK date format ambiguity handling
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                const p3 = parseInt(parts[2]);
                // Heuristic: if first part > 12, it must be day (DD/MM/YYYY)
                // Otherwise assume MM/DD/YYYY unless specified otherwise
                if (p1 > 12) {
                     dateObj = new Date(p3, p2 - 1, p1);
                } else {
                     dateObj = new Date(p3, p1 - 1, p2);
                }
            } else {
                dateObj = new Date(dateStr);
            }
        } else if (dateStr.includes('-') && dateStr.length === 10) {
            const [y, m, d] = dateStr.split('-').map(Number);
            dateObj = new Date(y, m - 1, d);
        } else {
            dateObj = new Date(dateStr);
        }
        
        if (isNaN(dateObj.getTime())) return null;
        return dateObj;
    } catch (e) {
        console.error("Failed to parse date:", dateStr);
        return null;
    }
};

export const getSortedTripsInRange = (
    trips: Trip[],
    rangeStart: Date,
    rangeEnd: Date,
    sortOrder: 'asc' | 'desc' = 'asc',
): Trip[] => {
    return trips.filter(trip => {
        // Use requestTime if available, otherwise fall back to date
        // Note: We need to cast to any if requestTime isn't in the imported Trip type yet, 
        // but for now we assume it is or will be accessed dynamically.
        const tripDate = parseTripDate((trip as any).requestTime || trip.date);
        if (!tripDate) return false;
        return tripDate >= rangeStart && tripDate <= rangeEnd;
    }).sort((a, b) => {
        const dateA = parseTripDate((a as any).requestTime || a.date);
        const dateB = parseTripDate((b as any).requestTime || b.date);
        const diff = (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        return sortOrder === 'asc' ? diff : -diff;
    });
};

export type ServiceQualityTripCounts = {
  completed: number;
  cancelled: number;
};

export type ServiceQualityRates = {
  totalTrips: number;
  completionRate: number;
  cancellationRate: number;
  /** Whole-number percent 0–100, or null when no trips and no CSV. */
  acceptanceRate: number | null;
};

/**
 * Normalize CSV acceptance (fraction 0–1 or percent 0–100) to whole percent.
 */
export function normalizeAcceptancePercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 1) return Math.round(raw * 100);
  return Math.round(raw);
}

/**
 * Completion / cancellation / acceptance rates for a period.
 * Acceptance prefers CSV when provided; otherwise mirrors completion rate.
 */
export function computeServiceQualityRates(
  counts: ServiceQualityTripCounts,
  csvAcceptanceRate?: number | null,
): ServiceQualityRates {
  const completed = Math.max(0, Number(counts.completed) || 0);
  const cancelled = Math.max(0, Number(counts.cancelled) || 0);
  const totalTrips = completed + cancelled;
  const completionRate = totalTrips > 0 ? (completed / totalTrips) * 100 : 0;
  const cancellationRate = totalTrips > 0 ? (cancelled / totalTrips) * 100 : 0;

  const fromCsv = normalizeAcceptancePercent(csvAcceptanceRate);
  let acceptanceRate: number | null = fromCsv;
  if (acceptanceRate == null && totalTrips > 0) {
    acceptanceRate = Math.round(completionRate);
  }

  return { totalTrips, completionRate, cancellationRate, acceptanceRate };
}

/** Trip shape for operational period rollups (mirrors server driver_operational_periods). */
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

function tripDayYmd(t: OperationalTripLike): string {
  const raw = String(t.requestTime || t.date || '').trim();
  if (!raw) return '';
  return raw.slice(0, 10);
}

function ymdInRange(day: string, from: string, to: string): boolean {
  if (!day || day.length < 10) return false;
  return day >= from && day <= to;
}

/**
 * Build an operational period rollup from trips in [from, to] (inclusive YMD).
 * Client port of supabase `driver_operational_periods.ts` — keep math in sync.
 */
export function buildOperationalPeriodSummary(
  trips: OperationalTripLike[],
  from: string,
  to: string,
): OperationalPeriodSummary {
  const fromYmd = String(from || '').slice(0, 10);
  const toYmd = String(to || '').slice(0, 10);
  let completed = 0;
  let cancelled = 0;
  let totalDistanceKm = 0;
  const byPlatform: Record<string, { trips: number; completed: number; cancelled: number }> = {};

  for (const t of trips || []) {
    const day = tripDayYmd(t);
    if (!ymdInRange(day, fromYmd, toYmd)) continue;
    const status = String(t.status || '');
    const platform = String(t.platform || 'Other').trim() || 'Other';
    if (!byPlatform[platform]) {
      byPlatform[platform] = { trips: 0, completed: 0, cancelled: 0 };
    }
    byPlatform[platform].trips += 1;
    const dist = Number(t.distanceKm ?? t.distance) || 0;
    if (status === 'Completed') {
      completed += 1;
      byPlatform[platform].completed += 1;
      totalDistanceKm += dist;
    } else if (status === 'Cancelled') {
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

export type ComputeDriverOperationalMetricsInput = {
  allTrips: Trip[];
  dateRange: DateRange | undefined;
  csvMetrics?: DriverMetrics[] | null;
  transactions: FinancialTransaction[];
  vehicleMetrics?: VehicleMetrics[] | null;
  /** Driver-assigned fleet vehicles (from useDriverFinancialBundle.vehicles). */
  driverVehicles?: any[] | null;
  driver?: any;
  selectedPlatforms: Set<string>;
  timeFilter: TimeFilterValue;
  activeTab: string;
  monthlyEarnings?: number;
  currentTier?: TierConfig | null;
};

/** Empty shell returned when no date range is selected — shape matches full compute return. */
export function emptyDriverOperationalMetrics() {
  return {
      periodEarnings: 0,
      prevPeriodEarnings: 0,
      trendPercent: "0.0",
      trendUp: true,
      totalEarnings: 0,
      lifetimeTrips: 0,
      periodCompletedTrips: 0,
      periodCancelledTrips: 0,
      totalTrips: 0,
      cashCollected: 0,
      totalCashCollected: 0,
      lifetimeTolls: 0,
      cashReceived: 0,
      approvedFuelCredits: 0,
      floatHeld: 0,
      pendingClearance: 0,
      weeklyEarningsData: [] as { day: string; fullDate: string; [platform: string]: string | number }[],
      earningsBreakdownData: [] as { name: string; value: number; color: string }[],
      hourlyActivityData: [] as { hour: string; trips: number }[],
      daysDiff: 0,
      totalDistance: 0,
      totalDuration: 0,
      avgDistance: 0,
      avgDuration: 0,
      earningsPerKm: 0,
      tripsPerHour: 0,
      completionRate: 0,
      cancellationRate: 0,
      acceptanceRate: null as number | null,
      currentRating: 0,
      totalTolls: 0,
      totalTips: 0,
      totalBaseFare: 0,
      platformStats: {
          Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
          InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
          Roam: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
          Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 }
      } as Record<string, any>,
      tripRatio: {
          available: 0,
          toTrip: 0,
          onTrip: 0,
          unavailable: 0,
          totalOnline: 0
      },
      distanceMetrics: {
          open: 0,
          enroute: 0,
          onTrip: 0,
          unavailable: 0,
          riderCancelled: 0,
          driverCancelled: 0,
          deliveryFailed: 0,
          total: 0
      },
      perPlatformDistance: {} as Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number; total: number }>,
      fuelMetrics: {
          rideShare: 0,
          companyOps: 0,
          personal: 0,
          misc: 0,
          total: 0
      },
      monthlyEarnings: 0,
      currentTier: null as TierConfig | null | undefined,
      timeMetrics: {
          onTrip: 0,
          toTrip: 0,
          available: 0,
          unavailable: 0,
          totalOnline: 0
      },
      uberCsvCashCollectedMagnitude: null as number | null,
      uberPaymentCsvRollup: null as {
        totalEarnings: number;
        refundsAndExpenses: number;
        netEarnings: number;
        cashCollected: number;
      } | null,
  };
}

export type DriverOperationalMetrics = ReturnType<typeof emptyDriverOperationalMetrics>;

/**
 * Full Driver Detail operational + legacy financial + cash-wallet metrics (pure).
 */
export function computeDriverOperationalMetrics(input: ComputeDriverOperationalMetricsInput) {
  const {
    allTrips,
    dateRange,
    csvMetrics,
    transactions,
    vehicleMetrics,
    driverVehicles,
    driver,
    selectedPlatforms,
    timeFilter,
    activeTab,
    monthlyEarnings,
    currentTier,
  } = input;

   if (!dateRange?.from) return emptyDriverOperationalMetrics();

   const start = startOfDay(dateRange.from);
   const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
   const daysDiff = differenceInDays(end, start) + 1;
   
   // Previous Period for Trend
   const prevStart = subDays(start, daysDiff);
   const prevEnd = subDays(end, daysDiff);

   let periodEarnings = 0;
   let prevPeriodEarnings = 0;
   
   let totalEarnings = 0; // Lifetime
   let lifetimeTrips = 0; // Lifetime
   let totalCashCollected = 0; // Lifetime trip-cash fallback for metrics.totalCashCollected
   let lifetimeTolls = 0; // Lifetime

   let periodCompletedTrips = 0;
   let periodCancelledTrips = 0;
   let cashCollected = 0;
   
   // Efficiency Metrics
   let totalDistance = 0;
   let totalDuration = 0; // minutes
   
   // Phase 3: Fleet Efficiency Accumulators (Pre-Calculated from Import)
   let sumOnTripHours = 0;
   let sumToTripHours = 0;
   let sumAvailableHours = 0;
   let sumTotalHours = 0;
   
   const hoursDistribution = new Array(24).fill(0);

   // Breakdown
   let totalBaseFare = 0;
   let totalTips = 0;
   let totalTolls = 0;

   // Platform Stats
   const platformStats: Record<string, any> = {
      Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      Roam: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
      Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 }
   };

   // Chart Data Map
   const chartDataMap = new Map<string, Record<string, number>>();
   
   try {
       const days = eachDayOfInterval({ start, end });
       days.forEach(d => {
           const initialDayStats: Record<string, number> = {};
           Object.keys(platformStats).forEach(k => initialDayStats[k] = 0);
           chartDataMap.set(format(d, 'yyyy-MM-dd'), initialDayStats);
       });
   } catch (e) { }

   // --- Phase 3: Ratio-Reconstruction Algorithm ---
   // We no longer need to calculate "Report Duration" because we use the Efficiency Ratio method.
   // This ignores mismatched file dates and focuses on the Driver's Performance Profile.

   const filteredTrips = allTrips.filter(t => {
       if (selectedPlatforms.has('All') || selectedPlatforms.has(t.platform || 'Other')) { const timeScoped = activeTab === 'overview'; if (timeScoped && timeFilter.preset !== 'all') { const h = new Date(t.date).getHours(); if (!isHourInTimeFilter(h, timeFilter)) return false; } return true; } return false;
       // time+platform filter handled above
   });

   filteredTrips.forEach(trip => {
      const tripDateObj = new Date(trip.date);
      if (isNaN(tripDateObj.getTime())) return;
      
      // Physical cash: explicit cashCollected or paymentMethod Cash only (not all Roam trips).
      const effectiveCash = getTripPhysicalCashCollected(trip);

      // Lifetime stats
      // For InDrive trips with fee data, use true profit (net income) instead of full fare
      totalEarnings += (trip.platform === 'InDrive' && trip.indriveNetIncome != null)
        ? trip.indriveNetIncome
        : trip.amount;
      lifetimeTrips += 1;
      if (effectiveCash) totalCashCollected += Math.abs(effectiveCash);
      // Only count tolls as debt if they weren't collected in cash (assuming cash collected includes toll reimbursement)
      // If it's a card trip (no cash collected), the driver received the toll refund in their payout, so they owe it back.
      if (trip.tollCharges && !effectiveCash) {
          lifetimeTolls += trip.tollCharges;
      }

      // Filter Check
      // Effective earnings: use true profit for InDrive trips with fee data
      const effectiveEarnings = (trip.platform === 'InDrive' && trip.indriveNetIncome != null)
        ? trip.indriveNetIncome
        : trip.amount;

      // Period totals for Roam/InDrive/Uber (trip side): strict trip.date in [start,end]. This is why a 1-day
      // filter works predictably for trip-native platforms. Ledger-led Uber totals (ledgerOverview) use
      // canonicalEventInSelectedWindow on ledger_event — different date semantics; see ledgerMoneyAggregate.ts.
      if (isWithinInterval(startOfDay(tripDateObj), { start, end })) {
          periodEarnings += effectiveEarnings;
          
          const platform = normalizePlatform(trip.platform);
          if (!platformStats[platform]) {
              platformStats[platform] = { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 };
          }
          const pStats = platformStats[platform];

          // Platform Stats
          pStats.earnings += effectiveEarnings;
          pStats.trips += 1;
          
          if (trip.status === 'Completed') {
              periodCompletedTrips++;
              pStats.completed++;
          }
          if (trip.status === 'Cancelled') periodCancelledTrips++;
          if (effectiveCash) {
              const amount = Math.abs(effectiveCash);
              cashCollected += amount;
              pStats.cashCollected = (pStats.cashCollected || 0) + amount;
          }
          
          if (trip.distance) {
              totalDistance += trip.distance;
              pStats.distance += trip.distance;
          }
          if (trip.duration) totalDuration += trip.duration;
          
          // Phase 3: Sum pre-calculated hours (Static Reconstruction)
          sumOnTripHours += trip.onTripHours || 0;
          sumToTripHours += trip.toTripHours || 0;
          sumAvailableHours += trip.availableHours || 0;
          sumTotalHours += trip.totalHours || 0;

          // Hourly Distribution
          const h = tripDateObj.getHours();
          hoursDistribution[h]++;

          // Chart Data
          const dateKey = format(tripDateObj, 'yyyy-MM-dd');
          if (chartDataMap.has(dateKey)) {
              const dayData = chartDataMap.get(dateKey)!;
              dayData[platform] = (dayData[platform] || 0) + trip.amount;
          }

          // Breakdown
          if (trip.fareBreakdown) {
              totalBaseFare += trip.fareBreakdown.baseFare || 0;
              totalTips += trip.fareBreakdown.tips || 0;
          } else {
              totalBaseFare += trip.amount;
          }
          
          if (trip.tollCharges) {
              totalTolls += trip.tollCharges;
              pStats.tolls = (pStats.tolls || 0) + trip.tollCharges;
          }
      }

      // Previous Period Check
      if (isWithinInterval(startOfDay(tripDateObj), { start: prevStart, end: prevEnd })) {
          prevPeriodEarnings += effectiveEarnings;
      }
   });

   // --- Phase 2: Dynamic Reconstruction (Source of Truth: Trip Logs) ---
   // Filter and Sort Trips using the Utility
   const sortedPeriodTrips = getSortedTripsInRange(filteredTrips, start, end);
   
   // PHASE 2.1: EXTRACT CSV SOURCE OF TRUTH (If Applicable)
   // CRITICAL: Only apply this override if "All" platforms are selected.
   const isAllPlatforms = selectedPlatforms.has('All');
   
   const relevantCsvMetrics = (isAllPlatforms && csvMetrics) ? csvMetrics.filter(m => {
      if (!isValidDriverMetricPeriod(m)) return false;
      const mStart = new Date(m.periodStart);
      const mEnd = new Date(m.periodEnd);
      return mStart <= end && mEnd >= start;
   }) : [];

   /** Sum of `payments_driver`-sourced rows overlapping the period (CSV visual template / statement totals). */
   const uberPaymentCsvRollup = (() => {
     const rows = relevantCsvMetrics.filter(
       (m) => Array.isArray(m.dataSources) && m.dataSources.includes('payment'),
     );
     if (rows.length === 0) return null;
     let totalEarnings = 0;
     let refundsAndExpenses = 0;
     let netEarnings = 0;
     let cashCollected = 0;
     for (const m of rows) {
       const te = Number(m.totalEarnings) || 0;
       const re = Number(m.refundsAndExpenses) || 0;
       totalEarnings += te;
       refundsAndExpenses += re;
       netEarnings += m.netEarnings != null ? Number(m.netEarnings) : te - re;
       cashCollected += Number(m.cashCollected) || 0;
     }
     return { totalEarnings, refundsAndExpenses, netEarnings, cashCollected };
   })();

   // Initialize Accumulators for Reconstruction
   let recOnTripTime = 0; // Hours
   let recOnTripDist = 0; // Km
   let recEnrouteTime = 0; // Hours
   let recEnrouteDist = 0; // Km
   let recOpenTime = 0; // Hours
   let recOpenDist = 0; // Km
   let recUnavailableTime = 0; // Hours
   let recUnavailableDist = 0; // Km
   let recRiderCancelledDist = 0; // Km
   let recDriverCancelledDist = 0; // Km
   let recDeliveryFailedDist = 0; // Km
    const perPlatformDistanceAccum: Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number }> = {};

   sortedPeriodTrips.forEach(trip => {
       // Per-platform distance accumulation
        const tripPlatform = normalizePlatform(trip.platform);
        if (!perPlatformDistanceAccum[tripPlatform]) { perPlatformDistanceAccum[tripPlatform] = { open: 0, enroute: 0, onTrip: 0, unavailable: 0, riderCancelled: 0, driverCancelled: 0, deliveryFailed: 0 }; }
        // Only process Completed trips for "On Trip" metrics
       if (trip.status === 'Completed') {
           // 1. On Trip Time & Distance
           // Time: (Dropoff - Pickup) or Trip Duration Column
           let tripDurationHours = 0;
           const pickupTime = parseTripDate(trip.pickupTime);
           const dropoffTime = parseTripDate(trip.dropoffTime);
           
           if (pickupTime && dropoffTime) {
               tripDurationHours = (dropoffTime.getTime() - pickupTime.getTime()) / (1000 * 60 * 60);
           } else if (trip.duration) {
               tripDurationHours = trip.duration / 60; // duration is in minutes usually
           }
           
           // Sanity Check: If duration is negative or > 12 hours, clamp
           tripDurationHours = Math.max(0, Math.min(tripDurationHours, 12));
           
           recOnTripTime += tripDurationHours;
           recOnTripDist += (trip.distance || 0);
            perPlatformDistanceAccum[tripPlatform].onTrip += (trip.distance || 0);
           
           // 2. Enroute Time & Distance
           // Time: (Pickup - Request)
           // Fallback: (Dropoff - Request) - Trip Duration
           let enrouteDurationHours = 0;
           const requestTime = parseTripDate((trip as any).requestTime || trip.date);
           
           if (requestTime) {
               if (pickupTime) {
                   enrouteDurationHours = (pickupTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
               } else if (dropoffTime && tripDurationHours > 0) {
                   const totalTime = (dropoffTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
                   enrouteDurationHours = totalTime - tripDurationHours;
               }
           }
           
           // Sanity Check: Enroute shouldn't be negative or excessively long (> 2 hours)
           enrouteDurationHours = Math.max(0, Math.min(enrouteDurationHours, 2));

           // FIX: If enroute is 0 (missing timestamps), assume average 5 mins (0.083h)
           if (enrouteDurationHours === 0) {
               enrouteDurationHours = 0.083;
           }
           
           recEnrouteTime += enrouteDurationHours;
           
           // Distance: Use Pre-Calculated Uniform Average
           const enrouteDistance = trip.normalizedEnrouteDistance ?? estimateEnrouteFallback(trip);
           
           recEnrouteDist += enrouteDistance;
            perPlatformDistanceAccum[tripPlatform].enroute += enrouteDistance;
           
           // NEW: Open Distance from Pre-Calculated Average (if available)
           // We prioritize the CSV-derived uniform average over the Gap Analysis estimate
           if (trip.normalizedOpenDistance) {
               recOpenDist += trip.normalizedOpenDistance;
                perPlatformDistanceAccum[tripPlatform].open += trip.normalizedOpenDistance;
           }
           
           // NEW: Unavailable Distance from Pre-Calculated Average
           if (trip.normalizedUnavailableDistance) {
               recUnavailableDist += trip.normalizedUnavailableDistance;
                perPlatformDistanceAccum[tripPlatform].unavailable += trip.normalizedUnavailableDistance;
           }
       } else if (trip.status === 'Cancelled' && (trip.distance || 0) > 0) {
           // Handle Cancellation Distance (Lost Km)
           const reason = (trip.cancellationReason || '').toLowerCase();
           const dist = trip.distance || 0;
           
           if (reason.includes('rider')) {
                perPlatformDistanceAccum[tripPlatform].riderCancelled += dist;
               recRiderCancelledDist += dist;
           } else if (reason.includes('driver')) {
               recDriverCancelledDist += dist;
                perPlatformDistanceAccum[tripPlatform].driverCancelled += dist;
           } else if (reason.includes('delivery_failed') || reason.includes('failed')) {
               recDeliveryFailedDist += dist;
                perPlatformDistanceAccum[tripPlatform].deliveryFailed += dist;
           } else {
               // Fallback if generic cancelled with distance
                // Also count as riderCancelled per-platform
               recRiderCancelledDist += dist;
                perPlatformDistanceAccum[tripPlatform].riderCancelled += dist; 
           }
       }
   });

   // Build finalized per-platform distance metrics with totals
    const perPlatformDistance: Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number; total: number }> = {};
    for (const [plat, acc] of Object.entries(perPlatformDistanceAccum)) { perPlatformDistance[plat] = { ...acc, total: acc.open + acc.enroute + acc.onTrip + acc.unavailable + acc.riderCancelled + acc.driverCancelled + acc.deliveryFailed }; }

    // Prepare Charts Data
   const weeklyEarningsData = Array.from(chartDataMap.entries()).filter(([date]) => !!date).map(([date, amounts]) => {
       const d = new Date(date);
       return {
           day: format(d, 'MMM d'),
           fullDate: date,
           ...amounts
       };
   });

   // --- Phase 3: Gap Analysis (Open vs Unavailable) ---
   
   // Gap Thresholds
   const GAP_THRESHOLD_MINS = OPS_GAP_THRESHOLD_MINS;
   const GAP_THRESHOLD_HOURS = GAP_THRESHOLD_MINS / 60;
   const MIN_UNAVAILABLE_BLOCK_HOURS = OPS_MIN_UNAVAILABLE_BLOCK_HOURS;
   const AVG_OPEN_SPEED = AVG_OPEN_SPEED_KMH; // km/h (Cruising for fares)
   // const AVG_PERSONAL_SPEED = 30; // REMOVED: Causing inflation

   // Helper: Add gap to appropriate bucket
   const processGap = (gapHours: number) => {
       if (gapHours <= 0) return;

       if (gapHours > MIN_UNAVAILABLE_BLOCK_HOURS) {
           // Huge gap -> Unavailable (Sleep/Shift End)
           recUnavailableTime += gapHours;
           recUnavailableDist += 0; // FIX: Assume 0km (Parked/Sleeping)
       } else if (gapHours > GAP_THRESHOLD_HOURS) {
           // Medium gap -> Personal/Break (Unavailable)
           recUnavailableTime += gapHours;
           recUnavailableDist += 0; // FIX: Assume 0km (Parked/Eating)
       } else {
           // Small gap -> Open (Waiting for fare)
           recOpenTime += gapHours;
           // recOpenDist += (gapHours * AVG_OPEN_SPEED); // REMOVED: Replaced by CSV Uniform Average Strategy
           recOpenDist += 0; 
       }
   };

   // Iterate through sorted trips to find gaps
   for (let i = 0; i < sortedPeriodTrips.length - 1; i++) {
       const currentTrip = sortedPeriodTrips[i];
       const nextTrip = sortedPeriodTrips[i+1];

       // End of Current Trip (Dropoff or Date + Duration)
       let currentEnd = parseTripDate(currentTrip.dropoffTime);
       if (!currentEnd && currentTrip.duration) {
           const start = parseTripDate((currentTrip as any).requestTime || currentTrip.date);
           if (start) currentEnd = new Date(start.getTime() + (currentTrip.duration * 60000));
       }

       // Start of Next Trip (Request Time)
       const nextStart = parseTripDate((nextTrip as any).requestTime || nextTrip.date);

       if (currentEnd && nextStart && nextStart > currentEnd) {
           const gapHours = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60);
           processGap(gapHours);
       }
   }
   
   // Handle Start/End of Period Boundaries?
   // For now, we only analyze gaps BETWEEN trips to be conservative.
   // Leading/Trailing time in the selected period is ignored unless we have shift logs.

   // --- End Phase 3 ---

   // --- Phase 4: Fuel Metric Finalization ---
   
   // PHASE 2 FIX: USE IMPORTED METRICS IF AVAILABLE
   // "Normalization Strategy": Use Trip Logs for shape (time distribution) but CSV Report for volume (totals).
   // This ensures the dashboard matches the official report exactly.
   // CRITICAL: Only apply this override if "All" platforms are selected. 
   // We cannot split the CSV total by platform, so for filtered views, we must rely on the log reconstruction.
   // (isAllPlatforms and relevantCsvMetrics are defined above)

   // Check if we have valid CSV metrics for distance (Source: driver_time_and_distance.csv)
   const hasCsvDistance = relevantCsvMetrics.some(m => (m.onTripDistance || 0) > 0);

   if (hasCsvDistance) {
       let csvOpenDist = 0;
       let csvEnrouteDist = 0;
       let csvOnTripDist = 0;
       let csvUnavailableDist = 0;
       
       let csvOpenTime = 0;
       let csvEnrouteTime = 0;
       let csvOnTripTime = 0;
       let csvUnavailableTime = 0;

       relevantCsvMetrics.forEach(m => {
           // Sum up metrics (e.g. if we have 7 daily records for a week selection)
           csvOpenDist += m.openDistance || 0;
           csvEnrouteDist += m.enrouteDistance || 0;
           csvOnTripDist += m.onTripDistance || 0;
           csvUnavailableDist += m.unavailableDistance || 0;
           
           // Time Override (if available in CSV)
           csvOpenTime += m.openTime || 0;
           csvEnrouteTime += m.enrouteTime || 0;
           csvOnTripTime += m.onTripHours || 0; 
           csvUnavailableTime += m.unavailableTime || 0;
       });
       
       // --- APPLING THE FIX ---
       
       // 1. On Trip Distance: Force match the CSV report
       recOnTripDist = csvOnTripDist; 
       
       // 2. Other Distances: Force match the CSV report
       // recOpenDist = csvOpenDist; // Handled per-trip via Uniform Average
       // recEnrouteDist is already calculated via Uniform Average in the loop (if isAllPlatforms is true), 
       // so it naturally sums to csvTotalEnroute (which is csvEnrouteDist).
       // We do NOT override it here to respect the per-trip distribution.
       // recEnrouteDist = csvEnrouteDist; 
       // recUnavailableDist = csvUnavailableDist; // Handled per-trip via Uniform Average
       
       // 3. Time Metrics: Force match the CSV report (if populated)
       // if (csvOnTripTime > 0) recOnTripTime = csvOnTripTime; // DISABLED: User wants "On Trip" time to come strictly from Trip Activity Logs
       if (csvEnrouteTime > 0) recEnrouteTime = csvEnrouteTime;
       if (csvOpenTime > 0) recOpenTime = csvOpenTime;
       if (csvUnavailableTime > 0) recUnavailableTime = csvUnavailableTime;
   }

   // Prefer assigned fleet vehicles (catalog economy); never fleet-wide VehicleMetrics.find.
   const FUEL_EFFICIENCY_KMPL = resolveDriverFuelEconomyKmPerL([
     ...(driverVehicles || []),
     ...((driver as any)?.fuelEconomyKmPerL != null || (driver as any)?.fuel_economy_km_per_l != null
       ? [driver]
       : []),
   ]);
   
   // 1. Calculate Fuel Splits based on Reconstructed Distance
   const fuelRideShare = (recOnTripDist + recEnrouteDist) / FUEL_EFFICIENCY_KMPL;
   const fuelCompanyOps = recOpenDist / FUEL_EFFICIENCY_KMPL;
   const fuelPersonal = recUnavailableDist / FUEL_EFFICIENCY_KMPL;
   const fuelTotalEst = fuelRideShare + fuelCompanyOps + fuelPersonal;

   // 2. Override Legacy Variables with New Reconstructed Data
   // This ensures the dashboard UI updates automatically without changing JSX structure yet
   
   // Update Distance Metrics object (used by Fuel Usage Split Tile)
   const reconstructedDistanceMetrics = {
       open: recOpenDist,
       enroute: recEnrouteDist,
       onTrip: recOnTripDist,
       unavailable: recUnavailableDist,
       riderCancelled: recRiderCancelledDist,
       driverCancelled: recDriverCancelledDist,
       deliveryFailed: recDeliveryFailedDist,
       total: recOpenDist + recEnrouteDist + recOnTripDist + recUnavailableDist + recRiderCancelledDist + recDriverCancelledDist + recDeliveryFailedDist
   };

   // Update Fuel Metrics object
   const reconstructedFuelMetrics = {
       rideShare: fuelRideShare,
       companyOps: fuelCompanyOps,
       personal: fuelPersonal,
       misc: 0,
       total: fuelTotalEst
   };

   // Update Time Metrics (used by Utilization Chart)
   // We replace the static CSV sums with our dynamic reconstruction
   const reconstructedTimeMetrics = {
       onTrip: recOnTripTime,
       toTrip: recEnrouteTime,
       available: recOpenTime,
       unavailable: recUnavailableTime,
       totalOnline: recOnTripTime + recEnrouteTime + recOpenTime
   };

   // --- End Phase 4 ---
   
   // Earnings Breakdown Data
   const earningsBreakdownData = [
      { name: 'Base Fare', value: totalBaseFare, color: '#4f46e5' },
      { name: 'Tips', value: totalTips, color: '#10b981' },
   ].filter(d => d.value > 0);

   // Hourly Activity Data
   const hourlyActivityData = hoursDistribution.map((count, hour) => ({
       hour: `${hour}:00`,
       trips: count
   }));

   // Trend
   const trendPercent = prevPeriodEarnings > 0 
      ? ((periodEarnings - prevPeriodEarnings) / prevPeriodEarnings) * 100 
      : periodEarnings > 0 ? 100 : 0;

   // Derived Efficiency Metrics
   const totalTrips = periodCompletedTrips + periodCancelledTrips;
   const avgDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
   const avgDuration = totalTrips > 0 ? totalDuration / totalTrips : 0;
   const earningsPerKm = 0; // Phase 6: Moved to hybrid metric (resolvedFinancials / totalDistance)
   const tripsPerHour = totalDuration > 0 ? (totalTrips / (totalDuration / 60)) : 0;

   // Completion / cancellation / acceptance (pure helper)
   const latestCsvMetric = relevantCsvMetrics.length > 0 
      ? [...relevantCsvMetrics].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]
      : null;

   // Unfiltered period rollup (shared with server projection stub).
   const opsPeriodSummary = buildOperationalPeriodSummary(
     allTrips,
     format(start, 'yyyy-MM-dd'),
     format(end, 'yyyy-MM-dd'),
   );
   const qualityCounts =
     isAllPlatforms && timeFilter.preset === 'all'
       ? { completed: opsPeriodSummary.completed, cancelled: opsPeriodSummary.cancelled }
       : { completed: periodCompletedTrips, cancelled: periodCancelledTrips };

   const { completionRate, cancellationRate, acceptanceRate } = computeServiceQualityRates(
     qualityCounts,
     latestCsvMetric?.acceptanceRate,
   );
   
   const currentRating = latestCsvMetric?.ratingLast4Weeks || latestCsvMetric?.ratingLast500 || 5.0;

   // Lifetime trip-cash override for metrics.totalCashCollected
   if (latestCsvMetric?.cashCollected) {
       totalCashCollected = Math.max(totalCashCollected, latestCsvMetric.cashCollected);
   }

   // Phase 4: Cash Logic

   // cashCollected override — used by wallet metrics and period earnings fallback
   // Calculate cash from CSV only if the selected range covers the CSV period
   const csvPeriodCash = relevantCsvMetrics.reduce((sum, m) => {
      // Uber payment statement cash is applied only via resolveUberPeriodCashCollected.
      if (isUberCashEligibleMetricPeriod(m) && m.dataSources?.includes('payment')) {
        return sum;
      }
      const mStart = new Date(m.periodStart);
      const mEnd = new Date(m.periodEnd);
      
      // Calculate effective overlap duration
      const overlapStart = mStart > start ? mStart : start;
      const overlapEnd = mEnd < end ? mEnd : end;
      
      // Ensure valid overlap
      if (overlapStart > overlapEnd) return sum;

      const reportDays = differenceInDays(mEnd, mStart) + 1;
      const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;

      // Use CSV if overlap covers almost the entire report (allow 1 day margin)
      // This includes "Dec 8-14" (7 days) for a 7-day report
      // But excludes "Dec 8" (1 day) for a 7-day report
      if (overlapDays >= reportDays - 1) {
          return sum + (m.cashCollected || 0);
      }
      return sum;
   }, 0);
   
   // If CSV data exists, use it to override or floor the trip-calculated cash
   // This handles cases where trips might include adjustments (negative) but CSV reports actual collection
   if (csvPeriodCash > 0) {
       cashCollected = Math.max(cashCollected, csvPeriodCash);
   }

   // --- Phase 1: STRICT Cash Liability Logic ---
   
   // 2. Calculate Payments Received (Cash returned to fleet)
   // Strictly look for 'Payment_Received' type or 'Cash Collection' category.
   // These are positive values (money entering fleet).
   const totalPaymentsReceived = (transactions || [])
      .filter(isDriverCashPaymentTransaction)
      .reduce((sum, t) => sum + (t?.amount || 0), 0);

   // 3b. Fuel reimbursements from Finalize only (exclude orphan approve-time credits)
   const approvedFuelCredits = (transactions || [])
      .filter(t => {
          if (!t) return false;
          if (t.category === 'Fuel Reimbursement Credit') return false; // approve-era orphans
          if (t.metadata?.settlementType === 'RideShare_Cash_Offset') return false; // portal early posts
          const isFuelCredit =
            t.category === 'Fuel Reimbursement' ||
            t.category === 'Fuel Settlement Credit' ||
            t.category === 'Fuel Settlement';
          return isFuelCredit && t.amount > 0;
      })
      .reduce((sum, t) => sum + (t?.amount || 0), 0);

   // Note: totalCashCollected is Lifetime, calculated earlier in the loop.
   const cashReceived = totalPaymentsReceived;

   // Wallet State Logic (Phase 5)
   // Float Held: Total sum of negative transactions categorized as "Float Issue"
   // Note: In transactions, floats are negative.
   const floatHeld = Math.abs((transactions || [])
      .filter(t => t && t.category === "Float Issue")
      .reduce((sum, t) => sum + (t?.amount || 0), 0));

   // Pending Clearance: Log Cash bank/mobile/check still awaiting Verify — not every Pending tx.
   const pendingClearance = (transactions || [])
      .filter((t) => {
        if (!t || !isDriverCashPaymentTransaction(t)) return false;
        if (String(t.status || '').toLowerCase().trim() !== 'pending') return false;
        const pm = String(t.paymentMethod || 'Cash').toLowerCase().trim();
        return pm !== 'cash' && pm !== '';
      })
      .reduce((sum, t) => sum + (t?.amount || 0), 0);

   // Trip Ratio Logic (from Vehicle Metrics)
   // Solution 1: "The Bridge" - Link Driver to Vehicle via Trips
   const activePlates = new Set<string>();
   
   // 1. Identify vehicles driven in this period from Trip Logs
   allTrips.forEach(trip => {
       let tripDateObj: Date;
       if (typeof trip.date === 'string') {
          if (trip.date.includes('T')) {
              tripDateObj = new Date(trip.date);
          } else if (trip.date.includes('/')) {
              const parts = trip.date.split('/');
              if (parts.length === 3) {
                  const p1 = parseInt(parts[0]);
                  const p2 = parseInt(parts[1]);
                  const p3 = parseInt(parts[2]);
                  if (p1 > 12) {
                      tripDateObj = new Date(p3, p2 - 1, p1);
                  } else {
                      tripDateObj = new Date(p3, p1 - 1, p2);
                  }
              } else {
                  tripDateObj = new Date(trip.date);
              }
          } else if (trip.date.includes('-') && trip.date.length === 10) {
              const [y, m, d] = trip.date.split('-').map(Number);
              tripDateObj = new Date(y, m - 1, d);
          } else {
              tripDateObj = new Date(trip.date);
          }
       } else {
          tripDateObj = new Date(trip.date);
       }
       if (isWithinInterval(tripDateObj, { start, end }) && trip.vehicleId) {
           // Normalize plate (remove spaces, uppercase)
           activePlates.add(trip.vehicleId.replace(/[\s-]/g, '').toUpperCase());
       }
   });

   let relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
       const vmStart = new Date(vm.periodStart);
       const vmEnd = new Date(vm.periodEnd);
       // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
       const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
       
       const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
       // Check if this vehicle matches any plate from the driver's trips
       const matchesTripPlate = Array.from(activePlates).some(p => vmPlate.includes(p));
       
       return overlaps && matchesTripPlate;
   }) || [];

   // 2. Fallback: If no trips (so no bridge), try the static profile assignment
   if (relevantVehicleMetrics.length === 0 && driver?.vehicle) {
       let profilePlate = driver.vehicle;
       const parenMatch = profilePlate.match(/\((.*?)\)/);
       if (parenMatch) profilePlate = parenMatch[1];
       profilePlate = profilePlate.replace(/[\s-]/g, '').toUpperCase();

       relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
           const vmStart = new Date(vm.periodStart);
           const vmEnd = new Date(vm.periodEnd);
           // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
           const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
           
           const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
           return overlaps && vmPlate.includes(profilePlate);
       }) || [];
   }

   // --- Phase 4 Wiring: Inject New Metrics into UI Variables ---

   // 1. Define Distance Metrics (Replacing legacy CSV logic)
   const distanceMetrics = reconstructedDistanceMetrics;

   // 2. Define Fuel Metrics (Replacing legacy estimate)
   const fuelMetrics = reconstructedFuelMetrics;

   // 3. Define Trip Ratio (Time Metrics)
   const tripRatio = {
       onTrip: reconstructedTimeMetrics.onTrip,
       toTrip: reconstructedTimeMetrics.toTrip,
       available: reconstructedTimeMetrics.available,
       unavailable: reconstructedTimeMetrics.unavailable,
       totalOnline: reconstructedTimeMetrics.totalOnline
   };
   
   // Note: totalDistance is currently left as "Revenue Distance" (Trip Only).

   const { magnitude: uberCsvCashCollectedMagnitude } = resolveUberPeriodCashCollected({
     csvMetrics: csvMetrics ?? undefined,
     rangeFrom: start,
     rangeTo: end,
     trips: allTrips,
     isAllPlatforms,
     uberPlatformStats: platformStats.Uber,
     uberDistanceKm: perPlatformDistance.Uber?.onTrip,
   });

   const result: DriverOperationalMetrics = {
      periodEarnings,
      prevPeriodEarnings,
      trendPercent: trendPercent.toFixed(1),
      trendUp: periodEarnings >= prevPeriodEarnings,
      totalEarnings,
      lifetimeTrips,
      periodCompletedTrips,
      periodCancelledTrips,
      totalTrips,
      cashCollected,
      totalCashCollected,
      lifetimeTolls,
      cashReceived, // ── CASH WALLET (from transactions, NOT trips) ──
      approvedFuelCredits, // Phase 5: Fuel reimbursement credits
      floatHeld,          // Phase 5
      pendingClearance,   // Phase 5
      weeklyEarningsData,
      earningsBreakdownData,
      hourlyActivityData,
      daysDiff,
      totalDistance,
      totalDuration,
      avgDistance,
      avgDuration,
      earningsPerKm, // HYBRID: trip-computed earnings ÷ distance (Efficiency tab)
      tripsPerHour,
      completionRate,
      cancellationRate,
      platformStats,
      // Phase 2 New Params
      acceptanceRate,
      currentRating,
      tripRatio, // New
      totalTolls,
      distanceMetrics, // Phase 2 New
      perPlatformDistance, // Per-platform distance breakdown (Roam/Uber/InDrive)
      fuelMetrics, // New Fuel Split
      monthlyEarnings: monthlyEarnings ?? 0,
      currentTier: currentTier ?? null,
      // Phase 2.1: Expose Time Metrics for Debug/Advanced View
      timeMetrics: reconstructedTimeMetrics,
      uberCsvCashCollectedMagnitude,
      uberPaymentCsvRollup,
      /** Period-level fare decomposition (for trip-sourced financial fallback when ledger is empty). */
      totalTips,
      totalBaseFare,
   };
   return result;
}
