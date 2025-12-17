import { DriverMetrics, Trip, AlertRule, Notification } from '../types/data';

export const AlertEngine = {
    /**
     * Evaluates current data against active alert rules and generates notifications.
     */
    checkRules: (
        rules: AlertRule[], 
        driverMetrics: DriverMetrics[], 
        trips: Trip[] // Optional, for global fleet metrics
    ): Notification[] => {
        const notifications: Notification[] = [];
        const now = new Date();

        // 1. Check Driver Specific Rules
        driverMetrics.forEach(driver => {
            rules.filter(r => r.enabled).forEach(rule => {
                let triggered = false;
                let value = 0;

                // Map metric names to actual data
                switch (rule.metric) {
                    case 'cancellation_rate':
                        value = (driver.cancellationRate || 0) * 100;
                        break;
                    case 'acceptance_rate':
                        value = (driver.acceptanceRate || 0) * 100;
                        break;
                    case 'rating':
                        value = driver.ratingLast500 || 5;
                        break;
                    case 'utilization':
                         // Estimate utilization if not present
                         value = driver.onlineHours ? (driver.onTripHours / driver.onlineHours) * 100 : 0;
                         break;
                }

                // Check condition
                if (rule.condition === 'gt' && value > rule.threshold) triggered = true;
                if (rule.condition === 'lt' && value < rule.threshold) triggered = true;

                if (triggered) {
                    notifications.push({
                        id: crypto.randomUUID(),
                        type: 'alert',
                        title: `Alert: ${rule.name}`,
                        message: `Driver ${driver.driverName || driver.driverId} triggered ${rule.metric} (${value.toFixed(1)})`,
                        timestamp: now.toISOString(),
                        read: false,
                        severity: rule.severity
                    });
                }
            });
        });

        // 2. Check Global Fleet Rules (Hardcoded basics if custom rules aren't sophisticated enough yet)
        // E.g. Revenue Drop
        const todayRevenue = trips.filter(t => new Date(t.date).toDateString() === now.toDateString())
                                  .reduce((sum, t) => sum + (t.status === 'Completed' ? t.amount : 0), 0);
        
        // Simple heuristic: If it's 5 PM and revenue is $0, that's weird (unless sunday?)
        if (now.getHours() > 17 && todayRevenue === 0 && trips.length > 0) {
             notifications.push({
                id: crypto.randomUUID(),
                type: 'alert',
                title: 'Zero Revenue Alert',
                message: 'No revenue recorded for today despite late hour.',
                timestamp: now.toISOString(),
                read: false,
                severity: 'critical'
            });
        }

        return notifications;
    },

    /**
     * Simulates the "Daily Morning Report" email generation (Phase 8.3)
     */
    generateDailyReport: (metrics: any) => {
        // In a real app, this would call a backend function to send Email/SMS
        console.log("Generating Daily Report...", metrics);
        return {
            success: true,
            recipient: 'admin@goride.com',
            generatedAt: new Date().toISOString(),
            summary: `Daily Report: ${metrics.totalTrips} trips, $${metrics.revenue} revenue.`
        };
    }
};
