import { Trip } from '../types/data';
import { RoutePoint } from '../types/tripSession';

export interface ManualTripInput {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  endTime?: string; // HH:mm
  duration?: number; // minutes
  amount: number;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive' | 'Private' | 'Cash' | 'Other';
  pickupLocation?: string;
  dropoffLocation?: string;
  notes?: string;
  distance?: number;
  vehicleId?: string;
  route?: RoutePoint[];
}

export function createManualTrip(data: ManualTripInput, driverId: string, driverName?: string): Trip {
  // Construct ISO timestamp from date and time components
  // Assuming local time, but we store as ISO. 
  // Ideally we would handle timezone, but for simplicity in manual entry we use browser locale.
  const dateTimeString = `${data.date}T${data.time}:00`;
  const startTime = new Date(dateTimeString);
  const startTimestamp = startTime.toISOString();
  
  let endTimestamp = startTimestamp;
  
  // Calculate end timestamp
  if (data.endTime) {
    const endDateTimeString = `${data.date}T${data.endTime}:00`;
    // Handle case where trip crosses midnight (end time < start time)
    let endTime = new Date(endDateTimeString);
    if (endTime < startTime) {
       endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
    }
    endTimestamp = endTime.toISOString();
  } else if (data.duration) {
    // If no explicit end time but duration exists, calculate it
    endTimestamp = new Date(startTime.getTime() + data.duration * 60000).toISOString();
  }

  return {
    id: `manual_${crypto.randomUUID().split('-')[0]}`, // Short unique ID
    platform: data.platform,
    date: startTimestamp,
    requestTime: startTimestamp,
    dropoffTime: endTimestamp,
    duration: data.duration, // Add duration to the trip object
    driverId: driverId,
    driverName: driverName,
    amount: Number(data.amount),
    status: 'Completed',
    pickupLocation: data.pickupLocation || 'Manual Entry',
    dropoffLocation: data.dropoffLocation || '',
    distance: data.distance || 0,
    vehicleId: data.vehicleId,
    notes: data.notes || '',
    route: data.route,
    
    // Financials
    netPayout: Number(data.amount), // For manual trips, we assume the entered amount is what the driver got
    fareBreakdown: {
      baseFare: Number(data.amount),
      tips: 0,
      waitTime: 0,
      surge: 0,
      airportFees: 0,
      timeAtStop: 0,
      taxes: 0
    },
    
    // Metadata
    isManual: true, // Custom flag to help UI distinguish
    batchId: 'manual_entry'
  } as Trip;
}
