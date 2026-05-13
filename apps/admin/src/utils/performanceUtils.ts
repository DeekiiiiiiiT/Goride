import { DriverPerformanceSummary } from "../types/performance";

export type PerformanceStatus = 'Excellent' | 'Good' | 'Fair' | 'At Risk' | 'Critical';

export const getComplianceStatus = (successRate: number): PerformanceStatus => {
  if (successRate >= 90) return 'Excellent';
  if (successRate >= 80) return 'Good';
  if (successRate >= 70) return 'Fair';
  if (successRate >= 50) return 'At Risk';
  return 'Critical';
};

export const getStatusColor = (status: PerformanceStatus): string => {
  switch (status) {
    case 'Excellent': return 'bg-green-100 text-green-800 border-green-200';
    case 'Good': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Fair': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'At Risk': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'Critical': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const getTopPerformers = (drivers: DriverPerformanceSummary[], limit = 5): DriverPerformanceSummary[] => {
  // Sort by success rate desc, then by total earnings desc
  return [...drivers].sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return b.totalEarnings - a.totalEarnings;
  }).slice(0, limit);
};

export const getAtRiskDrivers = (drivers: DriverPerformanceSummary[], limit = 5): DriverPerformanceSummary[] => {
  // Filter for drivers who have been somewhat active (e.g. at least 1 trip) but are failing
  const activeDrivers = drivers.filter(d => d.totalTrips > 0);
  
  // Sort by success rate asc (lowest first)
  return [...activeDrivers].sort((a, b) => {
    if (a.successRate !== b.successRate) return a.successRate - b.successRate;
    return a.averageDeficit - b.averageDeficit; // Higher deficit = worse
  }).slice(0, limit);
};

export const getDriverStats = (drivers: DriverPerformanceSummary[]) => {
  const activeCount = drivers.filter(d => d.totalDaysActive > 0).length;
  const totalTrips = drivers.reduce((sum, d) => sum + d.totalTrips, 0);
  const totalEarnings = drivers.reduce((sum, d) => sum + d.totalEarnings, 0);
  const totalMissedDays = drivers.reduce((sum, d) => sum + (d.totalDaysActive - d.daysMetQuota), 0);
  
  const avgSuccessRate = activeCount > 0 
    ? drivers.reduce((sum, d) => sum + d.successRate, 0) / activeCount 
    : 0;

  return {
    activeCount,
    totalTrips,
    totalEarnings,
    totalMissedDays,
    avgSuccessRate: Math.round(avgSuccessRate)
  };
};
