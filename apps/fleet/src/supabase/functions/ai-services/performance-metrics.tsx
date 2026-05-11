
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
  
  // 1. Create a Lookup Map for Driver IDs (handle aliases)
  const driverLookup = new Map<string, string>(); // alias -> mainId
  drivers.forEach(d => {
    driverLookup.set(d.id, d.id);
    if (d.driverId) driverLookup.set(d.driverId, d.id);
    // Add support for platform-specific IDs if they exist on the driver record
    if (d.uberDriverId) driverLookup.set(d.uberDriverId, d.id);
    if (d.inDriveDriverId) driverLookup.set(d.inDriveDriverId, d.id);
  });

  // 2. Group Trips by Driver
  const tripsByDriver: Record<string, Trip[]> = {};
  trips.forEach(t => {
    // Resolve trip's driverId to the main driver ID
    const mainId = driverLookup.get(t.driverId);
    
    // If resolved, add to group. If not, we might be missing the driver or it's an unknown ID.
    // We fall back to using t.driverId as the key if no match found (to at least show data),
    // but ideally we want to group under the canonical ID.
    const key = mainId || t.driverId;
    
    if (!tripsByDriver[key]) tripsByDriver[key] = [];
    tripsByDriver[key].push(t);
  });

  // 3. Process each driver
  const report: DriverPerformanceSummary[] = [];

  // Iterate over known drivers to ensure we capture 0-trip drivers too?
  // Or just drivers with trips? 
  // Better to use the 'drivers' list to include everyone.
  
  drivers.forEach(driver => {
    const driverTrips = tripsByDriver[driver.id] || tripsByDriver[driver.driverId || ''] || [];
    
    // Group by Date
    const statsByDate: Record<string, { earnings: number; trips: number }> = {};
    
    driverTrips.forEach(t => {
      // Use date slice (UTC) to key trips. 
      // Note: This might cause slight mismatches with client-side local time logic 
      // if trips happen near midnight UTC, but consistency is improved by using standard IDs.
      const dateKey = t.date.split('T')[0];
      if (!statsByDate[dateKey]) statsByDate[dateKey] = { earnings: 0, trips: 0 };
      
      // FIX: Use Gross Amount (t.amount) instead of Net Payout to match "Period Earnings" on Driver Detail page.
      // The user expects "Total Revenue" to represent the Gross Bookings/Earnings.
      const amount = t.amount || 0;
      statsByDate[dateKey].earnings += amount;
      statsByDate[dateKey].trips += 1;
    });

    // 4. Build History & Calculate Stats
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
