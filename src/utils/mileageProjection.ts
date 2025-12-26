import { format, differenceInDays } from 'date-fns';
import { odometerService } from '../../services/odometerService';
import { Vehicle } from '../../types/vehicle';

/**
 * Calculates the estimated current mileage based on historical trends.
 * 
 * Logic:
 * 1. Get the most recent odometer reading (from any source).
 * 2. If it's from today, use it directly.
 * 3. If it's older, calculate the vehicle's average daily usage over the last 30 days.
 * 4. Extrapolate the missing days * average daily usage.
 * 5. Add to the last known reading.
 */
export async function calculateLiveMileage(vehicleId: string, currentOdo: number): Promise<{
    estimatedOdo: number;
    isProjected: boolean;
    lastReadingDate: string | null;
    dailyAverage: number;
}> {
    try {
        const history = await odometerService.getHistory(vehicleId);
        
        if (!history || history.length === 0) {
            return {
                estimatedOdo: currentOdo,
                isProjected: false,
                lastReadingDate: null,
                dailyAverage: 0
            };
        }

        // Sort desc by date
        const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastReading = sorted[0];
        
        const lastDate = new Date(lastReading.date);
        const today = new Date();
        const daysDiff = differenceInDays(today, lastDate);

        // If data is from today (or future?), return it as is
        if (daysDiff <= 0) {
            return {
                estimatedOdo: lastReading.value,
                isProjected: false,
                lastReadingDate: lastReading.date,
                dailyAverage: 0
            };
        }

        // Calculate Average Daily Usage (last 30 days window from the last reading backwards)
        // Find a reading close to 30 days before the last reading
        // If not enough history, fallback to a default or total lifetime avg
        
        let pastReading = sorted.find(r => differenceInDays(lastDate, new Date(r.date)) >= 30);
        
        // If we can't find one 30 days ago, take the oldest one we have
        if (!pastReading && sorted.length > 1) {
            pastReading = sorted[sorted.length - 1];
        }

        let dailyAvg = 0;

        if (pastReading) {
            const periodDays = differenceInDays(lastDate, new Date(pastReading.date));
            const periodDist = lastReading.value - pastReading.value;
            
            if (periodDays > 0 && periodDist > 0) {
                dailyAvg = periodDist / periodDays;
            }
        } else {
             // Fallback: If only one reading exists, we can't calculate a trend.
             // We could use a fleet average default (e.g. 50km/day) or just 0.
             // Let's use 0 to be safe and not halllucinate mileage.
             dailyAvg = 0;
        }

        // Apply projection
        const projectedAdd = Math.round(dailyAvg * daysDiff);
        const estimated = lastReading.value + projectedAdd;

        return {
            estimatedOdo: estimated,
            isProjected: true,
            lastReadingDate: lastReading.date,
            dailyAverage: dailyAvg
        };

    } catch (e) {
        console.error("Failed to calculate live mileage", e);
        return {
            estimatedOdo: currentOdo,
            isProjected: false,
            lastReadingDate: null,
            dailyAverage: 0
        };
    }
}
