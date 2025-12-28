import { format, differenceInDays } from 'date-fns';
import { odometerService } from '../../services/odometerService';
import { Vehicle, OdometerReading } from '../../types/vehicle';
import { Trip } from '../../types/data';

/**
 * Merges persistent odometer readings with calculated mileage from trips.
 */
export function mergeTripsIntoHistory(history: OdometerReading[], trips: Trip[] = []): OdometerReading[] {
    if (!trips || trips.length === 0) return history;

    // Filter trips for this vehicle is handled by caller or assumed? 
    // Best to filter if we can, but we don't have vehicleId easily here unless passed.
    // We will assume trips passed are relevant.

    // Group by Day
    const dailyTrips: Record<string, number> = {};
    trips.forEach(t => {
        // Safe check for date
        if (!t.date && !t.requestTime) return;
        const d = t.date || t.requestTime || '';
        const day = d.split('T')[0];
        dailyTrips[day] = (dailyTrips[day] || 0) + (t.distance || 0);
    });

    const events: { date: string, type: 'Reading' | 'Trip', value?: number, distance?: number, obj?: any }[] = [];
    
    history.forEach(r => {
        events.push({ date: r.date.split('T')[0], type: 'Reading', value: r.value, obj: r });
    });
    
    Object.entries(dailyTrips).forEach(([date, dist]) => {
        // Only add trip event if there isn't already a hard reading for this date?
        // Let's assume hard readings override trips for that day.
        if (!history.some(r => r.date.split('T')[0] === date)) {
             events.push({ date, type: 'Trip', distance: dist });
        }
    });

    events.sort((a, b) => a.date.localeCompare(b.date));

    let runningOdo = 0;
    
    // Find baseline (first hard reading)
    const firstHardIndex = events.findIndex(e => e.type === 'Reading');
    
    if (firstHardIndex > 0) {
        // Back-calculate from first hard reading
        let backCalcOdo = events[firstHardIndex].value || 0;
        for (let i = firstHardIndex - 1; i >= 0; i--) {
            if (events[i].type === 'Trip') {
                backCalcOdo -= (events[i].distance || 0);
            }
        }
        runningOdo = Math.max(0, backCalcOdo);
    } else if (firstHardIndex === 0) {
        runningOdo = events[0].value || 0;
    } else {
        // No hard readings at all? Start from 0.
        runningOdo = 0;
    }

    const processedEvents: OdometerReading[] = [];

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        
        if (e.type === 'Reading') {
            runningOdo = e.value!;
            processedEvents.push(e.obj);
        } else {
            runningOdo += e.distance!;
            processedEvents.push({
                id: `virtual-trip-${e.date}`,
                vehicleId: history[0]?.vehicleId || 'unknown',
                date: e.date,
                value: runningOdo,
                type: 'Calculated',
                source: 'Trip Import',
                notes: `Daily aggregate of ${(e.distance || 0).toFixed(1)} km`,
            } as any);
        }
    }
    
    return processedEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

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
export async function calculateLiveMileage(vehicleId: string, currentOdo: number, trips: Trip[] = []): Promise<{
    estimatedOdo: number;
    isProjected: boolean;
    lastReadingDate: string | null;
    dailyAverage: number;
}> {
    try {
        const history = await odometerService.getHistory(vehicleId);
        
        // Merge trips into history
        const mergedHistory = mergeTripsIntoHistory(history, trips);
        
        if (!mergedHistory || mergedHistory.length === 0) {
            return {
                estimatedOdo: currentOdo,
                isProjected: false,
                lastReadingDate: null,
                dailyAverage: 0
            };
        }

        // Sort desc by date (already done by mergeTripsIntoHistory but safe to ensure)
        const sorted = mergedHistory; // mergeTripsIntoHistory returns desc sorted
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
