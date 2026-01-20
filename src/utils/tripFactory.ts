import { Trip } from '../types/data';
import { RoutePoint, TripStop } from '../types/tripSession';

export interface ManualTripInput {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  endTime?: string; // HH:mm
  duration?: number; // minutes
  amount: number;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive';
  paymentMethod: 'Cash' | 'Card';
  pickupLocation?: string;
  dropoffLocation?: string;
  notes?: string;
  distance?: number;
  vehicleId?: string;
  route?: RoutePoint[];
  stops?: TripStop[];
  totalWaitTime?: number; // seconds
  isLiveRecorded?: boolean; // Context flag: true if coming from live timer
  pickupCoords?: { lat: number; lon: number };
  dropoffCoords?: { lat: number; lon: number };
  resolutionMethod?: 'instant' | 'background' | 'manual' | 'pending';
  resolutionTimestamp?: string;
  geocodeError?: string;
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

  // Determine if this is a cash-based trip where driver collects money directly
  // Phase 2: Logic update - use explicit paymentMethod field
  const isCashTrip = data.paymentMethod === 'Cash';
  const amount = Number(data.amount);

  return {
    id: `manual_${crypto.randomUUID().split('-')[0]}`, // Short unique ID
    platform: data.platform,
    paymentMethod: data.paymentMethod, // Add the payment method to the trip object
    date: startTimestamp,
    requestTime: startTimestamp,
    dropoffTime: endTimestamp,
    duration: data.duration, // Add duration to the trip object
    driverId: driverId,
    driverName: driverName,
    amount: amount,
    status: 'Completed',
    pickupLocation: data.pickupLocation || (data.pickupCoords ? '' : 'Manual Entry'),
    dropoffLocation: data.dropoffLocation || (data.dropoffCoords ? '' : ''),
    startLat: data.pickupCoords?.lat,
    startLng: data.pickupCoords?.lon,
    endLat: data.dropoffCoords?.lat,
    endLng: data.dropoffCoords?.lon,
    distance: data.distance || 0,
    vehicleId: data.vehicleId,
    notes: data.notes || '',
    route: data.route,
    stops: data.stops,
    totalWaitTime: data.totalWaitTime,
    
    // Financials
    // For Cash trips, driver collects amount directly (Net Payout from platform is 0)
    // For Platform trips (Uber/Bolt), platform collects and pays driver (Net Payout = amount)
    cashCollected: isCashTrip ? amount : 0,
    netPayout: isCashTrip ? 0 : amount, 
    
    fareBreakdown: {
      baseFare: amount,
      tips: 0,
      waitTime: 0,
      surge: 0,
      airportFees: 0,
      timeAtStop: 0,
      taxes: 0
    },
    
    // Metadata
    isManual: data.isLiveRecorded ? false : true,
    batchId: data.isLiveRecorded ? 'live_driver_app' : 'manual_entry',
    resolutionMethod: data.resolutionMethod,
    resolutionTimestamp: data.resolutionTimestamp,
    geocodeError: data.geocodeError
  } as Trip;
}
