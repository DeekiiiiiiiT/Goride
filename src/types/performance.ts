export interface DailyPerformance {
  date: string;
  earnings: number;
  trips: number;
  metQuota: boolean;
  deficit: number;
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
