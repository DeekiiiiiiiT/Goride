import { Trip, CsvMapping, ParsedRow, FieldDefinition, FieldType, DriverMetrics, VehicleMetrics, RentalContract } from '../types/data';
import Papa from 'papaparse';

// ... (Legacy code support if needed, but we focus on new logic)

export const REQUIRED_FIELDS = ['date', 'amount', 'driverId'];

export const DEFAULT_SYSTEM_FIELDS: FieldDefinition[] = [
  { key: 'date', label: 'Trip Date', type: 'date', isCustom: false, isRequired: true, isVisible: true },
  { key: 'amount', label: 'Fare Amount', type: 'number', isCustom: false, isRequired: true, isVisible: true },
  { key: 'driverId', label: 'Driver ID', type: 'text', isCustom: false, isRequired: true, isVisible: true },
  { key: 'platform', label: 'Platform', type: 'text', isCustom: false, isRequired: false, isVisible: true },
  { key: 'status', label: 'Status', type: 'text', isCustom: false, isRequired: false, isVisible: true },
  { key: 'distance', label: 'Distance', type: 'number', isCustom: false, isRequired: false, isVisible: true },
  { key: 'duration', label: 'Duration', type: 'number', isCustom: false, isRequired: false, isVisible: true },
  { key: 'pickupLocation', label: 'Pickup Location', type: 'address', isCustom: false, isRequired: false, isVisible: true },
  { key: 'dropoffLocation', label: 'Dropoff Location', type: 'address', isCustom: false, isRequired: false, isVisible: true },
  { key: 'driverName', label: 'Driver Name', type: 'text', isCustom: false, isRequired: false, isVisible: true },
  { key: 'vehicleId', label: 'Vehicle ID', type: 'text', isCustom: false, isRequired: false, isVisible: true },
  { key: 'notes', label: 'Notes', type: 'text', isCustom: false, isRequired: false, isVisible: true },
];

export const DEFAULT_FIELDS = DEFAULT_SYSTEM_FIELDS;

// --- PRE-DEFINED UBER SCHEMAS ---
export const UBER_SCHEMAS = {
  TRIP_ACTIVITY: {
    fingerprint: ['Trip UUID', 'Trip request time', 'Pickup address', 'Drop off address'],
    mapping: {
      date: 'Trip request time',
      driverId: 'Driver UUID',
      driverName: ['Driver first name', 'Driver last name'], // Composite
      pickupLocation: 'Pickup address',
      dropoffLocation: 'Drop off address',
      distance: 'Trip distance',
      status: 'Trip status',
      vehicleId: 'License plate',
      platform: 'Product Type', // e.g. UberX
      tripId: 'Trip UUID' // Critical for linking
    }
  },
  PAYMENTS_ORDER: {
    fingerprint: ['Trip UUID', 'Paid to you', 'Paid to you : Your earnings'],
    mapping: {
        amount: 'Paid to you', // or "Paid to you : Your earnings"
        driverId: 'Driver UUID',
        driverName: ['Driver first name', 'Driver last name'],
        tripId: 'Trip UUID',
        notes: 'Description'
    }
  }
};

export interface FileData {
  id: string;
  name: string;
  rows: ParsedRow[];
  headers: string[];
  type: 'uber_trip' | 'uber_payment' | 'generic';
}

export function detectFileType(headers: string[]): FileData['type'] {
    const has = (keyword: string) => headers.some(h => h.includes(keyword));
    
    // Check Trip Activity
    if (has('Trip UUID') && has('Trip request time') && has('Pickup address')) return 'uber_trip';
    
    // Check Payment
    if (has('Trip UUID') && (has('Paid to you') || has('Fare'))) return 'uber_payment';
    
    return 'generic';
}

// Helper to normalize keys for merging (e.g., lower case UUIDs)
const cleanId = (id: any) => String(id || '').trim();

export interface ProcessedBatch {
    trips: Trip[];
    driverMetrics: DriverMetrics[];
    vehicleMetrics: VehicleMetrics[];
    rentalContracts: RentalContract[];
}

