import { Trip, DriverMetrics, DashboardMetrics } from '../types/data';

export const DashboardMetricsEngine = {
  /**
   * Calculates real-time dashboard metrics based on provided trips and driver data.
   * Compares "Today" vs "Yesterday" for trend analysis.
   */
  calculateMetrics: (trips: Trip[], driverMetrics: DriverMetrics[]): DashboardMetrics => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // --- 1. Filter Data for Time Periods ---
    const tripsToday = trips.filter(t => t.date.startsWith(todayStr));
    const tripsYesterday = trips.filter(t => t.date.startsWith(yesterdayStr));
    
    // --- 2. Calculate Earnings (Step 3.1) ---
    const calculateEarnings = (tripList: Trip[]) => 
      tripList
        .filter(t => t.status === 'Completed')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    const earningsToday = calculateEarnings(tripsToday);
    // Note: If we had yesterday's data in the trips array, we'd use it. 
    // For this implementation, we assume trips array contains history.

    // --- 3. Calculate Cancellation Rate (Step 3.3) ---
    const calculateCancellationRate = (tripList: Trip[]) => {
      if (tripList.length === 0) return 0;
      const cancelled = tripList.filter(t => t.status === 'Cancelled').length;
      return cancelled / tripList.length;
    };
    
    const cancellationRateToday = calculateCancellationRate(tripsToday);

    // --- 4. Calculate Driver Metrics (Step 3.2 & 3.4) ---
    // We assume driverMetrics contains the latest snapshot
    // In a real scenario, we might need to filter by date if driverMetrics has history
    
    const activeDriversCount = driverMetrics.filter(d => d.onlineHours > 0).length;
    
    // Avg Acceptance Rate (Weighted by trips usually, but simple avg here)
    const validAcceptanceMetrics = driverMetrics.filter(d => d.acceptanceRate !== undefined);
    const avgAcceptanceRate = validAcceptanceMetrics.length > 0
      ? validAcceptanceMetrics.reduce((sum, d) => sum + d.acceptanceRate, 0) / validAcceptanceMetrics.length
      : 0;

    // Fleet Utilization (Total Hours On Trip / Total Hours Online)
    const totalOnlineHours = driverMetrics.reduce((sum, d) => sum + (d.onlineHours || 0), 0);
    const totalOnTripHours = driverMetrics.reduce((sum, d) => sum + (d.onTripHours || 0), 0);
    
    const fleetUtilization = totalOnlineHours > 0 
      ? (totalOnTripHours / totalOnlineHours) * 100 
      : 0;

    // --- 5. Leaderboards ---
    const sortedDrivers = [...driverMetrics].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
    const topDriver = sortedDrivers[0];
    
    // Find bottom performer (e.g. lowest acceptance or high cancellation)
    const bottomDriver = [...driverMetrics].sort((a, b) => a.acceptanceRate - b.acceptanceRate)[0];

    // --- 6. Alerts Summary ---
    // Simple count of potential issues
    let criticalAlertsCount = 0;
    if (avgAcceptanceRate < 0.5) criticalAlertsCount++;
    if (cancellationRateToday > 0.1) criticalAlertsCount++;
    // Add logic for individual driver alerts
    const lowAcceptanceDrivers = driverMetrics.filter(d => d.acceptanceRate < 0.5).length;
    criticalAlertsCount += lowAcceptanceDrivers;

    return {
      timestamp: now.toISOString(),
      date: todayStr,
      hour: now.getHours(),
      
      // Real-time Counts
      activeDrivers: activeDriversCount,
      vehiclesOnline: activeDriversCount, // Approx 1:1 for now
      tripsInProgress: tripsToday.filter(t => t.status === 'Processing' || t.status === 'In Progress').length,
      tripsCompletedToday: tripsToday.filter(t => t.status === 'Completed').length,
      
      // Financials
      earningsToday: earningsToday,
      
      // Performance Rates
      avgAcceptanceRate: avgAcceptanceRate,
      avgCancellationRate: cancellationRateToday,
      fleetUtilization: fleetUtilization,
      
      // Leaderboard Highlights
      topDriverName: topDriver ? topDriver.driverName : "N/A",
      topDriverEarnings: topDriver ? (topDriver.totalEarnings || 0) : 0,
      bottomDriverName: bottomDriver ? bottomDriver.driverName : "N/A",
      
      // Alerts Summary
      criticalAlertsCount: criticalAlertsCount,
      alertDetails: `${lowAcceptanceDrivers} drivers with low acceptance`,
      
      lastUpdateTime: now.toISOString()
    };
  }
};
