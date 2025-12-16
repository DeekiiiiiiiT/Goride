import { Trip, DriverMetrics, VehicleMetrics, FinancialRecord } from '../types/data';

/**
 * Service for calculating aggregations and performance metrics 
 * based on the new Phase 1 data architecture.
 */

export const StatsService = {
  
  /**
   * Calculates the Net Payout for a driver:
   * (Total Earnings - Cash Collected) = Payout Amount
   * Positive = Fleet pays Driver
   * Negative = Driver owes Fleet (collected too much cash)
   */
  calculateNetPayout: (records: FinancialRecord[]): number => {
    return records.reduce((acc, record) => {
      // Earnings add to payout, Cash Collected subtracts from payout (since they kept it)
      return acc + (record.amount - record.cashCollected);
    }, 0);
  },

  /**
   * Aggregates Trip data to generate a temporary Vehicle Metric snapshot.
   * Useful if 'REPORT_TYPE_VEHICLE_PERFORMANCE' is missing and we need to estimate.
   */
  estimateVehicleMetrics: (trips: Trip[], vehicleId: string): Partial<VehicleMetrics> => {
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicleId && t.status === 'Completed');
    
    const totalEarnings = vehicleTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalTrips = vehicleTrips.length;
    // Note: Online hours cannot be calculated purely from trips, requires Shift data
    
    return {
      vehicleId,
      totalEarnings,
      totalTrips,
      earningsPerHour: 0 // Cannot calculate without hours
    };
  },

  /**
   * Merges multiple Driver Quality reports into a single timeline or average.
   */
  aggregateDriverMetrics: (metrics: DriverMetrics[]): Partial<DriverMetrics> => {
    if (metrics.length === 0) return {};

    // Weighted averages could be implemented here, 
    // for now we return the most recent record as the "current state"
    // assuming the input is sorted by date.
    const latest = metrics[metrics.length - 1];
    return latest;
  },

  /**
   * Analyzes a list of vehicles to find underperforming assets.
   * Threshold: Earnings Per Hour < target
   */
  identifyUnderperformingVehicles: (metrics: VehicleMetrics[], minEarningsPerHour: number): VehicleMetrics[] => {
    return metrics.filter(m => m.earningsPerHour < minEarningsPerHour && m.onlineHours > 10); // Ignore low sample size
  }
};