export function mergeAndProcessData(files: FileData[], availableFields: FieldDefinition[]): ProcessedBatch {
    const tripMap = new Map<string, Partial<Trip>>();
    const genericTrips: Trip[] = [];
    const driverMetrics: DriverMetrics[] = [];
    const vehicleMetrics: VehicleMetrics[] = [];
    const rentalContracts: RentalContract[] = [];

    // 1. Process all files
    files.forEach(file => {
        if (file.type === 'generic') {
            // Process generic files immediately as standalone trips
            const mapping = detectMapping(file.headers, availableFields);
            const processed = processData(file.rows, mapping, availableFields);
            processed.forEach(t => genericTrips.push(t));
            return;
        }

        // Process Uber Files
        file.rows.forEach(row => {
             // ... existing trip logic ...
             if (file.type === 'uber_trip' || file.type === 'uber_payment') {
                const tripId = cleanId(row['Trip UUID'] || row['trip uuid']);
                if (!tripId) return; 

                const current = tripMap.get(tripId) || { id: tripId, platform: 'Uber' };
                
                if (file.type === 'uber_trip') {
                    const schema = UBER_SCHEMAS.TRIP_ACTIVITY.mapping;
                    if (row[schema.date]) {
                         try { current.date = new Date(String(row[schema.date])).toISOString(); } catch(e) { current.date = new Date().toISOString(); }
                    }
                    if (row[schema.pickupLocation]) current.pickupLocation = String(row[schema.pickupLocation]);
                    if (row[schema.dropoffLocation]) current.dropoffLocation = String(row[schema.dropoffLocation]);
                    if (row[schema.driverId]) current.driverId = String(row[schema.driverId]);
                    if (row[schema.vehicleId]) current.vehicleId = String(row[schema.vehicleId]);
                    if (row[schema.distance]) current.distance = parseFloat(String(row[schema.distance]).replace(/[^0-9.]/g, '')) || 0;
                    if (row[schema.status]) {
                        const s = String(row[schema.status]).toLowerCase();
                        if (s.includes('cancel')) current.status = 'Cancelled';
                        else if (s.includes('complet')) current.status = 'Completed';
                        else current.status = 'Processing';
                    }
                } else if (file.type === 'uber_payment') {
                    const schema = UBER_SCHEMAS.PAYMENTS_ORDER.mapping;
                    
                    // 1. Earnings ("Paid to you")
                    let amountVal = row['Paid to you'] || row['Paid to you : Your earnings'];
                    if (amountVal) current.amount = parseFloat(String(amountVal).replace(/[^0-9.-]/g, '')) || 0;
                    
                    // 2. Cash Collected (Crucial for Phase 3 Reconciliation)
                    // Checks strictly for 'Cash Collected' column common in Uber Fleet reports
                    let cashVal = row['Cash Collected'] || row['Cash collected'];
                    if (cashVal) {
                        current.cashCollected = parseFloat(String(cashVal).replace(/[^0-9.-]/g, '')) || 0;
                    } else {
                        // Ensure it's initialized if not present to avoid undefined math later
                        if (current.cashCollected === undefined) current.cashCollected = 0;
                    }

                    if (!current.date && row['vs reporting']) {
                         try { current.date = new Date(String(row['vs reporting'])).toISOString(); } catch(e) {}
                    }
                    if (!current.driverId && row[schema.driverId]) current.driverId = String(row[schema.driverId]);
                }
                tripMap.set(tripId, current);
             }
             
             // --- NEW: Parse Side-Channel Data ---
             
             else if (file.type === 'uber_driver_quality') {
                 // Simple extraction, in reality needs better date handling from filename or metadata
                 driverMetrics.push({
                     id: `dm-${Math.random()}`,
                     driverId: String(row['Driver UUID'] || ''),
                     driverName: `${row['Driver First Name']} ${row['Driver Surname']}`,
                     periodStart: new Date().toISOString(), // Placeholder
                     periodEnd: new Date().toISOString(),   // Placeholder
                     acceptanceRate: parseFloat(String(row['Acceptance Rate']).replace('%','')) / 100 || 0,
                     cancellationRate: parseFloat(String(row['Cancellation Rate']).replace('%','')) / 100 || 0,
                     completionRate: parseFloat(String(row['Completion Rate']).replace('%','')) / 100 || 0,
                     ratingLast500: parseFloat(String(row['Driver Ratings (Previous 500 Trips)'])) || 0,
                     ratingLast4Weeks: parseFloat(String(row['Driver Ratings (Last 4 Weeks)'])) || 0,
                     onlineHours: 0,
                     onTripHours: 0,
                     tripsCompleted: parseInt(String(row['Trips Completed'])) || 0
                 });
             }
             
             else if (file.type === 'uber_rental_contract') {
                 // Basic extraction for Phase 6 awareness
                 rentalContracts.push({
                     termId: String(row['TermUUID'] || `term-${Math.random()}`),
                     driverId: String(row['DriverUUID'] || ''),
                     organizationId: String(row['OrganizationUUID'] || ''),
                     startDate: new Date().toISOString(), // Placeholder
                     endDate: new Date().toISOString(), // Placeholder
                     status: 'Active',
                     balanceStart: parseFloat(String(row['Balance at the beginning of the period']).replace(/[^0-9.-]/g, '')) || 0,
                     totalCharges: parseFloat(String(row['Amount to charge']).replace(/[^0-9.-]/g, '')) || 0,
                     totalPaid: parseFloat(String(row['Amount Charged/ Paid']).replace(/[^0-9.-]/g, '')) || 0,
                     balanceEnd: parseFloat(String(row['Balance at the end of the period']).replace(/[^0-9.-]/g, '')) || 0
                 });
             }
        });
    });

    // 2. Convert Map to Array and Finalize
    const mergedTrips = Array.from(tripMap.values()).map(t => {
        const amount = t.amount || 0;
        const cashCollected = t.cashCollected || 0;
        
        return {
            id: t.id || `trip-${Math.random()}`,
            date: t.date || new Date().toISOString(),
            amount: amount,
            cashCollected: cashCollected,
            netPayout: amount - cashCollected, // Phase 3: Auto-calculate reconciliation
            driverId: t.driverId || 'unknown',
            platform: t.platform || 'Other',
            status: t.status || 'Completed',
            ...t
        } as Trip;
    });

    return {
        trips: [...mergedTrips, ...genericTrips],
        driverMetrics,
        vehicleMetrics,
        rentalContracts
    };
}


