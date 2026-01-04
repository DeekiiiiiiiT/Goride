
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
  history: DailyPerformance[];
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
  config: QuotaConfig = { dailyRideTarget: 10, dailyEarningsTarget: 0 } 
): DriverPerformanceSummary[] {
  
  const start = startOfDay(parseISO(startDateStr));
  const end = startOfDay(parseISO(endDateStr));
  const dayCount = differenceInDays(end, start) + 1;
  
  // 1. Group Trips by Driver
  const tripsByDriver: Record<string, Trip[]> = {};
  trips.forEach(t => {
    // Normalize Driver ID (handle legacy IDs if needed, but assuming ID match for now)
    // In real app, we might need to map t.driverId to d.id using the drivers array
    // For now, we use t.driverId as key
    if (!tripsByDriver[t.driverId]) tripsByDriver[t.driverId] = [];
    tripsByDriver[t.driverId].push(t);
  });

  // 2. Process each driver
  const report: DriverPerformanceSummary[] = [];

  // Iterate over known drivers to ensure we capture 0-trip drivers too?
  // Or just drivers with trips? 
  // Better to use the 'drivers' list to include everyone.
  
  drivers.forEach(driver => {
    const driverTrips = tripsByDriver[driver.id] || tripsByDriver[driver.driverId || ''] || [];
    
    // Group by Date
    const statsByDate: Record<string, { earnings: number; trips: number }> = {};
    
    driverTrips.forEach(t => {
      const dateKey = t.date.split('T')[0];
      if (!statsByDate[dateKey]) statsByDate[dateKey] = { earnings: 0, trips: 0 };
      
      const amount = t.netPayout !== undefined ? t.netPayout : t.amount;
      statsByDate[dateKey].earnings += (amount || 0);
      statsByDate[dateKey].trips += 1;
    });

    // 3. Build History & Calculate Stats
    const history: DailyPerformance[] = [];
    let daysMet = 0;
    let totalEarnings = 0;
    let totalTrips = 0;
    let daysActive = 0;
    let totalDeficit = 0;
    let deficitDays = 0;

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    // Iterate through every day in range
    for (let i = 0; i < dayCount; i++) {
      const currentDay = addDays(start, i);
      const dateKey = format(currentDay, 'yyyy-MM-dd');
      
      const stats = statsByDate[dateKey] || { earnings: 0, trips: 0 };
      
      const metRides = stats.trips >= config.dailyRideTarget;
      const metEarnings = config.dailyEarningsTarget > 0 ? stats.earnings >= config.dailyEarningsTarget : true;
      const metQuota = metRides && metEarnings;
      
      // Deficit Calculation (Earnings only for now, or Rides?)
      // Use Earnings deficit if target > 0, else Ride deficit?
      // Let's use Earnings deficit if earnings target is set, else N/A (0)
      let deficit = 0;
      if (!metQuota) {
          if (config.dailyEarningsTarget > 0 && stats.earnings < config.dailyEarningsTarget) {
              deficit = config.dailyEarningsTarget - stats.earnings;
          }
      }

      if (stats.trips > 0) daysActive++;
      totalEarnings += stats.earnings;
      totalTrips += stats.trips;
      
      if (metQuota) {
        daysMet++;
        tempStreak++;
      } else {
        tempStreak = 0;
        if (deficit > 0) {
            totalDeficit += deficit;
            deficitDays++;
        }
      }
      
      if (tempStreak > bestStreak) bestStreak = tempStreak;

      history.push({
        date: dateKey,
        earnings: stats.earnings,
        trips: stats.trips,
        metQuota,
        deficit
      });
    }

    // Current Streak = Count backwards from End Date
    let calcCurrentStreak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].metQuota) {
            calcCurrentStreak++;
        } else {
            break;
        }
    }
    currentStreak = calcCurrentStreak;

    report.push({
      driverId: driver.id,
      driverName: driver.name || 'Unknown Driver',
      totalDaysActive: daysActive,
      totalEarnings,
      totalTrips,
      daysMetQuota: daysMet,
      successRate: dayCount > 0 ? Math.round((daysMet / dayCount) * 100) : 0,
      currentStreak,
      bestStreak,
      averageDeficit: deficitDays > 0 ? Math.round(totalDeficit / deficitDays) : 0,
      history
    });
  });

  // Sort by Success Rate Desc
  report.sort((a, b) => b.successRate - a.successRate);

  return report;
}
