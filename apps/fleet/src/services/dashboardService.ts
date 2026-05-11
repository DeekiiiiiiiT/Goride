import { DashboardMetrics, DashboardHistory, DashboardAlertDefinition, DashboardAlert } from '../types/data';

// Mock Data for Phase 1 Infrastructure

export const dashboardService = {
  // 1.1 Dashboard Live Metrics
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    // Simulate API latency
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
      
      criticalAlertsCount: 2,
      alertDetails: "2 Drivers below acceptance threshold",
      
      lastUpdateTime: now.toISOString()
    };
  },

  // 1.3 Historical Dashboard Archive
  getDashboardHistory: async (metricName: string = 'earnings'): Promise<DashboardHistory[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Return mock history for the last 24 hours
    const history: DashboardHistory[] = [];
    const today = new Date();
    
    for (let i = 0; i < 24; i++) {
        const d = new Date(today.getTime() - i * 60 * 60 * 1000);
        history.push({
            date: d.toISOString().split('T')[0],
            hour: d.getHours(),
            metricName: metricName,
            metricValue: Math.random() * 100 + 50, // Mock random values
            changeVsLastHour: (Math.random() - 0.5) * 10,
            changeVsYesterday: (Math.random() - 0.5) * 20,
            changeVsLastWeek: (Math.random() - 0.5) * 15,
        });
    }
    
    return history;
  },

  // 1.4 Alert Definitions
  getAlertDefinitions: async (): Promise<DashboardAlertDefinition[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return [
      {
        id: '1',
        name: 'Low Acceptance Rate',
        condition: 'acceptance_rate < 0.5',
        threshold: 0.5,
        severity: 'critical',
        notificationType: 'dashboard',
        actionRequired: 'Schedule meeting',
        autoResolve: false,
        checkFrequency: '15min',
        active: true,
        lastTriggered: new Date().toISOString()
      },
      {
        id: '2',
        name: 'High Cancellation Rate',
        condition: 'cancellation_rate > 0.1',
        threshold: 0.1,
        severity: 'critical',
        notificationType: 'email',
        actionRequired: 'Review reasons',
        autoResolve: false,
        checkFrequency: '15min',
        active: true
      },
      {
        id: '3',
        name: 'Low Vehicle Utilization',
        condition: 'utilization < 0.4',
        threshold: 0.4,
        severity: 'medium',
        notificationType: 'dashboard',
        actionRequired: 'Reassign vehicle',
        autoResolve: true,
        checkFrequency: 'hourly',
        active: true
      }
    ];
  },
  
  // Fetch Active Alerts
  getAlerts: async (): Promise<DashboardAlert[]> => {
      await new Promise(resolve => setTimeout(resolve, 400));
      return [
          {
              id: 'a1',
              definitionId: '1',
              timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
              severity: 'critical',
              title: 'Driver Kenny has low acceptance (45%)',
              description: 'Acceptance rate dropped below 50% threshold.',
              status: 'new',
              driverId: 'd1'
          },
          {
              id: 'a2',
              definitionId: '3',
              timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
              severity: 'medium',
              title: 'Vehicle 5179KZ underutilized (30%)',
              description: 'Vehicle utilization is below 40% target.',
              status: 'viewed',
              vehicleId: 'v1'
          }
      ];
  }
};
