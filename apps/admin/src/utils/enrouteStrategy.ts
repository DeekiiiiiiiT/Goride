import { Trip } from '../types/data';

// Constants
const AVG_ENROUTE_SPEED = 20; // km/h (Conservative city driving speed for enroute)
const DEFAULT_ENROUTE_TIME_HOURS = 0.083; // 5 minutes (Fallback if timestamps missing)

/**
 * Strategy 1: Uniform Average (Preferred)
 * Uses the trusted aggregate total from CSV and distributes it evenly.
 */
export function calculateAverageEnroute(totalDistance: number, tripCount: number): number {
    if (tripCount <= 0) return 0;
    return totalDistance / tripCount;
}

/**
 * Strategy 2: Time-Based Estimate (Fallback)
 * Uses timestamps (Request -> Pickup) to estimate distance.
 * Vulnerable to data errors (e.g. 1 second gaps, missing request times).
 */
export function estimateEnrouteFallback(trip: Trip): number {
    let enrouteDurationHours = 0;
    
    const parseTripDate = (dateStr: string | undefined): Date | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    };

    // Use requestTime if available, fallback to date (which is often request time)
    const requestTime = parseTripDate(trip.requestTime || trip.date);
    // Explicit cast for potential dynamic fields
    const pickupTime = parseTripDate((trip as any).pickupTime);
    const dropoffTime = parseTripDate(trip.dropoffTime);

    // Trip Duration Calculation (needed for fallback logic)
    let tripDurationHours = 0;
    if (pickupTime && dropoffTime) {
         tripDurationHours = (dropoffTime.getTime() - pickupTime.getTime()) / (1000 * 60 * 60);
    } else if (trip.duration) {
         tripDurationHours = trip.duration / 60;
    }
    tripDurationHours = Math.max(0, Math.min(tripDurationHours, 12)); // Clamp to 12h

    // Enroute Duration Calculation
    if (requestTime) {
        if (pickupTime) {
             // Precise: Pickup - Request
             enrouteDurationHours = (pickupTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
        } else if (dropoffTime && tripDurationHours > 0) {
             // Fallback: (Dropoff - Request) - Trip Duration
             const totalTime = (dropoffTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
             enrouteDurationHours = totalTime - tripDurationHours;
        }
    }

    // Sanity Checks
    // Enroute shouldn't be negative or excessively long (> 2 hours)
    enrouteDurationHours = Math.max(0, Math.min(enrouteDurationHours, 2));

    // If enroute is 0 (missing timestamps), assume average
    if (enrouteDurationHours === 0) {
        enrouteDurationHours = DEFAULT_ENROUTE_TIME_HOURS;
    }

    return enrouteDurationHours * AVG_ENROUTE_SPEED;
}
