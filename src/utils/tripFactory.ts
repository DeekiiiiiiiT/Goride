import { Trip } from '../types/data';

export interface ManualTripInput {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  amount: number;
  platform: 'Uber' | 'Lyft' | 'Bolt' | 'InDrive' | 'Private' | 'Cash' | 'Other';
  pickupLocation?: string;
  dropoffLocation?: string;
  notes?: string;
  distance?: number;
  vehicleId?: string;
}

export function createManualTrip(data: ManualTripInput, driverId: string, driverName?: string): Trip {
  // Construct ISO timestamp from date and time components
  // Assuming local time, but we store as ISO. 
  // Ideally we would handle timezone, but for simplicity in manual entry we use browser locale.
  const dateTimeString = `${data.date}T${data.time}:00`;
  const timestamp = new Date(dateTimeString).toISOString();
  
  return {
    id: `manual_${crypto.randomUUID().split('-')[0]}`, // Short unique ID
    platform: data.platform,
    date: timestamp,
    requestTime: timestamp,
    dropoffTime: timestamp,
    driverId: driverId,
    driverName: driverName,
    amount: Number(data.amount),
    status: 'Completed',
    pickupLocation: data.pickupLocation || 'Manual Entry',
    dropoffLocation: data.dropoffLocation || '',
    distance: data.distance || 0,
    vehicleId: data.vehicleId,
    notes: data.notes || '',
    
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
