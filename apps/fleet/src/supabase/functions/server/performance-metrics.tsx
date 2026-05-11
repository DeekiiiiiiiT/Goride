
import { format, parseISO, isSameDay, differenceInDays, addDays, startOfDay } from "npm:date-fns";

interface Trip {
  id: string;
  driverId: string;
  driverName?: string;
  date: string; // ISO
  amount: number;
  netPayout?: number;
  status?: string;
}

interface Driver {
  id: string;
  name: string;
  driverId?: string; // Legacy ID
  uberDriverId?: string;
  inDriveDriverId?: string;
}

interface QuotaConfig {
  dailyRideTarget: number;
  dailyEarningsTarget: number;
}

export interface DriverPerformanceSummary {
  driverId: string;
  driverName: string;
  
  // Aggregate Stats
  totalDaysActive: number;
  totalTrips: number;
  totalEarnings: number;
  
  // Compliance Stats
  daysMetQuota: number;
  successRate: number; // 0-100
  
  // Streak Stats
  currentStreak: number;
  bestStreak: number;
  
  // Miss Stats
  averageDeficit: number; // Avg earnings shortfall on miss days
  
  // Daily Breakdown
  history?: DailyPerformance[];
}

export interface DailyPerformance {
  date: string;
  earnings: number;
  trips: number;
  metQuota: boolean;
  deficit: number;
}

export function generatePerformanceReport(
  trips: Trip[], 
  drivers: Driver[], 
  startDateStr: string, 
  endDateStr: string,
  config: QuotaConfig = { dailyRideTarget: 10, dailyEarningsTarget: 0 },
  summaryOnly: boolean = false
): DriverPerformanceSummary[] {
  
  const start = startOfDay(parseISO(startDateStr));
  const end = startOfDay(parseISO(endDateStr));
  const dayCount = differenceInDays(end, start) + 1;
  
  // 1. Create a Lookup Map for Driver IDs (handle aliases)
  const driverLookup = new Map<string, string>(); // alias -> mainId
  drivers.forEach(d => {
    driverLookup.set(d.id, d.id);
    if (d.driverId) driverLookup.set(d.driverId, d.id);
    if (d.uberDriverId) driverLookup.set(d.uberDriverId, d.id);
    if (d.inDriveDriverId) driverLookup.set(d.inDriveDriverId, d.id);
  });

  /**
   * PHASE 5 OPTIMIZATION: 
   * Aggregate values directly into a nested Map instead of grouping full Trip objects.
   * This prevents creating massive intermediate arrays of Trip references.
   */
  const driverDailyStats = new Map<string, Map<string, { earnings: number; trips: number }>>();

  for (const t of trips) {
    const mainId = driverLookup.get(t.driverId) || t.driverId;
    const dateKey = t.date.split('T')[0];
    
    let statsMap = driverDailyStats.get(mainId);
    if (!statsMap) {
      statsMap = new Map();
      driverDailyStats.set(mainId, statsMap);
    }
    
    let stats = statsMap.get(dateKey);
    if (!stats) {
      stats = { earnings: 0, trips: 0 };
      statsMap.set(dateKey, stats);
    }
    
    stats.earnings += (t.amount || 0);
    stats.trips += 1;
  }

  // 3. Process each driver
  const report: DriverPerformanceSummary[] = [];

  // Iterate over known drivers to ensure we capture 0-trip drivers too.
  for (const driver of drivers) {
    const statsMap = driverDailyStats.get(driver.id) || driverDailyStats.get(driver.driverId || '');
    
    let daysMet = 0;
    let totalEarnings = 0;
    let totalTrips = 0;
    let daysActive = 0;
    let totalDeficit = 0;
    let deficitDays = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    const history: DailyPerformance[] = summaryOnly ? [] : new Array(dayCount);

    // Iterate through every day in range
    for (let i = 0; i < dayCount; i++) {
      const currentDay = addDays(start, i);
      const dateKey = format(currentDay, 'yyyy-MM-dd');
      
      const stats = statsMap?.get(dateKey) || { earnings: 0, trips: 0 };
      
      const metRides = stats.trips >= config.dailyRideTarget;
      const metEarnings = config.dailyEarningsTarget > 0 ? stats.earnings >= config.dailyEarningsTarget : true;
      const metQuota = metRides && metEarnings;
      
      let deficit = 0;
      if (!metQuota) {
        tempStreak = 0;
        if (config.dailyEarningsTarget > 0 && stats.earnings < config.dailyEarningsTarget) {
            deficit = config.dailyEarningsTarget - stats.earnings;
            totalDeficit += deficit;
            deficitDays++;
        }
      } else {
        daysMet++;
        tempStreak++;
        if (tempStreak > bestStreak) bestStreak = tempStreak;
      }

      if (stats.trips > 0) daysActive++;
      totalEarnings += stats.earnings;
      totalTrips += stats.trips;
      
      if (!summaryOnly) {
          history[i] = {
            date: dateKey,
            earnings: stats.earnings,
            trips: stats.trips,
            metQuota,
            deficit
          };
      }
    }

    // Current Streak = Count backwards from End Date
    let currentStreak = 0;
    for (let i = dayCount - 1; i >= 0; i--) {
        const currentDay = addDays(start, i);
        const dateKey = format(currentDay, 'yyyy-MM-dd');
        const stats = statsMap?.get(dateKey) || { earnings: 0, trips: 0 };
        const metQuota = stats.trips >= config.dailyRideTarget && (config.dailyEarningsTarget > 0 ? stats.earnings >= config.dailyEarningsTarget : true);
        
        if (metQuota) {
            currentStreak++;
        } else {
            break;
        }
    }

    const summary: DriverPerformanceSummary = {
      driverId: driver.id,
      driverName: driver.name || 'Unknown Driver',
      totalDaysActive: daysActive,
      totalEarnings,
      totalTrips,
      daysMetQuota: daysMet,
      successRate: dayCount > 0 ? Math.round((daysMet / dayCount) * 100) : 0,
      currentStreak,
      bestStreak,
      averageDeficit: deficitDays > 0 ? Math.round(totalDeficit / deficitDays) : 0
    };

    if (!summaryOnly) {
        summary.history = history;
    }

    report.push(summary);
  }

  // Sort by Success Rate Desc
  report.sort((a, b) => b.successRate - a.successRate);

  return report;
}
