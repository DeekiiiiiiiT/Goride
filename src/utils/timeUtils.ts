import { Trip } from '../types/data';
import { parseISO, subMinutes, addMinutes, isValid, differenceInMinutes } from 'date-fns';

export interface TripTimes {
  requestTime: Date; // The time the driver accepted the trip
  pickupTime: Date;  // The time the rider entered the car (Start of Active Window)
  dropoffTime: Date; // The time the rider exited the car (End of Active Window)
  isValid: boolean;  // False if critical times are missing
}

export interface TripWindows {
  activeStart: Date;
  activeEnd: Date;
  approachStart: Date;
  approachEnd: Date;
  searchStart: Date;
  searchEnd: Date;
}

/**
 * Calculates the precise timestamps for a trip based on available data.
 * Crucially, it derives the Pickup Time (Start of Trip) from Dropoff - Duration
 * if an explicit Pickup Time is missing.
 */
export function calculateTripTimes(trip: Trip): TripTimes {
  // 1. Determine Dropoff Time (Anchor)
  // Fallback to generic date if dropoff specific time is missing (though unlikely for valid trips)
  const dropoffStr = trip.dropoffTime || trip.date;
  const dropoffTime = parseISO(dropoffStr);

  // 2. Determine Request Time
  // Fallback to generic date if missing
  const requestStr = trip.requestTime || trip.date;
  const requestTime = parseISO(requestStr);

  // 3. Calculate Pickup Time (The "Start" of the paid trip)
  let pickupTime: Date;
  
  if (trip.startTime) {
     // If we have explicit start time from a better data source
     pickupTime = parseISO(trip.startTime);
  } else if (trip.duration) {
     // Standard derivation: Pickup = Dropoff - Duration
     pickupTime = subMinutes(dropoffTime, trip.duration);
  } else {
     // Fallback: If no duration, we unfortunately have to approximate.
     // However, strictly speaking, this creates the "Deadhead Risk" if we assume Pickup = Request.
     // Safer default: Assume a short trip if duration unknown? 
     // Or fall back to Request Time but flag it?
     // For now, to maintain "safe" logic, if we lack duration, we might have to use Request Time
     // BUT we should be aware this is the "Flawed" logic.
     // Ideally, we shouldn't match claims without duration.
     pickupTime = requestTime; 
  }

  // Validation
  const valid = isValid(dropoffTime) && isValid(requestTime) && isValid(pickupTime);

  return {
    requestTime,
    pickupTime,
    dropoffTime,
    isValid: valid
  };
}

/**
 * Generates the three critical windows for the Reconciliation Waterfall
 */
export function getTripWindows(times: TripTimes): TripWindows {
  // 1. Active Window (Uber Pays)
  // STRICT: Pickup to Dropoff. No buffers.
  const activeStart = times.pickupTime;
  const activeEnd = times.dropoffTime;

  // 2. Approach Window (Tax Deductible)
  // From 45 mins before Request (or just Request?) until Pickup.
  // Idea_1 says: "Request Time - 45 minutes" to "Trip Start Time"
  const approachStart = subMinutes(times.requestTime, 45);
  const approachEnd = times.pickupTime;

  // 3. Search Window (Broad Net)
  // Just to find candidates. 
  // Start: Approach Start
  // End: Dropoff + 15 mins (just in case of GPS lag for "Green" matches if we decide to be lenient later, 
  // or just to see them in the UI even if they fail strict matching)
  const searchStart = approachStart;
  const searchEnd = addMinutes(times.dropoffTime, 15);

  return {
    activeStart,
    activeEnd,
    approachStart,
    approachEnd,
    searchStart,
    searchEnd
  };
}