// --- EXISTING FUNCTIONS (Kept for generic single-file logic compatibility) ---

export function detectMapping(headers: string[], availableFields: FieldDefinition[]): CsvMapping {
  const mapping: Partial<CsvMapping> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase());
  
  const findBestMatch = (keywords: string[]): string => {
    for (const keyword of keywords) {
      const matchIndex = lowerHeaders.findIndex(h => h.includes(keyword));
      if (matchIndex !== -1) {
        return headers[matchIndex];
      }
    }
    return '';
  };

  availableFields.forEach(field => {
    const keywords = [field.label.toLowerCase(), field.key.toLowerCase()];
    if (field.key === 'date') keywords.push('request time', 'pickup time', 'timestamp', 'created', 'time');
    if (field.key === 'amount') keywords.push('fare', 'price', 'cost', 'earnings', 'pay', 'total');
    if (field.key === 'driverId') keywords.push('driver uuid', 'driver_id', 'driverid', 'email');
    if (field.key === 'platform') keywords.push('source', 'provider', 'app');
    if (field.key === 'distance') keywords.push('miles', 'km', 'length');
    if (field.key === 'pickupLocation') keywords.push('pickup address', 'origin', 'start location');
    if (field.key === 'dropoffLocation') keywords.push('dropoff address', 'destination', 'end location');
    if (field.key === 'vehicleId') keywords.push('plate', 'license plate', 'vehicle');

    const match = findBestMatch(keywords);
    if (match) {
        mapping[field.key] = match;
    }
  });

  return mapping as CsvMapping;
}

export function processData(rows: ParsedRow[], mapping: CsvMapping, availableFields: FieldDefinition[]): Trip[] {
  return rows.map((row, index) => {
    const id = `trip-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`;
    const trip: any = { id };

    availableFields.forEach(field => {
        const mappedHeader = mapping[field.key];
        let val = mappedHeader ? row[mappedHeader] : undefined;

        if (val === undefined || val === null || val === '') {
             if (field.required) {
                 if (field.type === 'number') trip[field.key] = 0;
                 else if (field.type === 'date') trip[field.key] = new Date().toISOString();
                 else trip[field.key] = 'unknown';
             } else {
                 if (field.type === 'number') trip[field.key] = 0;
                 else trip[field.key] = undefined;
             }
             return;
        }

        if (field.type === 'number') {
            if (typeof val === 'string') {
                val = parseFloat(val.replace(/[^0-9.-]+/g,""));
            }
            trip[field.key] = isNaN(val as number) ? 0 : val;
        } else if (field.type === 'date') {
            try {
                const d = new Date(String(val));
                if (!isNaN(d.getTime())) {
                    trip[field.key] = d.toISOString();
                } else {
                    trip[field.key] = new Date().toISOString(); 
                }
            } catch (e) {
                trip[field.key] = new Date().toISOString();
            }
        } else {
            trip[field.key] = String(val);
        }
    });

    // Enforce basic Uber detection for single files too
    if (trip.platform) {
        const p = String(trip.platform).toLowerCase();
        if (p.includes('uber')) trip.platform = 'Uber';
        else if (p.includes('lyft')) trip.platform = 'Lyft';
    } else {
        trip.platform = 'Other';
    }

    return trip as Trip;
  });
}

export const exportToCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
