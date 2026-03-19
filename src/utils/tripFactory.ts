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
  // InDrive fee tracking
  indriveNetIncome?: number;    // What the driver keeps after InDrive's cut
  indriveServiceFee?: number;   // Auto-calculated: amount - indriveNetIncome
  indriveServiceFeePercent?: number; // Auto-calculated: (fee / amount) * 100
  indriveBalanceDeduction?: number;  // Auto-calculated: fee from InDrive Balance (cash trips only)
  // Service category (InDrive only: ride vs courier/delivery)
  serviceCategory?: 'ride' | 'courier';
  // Cancellation tracking
  tripStatus?: 'Completed' | 'Cancelled'; // Default: 'Completed'
  cancelledBy?: 'rider' | 'driver';       // Only relevant when tripStatus === 'Cancelled'
  cancellationReason?: string;             // Free-text or selected from common reasons
  cancellationFee?: number;                // Fee charged to rider on cancellation (driver may or may not receive this)
  // Intermediate stops (multi-stop trips, e.g. InDrive)
  intermediateStops?: { id: string; address: string; coords?: { lat: number; lon: number } }[];
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

  // InDrive-aware financial calculation
  const isInDriveWithFeeData = data.platform === 'InDrive' && data.indriveNetIncome !== undefined;

  let cashCollected: number;
  let netPayout: number;
  let balanceDeduction = 0;

  if (isInDriveWithFeeData) {
    if (isCashTrip) {
      // InDrive + Cash: Driver pockets ALL the cash from the passenger.
      // InDrive deducts their service fee from the driver's pre-loaded InDrive Balance.
      cashCollected = amount;
      netPayout = 0; // No platform payout — driver already has the cash
      balanceDeduction = data.indriveServiceFee ?? 0; // Fee taken from InDrive Balance
    } else {
      // InDrive + Card: InDrive collects the full fare from the passenger,
      // deducts their service fee, and pays the driver the net amount.
      cashCollected = 0; // Driver collects no cash
      netPayout = data.indriveNetIncome!; // What InDrive sends to the driver
      balanceDeduction = 0; // No balance deduction — fee was retained before payout
    }
  } else {
    // Non-InDrive platforms (or legacy InDrive trips without fee data):
    // Generic logic — Cash trips: driver collects, Card trips: platform pays out
    cashCollected = isCashTrip ? amount : 0;
    netPayout = isCashTrip ? 0 : amount;
  }

  // Override financials for cancelled trips
  const isCancelled = data.tripStatus === 'Cancelled';
  if (isCancelled) {
    const cancelFee = data.cancellationFee || 0;
    // For cancelled trips, "amount" is the estimated fare (what trip would have earned)
    // The cancellation fee (if any) is what was actually collected
    if (data.paymentMethod === 'Cash') {
      cashCollected = cancelFee; // Driver may have collected a cash cancellation fee
      netPayout = 0;
    } else {
      cashCollected = 0;
      netPayout = cancelFee; // Platform pays out the cancellation fee
    }
    balanceDeduction = 0; // No InDrive balance deduction on cancelled trips
  }

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
    status: data.tripStatus || 'Completed',
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
    intermediateStops: data.intermediateStops,
    
    // Financials — InDrive-aware cash flow
    cashCollected,
    netPayout,
    
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
    geocodeError: data.geocodeError,

    // Service category (InDrive courier vs ride)
    ...(data.platform === 'InDrive' && data.serviceCategory && {
      serviceCategory: data.serviceCategory,
    }),

    // InDrive fee tracking (only populated for InDrive trips with fee data)
    ...(isInDriveWithFeeData && {
      indriveNetIncome: data.indriveNetIncome,
      indriveServiceFee: data.indriveServiceFee,
      indriveServiceFeePercent: data.indriveServiceFeePercent,
      indriveBalanceDeduction: balanceDeduction, // Calculated based on payment method
    }),
    
    // Cancellation details
    ...(data.tripStatus === 'Cancelled' && {
      cancelledBy: data.cancelledBy,
      cancellationReason: data.cancellationReason,
      cancellationFee: data.cancellationFee,
      estimatedLoss: amount > 0 ? amount - (data.cancellationFee || 0) : 0, // What was lost due to cancellation
    }),
  } as Trip;
}