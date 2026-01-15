import { Trip } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { odometerService } from './odometerService';
import { api } from './api';

export const tripCalibrationService = {
    /**
     * Tags a batch of trips with their corresponding Anchor Period.
     * Logic: For each trip, find the verified anchor immediately preceding it.
     */
    calibrateTrips: async (trips: Trip[]): Promise<Trip[]> => {
        // Group trips by vehicle to minimize anchor lookups
        const vehicleIds = Array.from(new Set(trips.map(t => t.vehicleId).filter(Boolean)));
        
        const vehicleAnchors: Record<string, OdometerReading[]> = {};
        
        // Fetch verified anchors for each vehicle
        await Promise.all(vehicleIds.map(async (vId) => {
            if (!vId) return;
            const history = await odometerService.getUnifiedHistory(vId);
            // We only care about verified anchors for tagging periods
            vehicleAnchors[vId] = history
                .filter(r => r.isVerified)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }));

        return trips.map(trip => {
            if (!trip.vehicleId || !vehicleAnchors[trip.vehicleId]) return trip;

            const anchors = vehicleAnchors[trip.vehicleId];
            const tripDate = new Date(trip.date).getTime();

            // Find the anchor that occurred immediately BEFORE or ON the trip date
            // Since anchors are sorted ascending:
            let startAnchor: OdometerReading | null = null;
            for (let i = anchors.length - 1; i >= 0; i--) {
                if (new Date(anchors[i].date).getTime() <= tripDate) {
                    startAnchor = anchors[i];
                    break;
                }
            }

            if (startAnchor) {
                return {
                    ...trip,
                    anchorPeriodId: startAnchor.id
                };
            }

            return trip;
        });
    }
};
