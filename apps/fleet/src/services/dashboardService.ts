import { DashboardMetrics, DashboardHistory } from '../types/data';

// Mock helpers retained for legacy dashboard scaffolding (live dashboard uses api.getDashboardInit).

export const dashboardService = {
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const now = new Date();
    
    return {
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      hour: now.getHours(),
      
      activeDrivers: 12,
      vehiclesOnline: 14,
      tripsInProgress: 5,
      tripsCompletedToday: 42,
      
      earningsToday: 1250.50,
      
      avgAcceptanceRate: 0.82,
      avgCancellationRate: 0.04,
      fleetUtilization: 65.5,
      
      topDriverName: "Kenny",
      topDriverEarnings: 245.00,
      bottomDriverName: "John D.",
      
      criticalAlertsCount: 0,
      alertDetails: "",
      
      lastUpdateTime: now.toISOString()
    };
  },

  getDashboardHistory: async (metricName: string = 'earnings'): Promise<DashboardHistory[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const history: DashboardHistory[] = [];
    const today = new Date();
    
    for (let i = 0; i < 24; i++) {
        const d = new Date(today.getTime() - i * 60 * 60 * 1000);
        history.push({
            date: d.toISOString().split('T')[0],
            hour: d.getHours(),
            metricName: metricName,
            metricValue: Math.random() * 100 + 50,
            changeVsLastHour: (Math.random() - 0.5) * 10,
            changeVsYesterday: (Math.random() - 0.5) * 20,
            changeVsLastWeek: (Math.random() - 0.5) * 15,
        });
    }
    
    return history;
  },
};
