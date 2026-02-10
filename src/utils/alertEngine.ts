import { DriverMetrics, Trip, AlertRule, Notification, VehicleMetrics, DashboardAlert } from '../types/data';
import { WeeklyCheckIn } from '../types/check-in';
import { FuelEntry, MileageAdjustment } from '../types/fuel';
import { startOfWeek, isAfter, setDay, differenceInDays } from 'date-fns';

export const AlertEngine = {
    /**
     * Phase 4: Enhanced Alert Detection Engine
     * Generates structured DashboardAlerts based on specific business rules.
     */
    generateDashboardAlerts: (
        driverMetrics: DriverMetrics[], 
        vehicleMetrics: VehicleMetrics[],
        trips: Trip[],
        fuelEntries: FuelEntry[] = [],
        adjustments: MileageAdjustment[] = [],
        checkIns: WeeklyCheckIn[] = [],
        maintenanceLogs: any[] = [] // Added Phase 8
    ): DashboardAlert[] => {
        const alerts: DashboardAlert[] = [];
        const now = new Date();
        const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split('T')[0];

        // --- 1. Driver Checks (Every 15 min in real system) ---
        // ... (existing logic) ...
        driverMetrics.forEach(driver => {
            // Condition 1: Acceptance Rate < 50%
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
                    severity: 'medium',
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
            let utilization = vehicle.utilizationRate;
            if (utilization === undefined && vehicle.onlineHours > 0) {
                utilization = (vehicle.onTripHours / vehicle.onlineHours) * 100;
            } else if (utilization === undefined) {
                utilization = 0;
            }

            if (utilization < 40 && vehicle.onlineHours > 1) { 
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

            // --- Phase 8: Predictive Maintenance Alerts ---
            const vLogs = (maintenanceLogs || []).filter(log => log.vehicleId === vehicle.vehicleId);
            const currentOdo = vehicle.odometer || 0;
            
            // Find latest service odometer and date
            const latestLog = vLogs.length > 0 
                ? [...vLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                : null;
            
            const lastServiceOdo = latestLog?.odo || 0;
            const lastServiceDate = latestLog?.date ? new Date(latestLog.date) : null;
            
            const kmSinceService = currentOdo - lastServiceOdo;
            const SERVICE_INTERVAL = 5000;
            const kmRemaining = SERVICE_INTERVAL - (kmSinceService % SERVICE_INTERVAL);
            const daysSinceService = lastServiceDate ? differenceInDays(now, lastServiceDate) : 0;
            
            if (kmRemaining < 500 || daysSinceService > 150) {
                 const isCritical = kmRemaining < 100 || daysSinceService > 180;
                 const isHigh = kmRemaining < 500 || daysSinceService > 165;
                 const severity = isCritical ? 'critical' : (isHigh ? 'high' : 'medium');
                 
                 const nextDue = Math.ceil((currentOdo + kmRemaining) / 5000) * 5000;
                 
                 // Priority Scoring (0-100)
                 const odoUrgency = Math.max(0, (500 - kmRemaining) / 500) * 50;
                 const timeUrgency = Math.max(0, (daysSinceService - 150) / 30) * 50;
                 const severityScore = Math.min(100, Math.round(odoUrgency + timeUrgency));

                 let description = `Vehicle is due for Service in ${kmRemaining.toFixed(0)} km.`;
                 if (daysSinceService > 150 && kmRemaining >= 500) {
                     description = `Temporal service limit approaching: ${daysSinceService} days since last service.`;
                 }

                 alerts.push({
                    id: `maint-due-${vehicle.vehicleId}-${severityScore}`,
                    definitionId: 'def-maintenance-due',
                    timestamp: now.toISOString(),
                    severity: severity,
                    title: `Maintenance Required: ${vehicle.plateNumber}`,
                    description: `${description} Target Odometer: ${nextDue.toLocaleString()} km.`,
                    status: 'new',
                    vehicleId: vehicle.vehicleId,
                    metadata: {
                        nextServiceType: (nextDue % 10000 === 0) ? 'B' : 'A',
                        remainingKm: kmRemaining,
                        daysSinceService,
                        severityScore
                    }
                });
            }

            // --- Step 2.3: Predictive Fuel Fatigue Alerts ---
            const vFuel = (fuelEntries || [])
                .filter(e => e.vehicleId === vehicle.vehicleId && (e.odometer || 0) > 0)
                .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (vFuel.length >= 4) {
                const efficiencies = [];
                for (let i = 0; i < vFuel.length - 1; i++) {
                    const current = vFuel[i];
                    const prev = vFuel[i+1];
                    const dist = current.odometer! - prev.odometer!;
                    const liters = prev.liters || (prev.amount / 1.5); // Fallback estimate
                    if (dist > 0 && liters > 0) {
                        efficiencies.push(dist / liters);
                    }
                }

                if (efficiencies.length >= 3) {
                    const latestEff = efficiencies[0];
                    const avgPrevEff = (efficiencies[1] + efficiencies[2]) / 2;
                    
                    if (latestEff < avgPrevEff * 0.82) { // 18% drop
                        alerts.push({
                            id: `fuel-fatigue-${vehicle.vehicleId}-${now.getTime()}`,
                            definitionId: 'def-fuel-fatigue',
                            timestamp: now.toISOString(),
                            severity: 'medium',
                            title: `Mechanical Health Alert: ${vehicle.plateNumber}`,
                            description: `Detected 18%+ drop in fuel efficiency (km/L). Suggests engine strain or spark plug wear.`,
                            status: 'new',
                            vehicleId: vehicle.vehicleId,
                            metadata: {
                                efficiencyDrop: ((1 - (latestEff / avgPrevEff)) * 100).toFixed(1),
                                currentKmPerL: latestEff.toFixed(2),
                                baselineKmPerL: avgPrevEff.toFixed(2)
                            }
                        });
                    }
                }
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

        // --- 4. Fuel Leakage Checks (Phase 7) ---
        // Group data by vehicle for the current week
        // Phase 8.1: Filter out records with invalid timestamps or zero odometer readings to prevent false positives ($14k leakage)
        const weekTrips = trips.filter(t => t.date && t.date >= currentWeekStart && t.date !== "Invalid Date" && !t.date.includes("undefined"));
        const weekEntries = fuelEntries.filter(e => 
            e.date && 
            e.date >= currentWeekStart && 
            e.date !== "Invalid Date" && 
            !e.date.includes("undefined") &&
            (e.odometer || 0) > 0
        );
        
        vehicleMetrics.forEach(vehicle => {
            const vTrips = weekTrips.filter(t => t.vehicleId === vehicle.vehicleId);
            const vEntries = weekEntries.filter(e => e.vehicleId === vehicle.vehicleId);
            
            if (vEntries.length === 0) return; // No fuel spend, no leakage

            const totalSpend = vEntries.reduce((sum, e) => sum + e.amount, 0);
            const totalDistance = vTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
            
            // Simplified Estimation: Est Cost = Distance * 0.15 (approx $0.15/km)
            const estimatedCost = totalDistance * 0.15;
            const leakage = totalSpend - estimatedCost;

            if (leakage > 25) { // Threshold $25
                 alerts.push({
                    id: `leak-${vehicle.vehicleId}-${crypto.randomUUID()}`,
                    definitionId: 'def-fuel-leakage',
                    timestamp: now.toISOString(),
                    severity: 'high',
                    title: `High Consumption Detected: ${vehicle.plateNumber}`,
                    description: `Spend ($${totalSpend.toFixed(0)}) exceeds estimate ($${estimatedCost.toFixed(0)}) by $${leakage.toFixed(0)}.`,
                    status: 'new',
                    vehicleId: vehicle.vehicleId
                });
            }
        });

        // --- 5. Missing Check-In Checks (Phase 7) ---
        // Only trigger if it's past Tuesday
        const tuesday = setDay(new Date(currentWeekStart), 2); 
        // Note: setDay(..., 2) sets to Tuesday of the same week
        
        if (isAfter(now, tuesday)) {
             driverMetrics.forEach(driver => {
                 // Only check drivers who have trips this week (Active)
                 const hasTrips = weekTrips.some(t => t.driverId === driver.driverId);
                 if (!hasTrips) return;

                 const hasCheckIn = checkIns.some(c => 
                     c.driverId === driver.driverId && 
                     c.weekStart === currentWeekStart
                 );
                 
                 if (!hasCheckIn) {
                     alerts.push({
                        id: `miss-check-${driver.driverId}-${currentWeekStart}`,
                        definitionId: 'def-missing-checkin',
                        timestamp: now.toISOString(),
                        severity: 'medium',
                        title: `Missing Weekly Check-In: ${driver.driverName}`,
                        description: `Active driver has not submitted odometer reading for week of ${currentWeekStart}.`,
                        status: 'new',
                        driverId: driver.driverId
                    });
                 }
             });
        }

        // --- 6. Manual Odometer Overrides (Phase 6) ---
        checkIns.forEach(checkIn => {
             if (checkIn.method === 'manual_override' && checkIn.reviewStatus === 'pending_review') {
                 // Find driver name for better context
                 const driverName = driverMetrics.find(d => d.driverId === checkIn.driverId)?.driverName || 'Unknown Driver';
                 
                 alerts.push({
                     id: `man-odo-${checkIn.id}`,
                     definitionId: 'def-manual-odometer',
                     timestamp: checkIn.timestamp || now.toISOString(),
                     severity: 'high',
                     title: `Manual Odometer Override: ${driverName}`,
                     description: `Driver manually entered ${checkIn.odometer} km. Reason: "${checkIn.manualReadingReason || 'None provided'}". Photo evidence requires review.`,
                     status: 'new',
                     driverId: checkIn.driverId,
                     metadata: { checkInId: checkIn.id }
                 });
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
