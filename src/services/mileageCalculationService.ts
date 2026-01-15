import { api } from './api';
import { odometerService } from './odometerService';
import { OdometerReading, MileageReport } from '../types/vehicle';
import { Trip } from '../types/data';

export const mileageCalculationService = {
    /**
     * Fetches the trips that belong to a specific period/gap.
     * Prioritizes the 'anchorPeriodId' tag, falls back to date range.
     */
    getTripsForPeriod: async (vehicleId: string, startAnchor: OdometerReading, endAnchor: OdometerReading): Promise<Trip[]> => {
        let periodTrips: Trip[] = [];
        try {
            // Phase 6: Priority Tag Search
            // If the system has already calibrated trips, we can search by anchorPeriodId
            const response = await api.getTripsFiltered({
                vehicleId,
                anchorPeriodId: startAnchor.id, // Direct lookup by tag
                limit: 1000 
            });
            periodTrips = response.data;

            // Fallback: If no trips found by tag (e.g. legacy data or first import), use date search
            if (periodTrips.length === 0) {
                const dateResponse = await api.getTripsFiltered({
                    vehicleId,
                    startDate: startAnchor.date,
                    endDate: endAnchor.date,
                    limit: 1000
                });
                periodTrips = dateResponse.data;
            }
        } catch (e) {
            console.error("Failed to fetch filtered trips, falling back to all trips", e);
            const allTrips = await api.getTrips();
            periodTrips = allTrips.filter(t => {
                const tDate = new Date(t.date).getTime();
                return t.vehicleId === vehicleId && 
                       tDate >= new Date(startAnchor.date).getTime() && 
                       tDate <= new Date(endAnchor.date).getTime();
            });
        }
        return periodTrips;
    },

    /**
     * Calculates personal mileage for a given period between two verified anchors.
     * Logic: Residual Personal = (End Anchor - Start Anchor) - sum(Platform Trip Distance)
     */
    calculatePeriodMileage: async (vehicleId: string, startAnchor: OdometerReading, endAnchor: OdometerReading): Promise<MileageReport> => {
        // Fetch trips for this vehicle in the specific time window
        const periodTrips = await mileageCalculationService.getTripsForPeriod(vehicleId, startAnchor, endAnchor);

        const totalDistance = endAnchor.value - startAnchor.value;
        const platformDistance = periodTrips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        
        // Residual Personal = (Total) - (Business/Platform)
        const personalDistance = Math.max(0, totalDistance - platformDistance);
        const personalPercentage = totalDistance > 0 ? (personalDistance / totalDistance) * 100 : 0;

        // Step 4.3: Error Handling / Anomaly Detection
        let anomalyDetected = false;
        let anomalyReason = undefined;

        if (totalDistance < 0) {
            anomalyDetected = true;
            anomalyReason = "End odometer is lower than start odometer (Possible error or speedometer reset).";
        } else if (totalDistance - platformDistance < -1) { // 1km tolerance for GPS vs Odo drift
            anomalyDetected = true;
            anomalyReason = `Platform distance (${platformDistance.toFixed(1)}km) exceeds total physical distance (${totalDistance.toFixed(1)}km). Check for overlapping trips or incorrect odometer entry.`;
        }

        return {
            vehicleId,
            periodStart: startAnchor.date,
            periodEnd: endAnchor.date,
            startOdometer: startAnchor.value,
            endOdometer: endAnchor.value,
            totalDistance,
            platformDistance,
            personalDistance,
            personalPercentage,
            anomalyDetected,
            anomalyReason,
            tripCount: periodTrips.length
        };
    },

    /**
     * Generates a full report for all consecutive verified anchor pairs in the vehicle's history.
     */
    generateFullHistoryReport: async (vehicleId: string): Promise<MileageReport[]> => {
        // Unified history is sorted desc by date in odometerService.getUnifiedHistory
        const history = await odometerService.getUnifiedHistory(vehicleId);
        
        // We need them ascending to process pairs
        const sortedHistory = [...history]
            .filter(r => r.isVerified) // Only use verified anchors for calculation
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const reports: MileageReport[] = [];
        
        // Process in pairs
        for (let i = 0; i < sortedHistory.length - 1; i++) {
            const startAnchor = sortedHistory[i];
            const endAnchor = sortedHistory[i+1];
            
            const report = await mileageCalculationService.calculatePeriodMileage(vehicleId, startAnchor, endAnchor);
            reports.push(report);
        }
        
        return reports;
    }
};
