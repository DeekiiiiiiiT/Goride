import { Trip, CsvMapping, ParsedRow, FieldDefinition, FieldType } from '../types/data';
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

export function mergeAndProcessData(files: FileData[], availableFields: FieldDefinition[]): Trip[] {
    const tripMap = new Map<string, Partial<Trip>>();
    const genericTrips: Trip[] = [];

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
            const tripId = cleanId(row['Trip UUID'] || row['trip uuid']);
            if (!tripId) return; // Skip rows without ID

            // Get existing or create new
            const current = tripMap.get(tripId) || { id: tripId, platform: 'Uber' };

            if (file.type === 'uber_trip') {
                // Map Operational Data
                const schema = UBER_SCHEMAS.TRIP_ACTIVITY.mapping;
                
                // Date
                if (row[schema.date]) {
                     try {
                         // Uber format often "14/12/2025 2:16" - parse carefully if needed
                         // but new Date() usually handles many formats. 
                         // Note: Uber CSVs sometimes use DD/MM/YYYY which JS might read as MM/DD/YYYY.
                         // For now relies on standard parsing.
                         current.date = new Date(String(row[schema.date])).toISOString();
                     } catch(e) {
                         current.date = new Date().toISOString();
                     }
                }
                
                if (row[schema.pickupLocation]) current.pickupLocation = String(row[schema.pickupLocation]);
                if (row[schema.dropoffLocation]) current.dropoffLocation = String(row[schema.dropoffLocation]);
                if (row[schema.driverId]) current.driverId = String(row[schema.driverId]);
                if (row[schema.vehicleId]) current.vehicleId = String(row[schema.vehicleId]);
                
                // Distance
                if (row[schema.distance]) {
                    current.distance = parseFloat(String(row[schema.distance]).replace(/[^0-9.]/g, '')) || 0;
                }
                
                // Status
                if (row[schema.status]) {
                    const s = String(row[schema.status]).toLowerCase();
                    if (s.includes('cancel')) current.status = 'Cancelled';
                    else if (s.includes('complet')) current.status = 'Completed';
                    else current.status = 'Processing';
                }
            } 
            else if (file.type === 'uber_payment') {
                // Map Financial Data
                const schema = UBER_SCHEMAS.PAYMENTS_ORDER.mapping;
                
                // Amount - Uber has many columns, usually "Paid to you" is net or "Paid to you : Your earnings"
                // The user's file has 'Paid to you' (col 10) and 'Paid to you : Your earnings' (col 11)
                // Let's prefer 'Paid to you' as it seems to be the total settlement amount for that transaction
                let amountVal = row['Paid to you'] || row['Paid to you : Your earnings'];
                if (amountVal) {
                    current.amount = parseFloat(String(amountVal).replace(/[^0-9.-]/g, '')) || 0;
                }

                // If date is missing (e.g. only had payment file), try to use transaction date?
                // Payment file usually has a timestamp column like "vs reporting" or similar.
                // In user file: "vs reporting" = "2025-12-08 13:45:54..."
                if (!current.date && row['vs reporting']) {
                     try {
                        current.date = new Date(String(row['vs reporting'])).toISOString();
                     } catch(e) {}
                }
                
                // Driver ID redundancy
                if (!current.driverId && row[schema.driverId]) current.driverId = String(row[schema.driverId]);
            }

            tripMap.set(tripId, current);
        });
    });

    // 2. Convert Map to Array and Finalize
    const mergedTrips = Array.from(tripMap.values()).map(t => {
        // Ensure defaults
        return {
            id: t.id || `trip-${Math.random()}`,
            date: t.date || new Date().toISOString(),
            amount: t.amount || 0,
            driverId: t.driverId || 'unknown',
            platform: t.platform || 'Other',
            status: t.status || 'Completed',
            ...t
        } as Trip;
    });

    return [...mergedTrips, ...genericTrips];
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
