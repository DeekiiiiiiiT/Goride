import { DriverMetrics, Trip, AlertRule, Notification, VehicleMetrics, DashboardAlert } from '../types/data';

export const AlertEngine = {
    /**
     * Phase 4: Enhanced Alert Detection Engine
     * Generates structured DashboardAlerts based on specific business rules.
     */
    generateDashboardAlerts: (
        driverMetrics: DriverMetrics[], 
        vehicleMetrics: VehicleMetrics[],
        trips: Trip[]
    ): DashboardAlert[] => {
        const alerts: DashboardAlert[] = [];
        const now = new Date();

        // --- 1. Driver Checks (Every 15 min in real system) ---
        driverMetrics.forEach(driver => {
            // Condition 1: Acceptance Rate < 50%
            // Ensure we have a valid acceptance rate (0-1)
            const acceptance = driver.acceptanceRate !== undefined ? driver.acceptanceRate : 1; 
            if (acceptance < 0.5) {
                alerts.push({
                    id: `drv-acc-${driver.driverId}-${crypto.randomUUID()}`,
                    definitionId: 'def-low-acceptance',
                    timestamp: now.toISOString(),
                    severity: 'critical',
                    title: `Driver ${driver.driverName} has low acceptance (${(acceptance * 100).toFixed(0)}%)`,
                    description: `Acceptance rate is below the 50% threshold. Target: 85%`,
                    status: 'new',
                    driverId: driver.driverId
                });
            }

            // Condition 2: Cancellation Rate > 10%
            const cancellation = driver.cancellationRate !== undefined ? driver.cancellationRate : 0;
            if (cancellation > 0.1) {
                alerts.push({
                    id: `drv-can-${driver.driverId}-${crypto.randomUUID()}`,
                    definitionId: 'def-high-cancellation',
                    timestamp: now.toISOString(),
                    severity: 'critical',
                    title: `Driver ${driver.driverName} has high cancellations (${(cancellation * 100).toFixed(0)}%)`,
                    description: `Cancellation rate exceeds 10% limit.`,
                    status: 'new',
                    driverId: driver.driverId
                });
            }

            // Condition 3: Rating < 4.5
            const rating = driver.ratingLast500 !== undefined ? driver.ratingLast500 : 5;
            if (rating < 4.5) {
                alerts.push({
                    id: `drv-rat-${driver.driverId}-${crypto.randomUUID()}`,
                    definitionId: 'def-low-rating',
                    timestamp: now.toISOString(),
                    severity: 'medium', // Mapped 'Warning' to 'medium' or 'high'
                    title: `Driver ${driver.driverName} rating dropped to ${rating.toFixed(2)}`,
                    description: `Driver rating is below 4.5 quality standard.`,
                    status: 'new',
                    driverId: driver.driverId
                });
            }
        });

        // --- 2. Vehicle Checks (Hourly) ---
        vehicleMetrics.forEach(vehicle => {
            // Condition: Utilization < 40%
            // Utilization might be pre-calculated or needs calc
            let utilization = vehicle.utilizationRate;
            if (utilization === undefined && vehicle.onlineHours > 0) {
                utilization = (vehicle.onTripHours / vehicle.onlineHours) * 100;
            } else if (utilization === undefined) {
                utilization = 0;
            }

            if (utilization < 40 && vehicle.onlineHours > 1) { // Only alert if vehicle was actually online for a bit
                alerts.push({
                    id: `veh-util-${vehicle.vehicleId}-${crypto.randomUUID()}`,
                    definitionId: 'def-low-utilization',
                    timestamp: now.toISOString(),
                    severity: 'medium',
                    title: `Vehicle ${vehicle.plateNumber} underutilized (${utilization.toFixed(0)}%)`,
                    description: `Utilization is below 40% target. Check assignments.`,
                    status: 'new',
                    vehicleId: vehicle.vehicleId
                });
            }
        });

        // --- 3. Route Checks (Daily) ---
        // Need to aggregate trips by route (pickup -> dropoff approx)
        // This is expensive, so we do a simplified version
        const routeStats: Record<string, { total: number, cancelled: number }> = {};
        
        trips.forEach(trip => {
            if (!trip.pickupLocation || !trip.dropoffLocation) return;
            // Simple clustering by first 10 chars of location for demo purposes
            // In real app, we'd use zones
            const routeKey = `${trip.pickupLocation.substring(0, 10)}... -> ${trip.dropoffLocation.substring(0, 10)}...`;
            
            if (!routeStats[routeKey]) routeStats[routeKey] = { total: 0, cancelled: 0 };
            routeStats[routeKey].total++;
            if (trip.status === 'Cancelled') routeStats[routeKey].cancelled++;
        });

        Object.entries(routeStats).forEach(([route, stats]) => {
            if (stats.total >= 5) { // Minimum sample size
                const rate = stats.cancelled / stats.total;
                if (rate > 0.2) {
                     alerts.push({
                        id: `rte-can-${route.substring(0,5)}-${crypto.randomUUID()}`,
                        definitionId: 'def-route-risk',
                        timestamp: now.toISOString(),
                        severity: 'critical',
                        title: `High cancellations on route: ${route}`,
                        description: `Cancellation rate is ${(rate * 100).toFixed(0)}% (${stats.cancelled}/${stats.total} trips).`,
                        status: 'new',
                        routeId: route
                    });
                }
            }
        });

        return alerts.sort((a,b) => {
             // Sort by Severity (Critical first) then Time
             const severityScore = { critical: 3, high: 2, medium: 1, low: 0 };
             const scoreA = severityScore[a.severity];
             const scoreB = severityScore[b.severity];
             if (scoreA !== scoreB) return scoreB - scoreA;
             return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    },

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
