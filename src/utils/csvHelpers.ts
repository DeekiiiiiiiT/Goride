import { Trip, CsvMapping, ParsedRow, FieldDefinition, FieldType, DriverMetrics, VehicleMetrics, RentalContract, OrganizationMetrics } from '../types/data';
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

// Fleet Organization UUID (Source of Truth)
// This UUID represents the Fleet Entity and must NEVER be treated as a Driver.
export const FLEET_ORG_UUID = '73dfc14d-3798-4a00-8d86-b2a3eb632f54';

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
  type: 'uber_trip' | 'uber_payment' | 'uber_payment_driver' | 'uber_payment_org' | 'uber_driver_quality' | 'uber_vehicle_performance' | 'uber_driver_activity' | 'uber_rental_contract' | 'generic';
  validationErrors?: string[];
  reportDate?: string; // ISO String
  customMapping?: Record<string, string>;
}

// --- PHASE 1: VALIDATION RULES (Step 1.3) ---
const VALIDATION_RULES = {
    'uber_trip': { 
        required: ['Trip UUID', 'Trip request time'], 
        label: 'Trip Details' 
    },
    'uber_payment': { 
        required: ['Trip UUID', 'Paid to you'], 
        label: 'Transaction Details' 
    },
    'uber_payment_driver': { 
        required: ['Total Earnings'], 
        anyOne: ['Driver UUID', 'Driver ID', 'Driver Name'],
        label: 'Driver Payments' 
    },
    'uber_payment_org': { 
        required: [], 
        anyOne: ['NetFare', 'Net Fare', 'Balance Start', 'Start Of Period Balance'],
        label: 'Fleet Payments' 
    },
    'uber_driver_quality': { 
        required: ['Acceptance Rate', 'Cancellation Rate'], 
        label: 'Driver Performance' 
    },
    'uber_vehicle_performance': { 
        required: [['Earnings Per Hour', 'Earnings / Hour', 'Earnings/Hour', 'Earnings/Hr', 'Total Earnings', 'Gross Fares', 'Gross Earnings']], 
        anyOne: ['Vehicle UUID', 'License Plate', 'Vehicle Plate Number'],
        label: 'Vehicle Stats' 
    },
    'uber_driver_activity': { 
        required: [['Online Hours', 'Hours Online', 'Online', 'Time Online', 'Hours']], 
        anyOne: ['On Trip Hours', 'OnTrip Hours', 'Driver UUID', 'Driver Name'],
        label: 'Driver Hours' 
    },
    'uber_rental_contract': {
        required: ['TermUUID'],
        label: 'Rental Contracts'
    }
};

export function validateFile(file: FileData): string[] {
    if (file.type === 'generic') return [];
    
    const errors: string[] = [];
    if (!file.rows || file.rows.length === 0) {
        errors.push("File is empty");
        return errors;
    }

    const rules = VALIDATION_RULES[file.type];
    if (!rules) return [];

    // Check strict required (Supports OR logic via nested arrays)
    rules.required.forEach(req => {
        const candidates = Array.isArray(req) ? req : [req];
        const found = candidates.some(c => file.headers.some(h => h.toLowerCase().includes(c.toLowerCase())));
        
        if (!found) {
            errors.push(`Missing required column: "${candidates.join('" or "')}"`);
        }
    });

    // Check "Any One" groups
    if (rules.anyOne) {
        const foundAny = rules.anyOne.some(opt => file.headers.some(h => h.toLowerCase().includes(opt.toLowerCase())));
        if (!foundAny) {
            errors.push(`Missing identification column (Needs one of: ${rules.anyOne.join(', ')})`);
        }
    }

    return errors;
}

// Helper for safe date parsing
const safeDateISO = (input: any): string | undefined => {
    if (!input) return undefined;
    const d = new Date(input);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
};

// --- PHASE 1: DATE PROCESSING (Step 1.4) ---
export function extractReportDate(file: FileData): string | undefined {
    // 1. Try Filename (e.g. "report-2023-10-01.csv")
    const filenameDateMatch = file.name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (filenameDateMatch) {
        const d = safeDateISO(`${filenameDateMatch[1]}-${filenameDateMatch[2]}-${filenameDateMatch[3]}`);
        if (d) return d;
    }

    // 2. Try Headers (e.g. "Start Date: 2023-10-01" often in meta lines before header, but here we only have headers/rows)
    // In many CSVs, the date is in the first row data
    if (file.rows.length > 0) {
        const firstRow = file.rows[0];
        // Common date fields
        const dateKeys = ['Date', 'Period Start', 'Start Date', 'Trip request time', 'Time'];
        for (const key of dateKeys) {
            const val = Object.values(firstRow).find((v: any) => String(v).includes(key));
             // This is tricky without knowing exact column name. 
             // Better strategy: Look for specific columns we know contain dates
        }
        
        // Specific strategies per file type
        if (file.type === 'uber_trip' && firstRow['Trip request time']) {
            const d = safeDateISO(firstRow['Trip request time']);
            if (d) return d;
        }
        if (file.type === 'uber_payment_org' && firstRow['Period Start']) {
            const d = safeDateISO(firstRow['Period Start']);
            if (d) return d;
        }
    }

    return undefined; // Default to "Upload Date" later if undefined
}

export function detectFileType(headers: string[], fileName: string = ''): FileData['type'] {
    const has = (keyword: string) => headers.some(h => h.toLowerCase().includes(keyword.toLowerCase()));
    const name = fileName.toLowerCase();
    
    // 1. Trip Activity (The main ledger)
    if (has('Trip UUID') && has('Trip request time') && has('Pickup address')) return 'uber_trip';
    if (name.includes('trip_activity') || name.includes('trip activity')) return 'uber_trip';
    
    // 2. Payment Orders (Financials - Transaction Level)
    if (
        (has('Trip UUID') && (has('Paid to you') || has('Fare') || has('Earnings') || has('Payouts'))) ||
        (has('transaction UUID') && has('Trip UUID')) ||
        name.includes('payments_transaction') || name.includes('payment_order')
    ) return 'uber_payment';

    // 3. Organization Payments (Financials - Fleet Level) - Check this BEFORE Driver Payments
    if (
        has('Organization UUID') || has('OrganizationUUID') ||
        has('NetFare') || has('Net Fare') || 
        (has('Start Of Period Balance') && has('End Of Period Balance')) ||
        (has('Balance Start') && has('Balance End')) ||
        name.includes('payment_organisation') || name.includes('payment_organization')
    ) return 'uber_payment_org';

    // 4. Driver Payments (Financials - Driver Level)
    if (
        ((has('Driver UUID') || has('Driver ID') || has('Driver Name')) && 
        (has('Total Earnings') || has('Refunds and Expenses') || has('Refunds')) && 
        !has('Trip UUID')) ||
        name.includes('payments_driver')
    ) return 'uber_payment_driver';

    // 5. Driver Quality (Scores)
    if ((has('Acceptance Rate') && has('Cancellation Rate')) || name.includes('driver_quality')) return 'uber_driver_quality';

    // 6. Vehicle Performance (Health)
    if (
        ((has('Vehicle UUID') || has('License Plate') || has('Vehicle Plate Number')) && 
        (has('Earnings Per Hour') || has('Total Earnings'))) ||
        name.includes('vehicle_performance')
    ) return 'uber_vehicle_performance';

    // 7. Driver Activity (Hours)
    if (
        (has('Online Hours') && 
        (has('On Trip Hours') || has('OnTrip Hours') || has('Driver UUID') || has('Driver Name'))) ||
        name.includes('driver_activity')
    ) return 'uber_driver_activity';

    // 8. Rental Contracts
    if (has('TermUUID') || (has('OrganizationUUID') && has('Balance'))) return 'uber_rental_contract';
    
    return 'generic';
}

// Helper to normalize keys for merging (e.g., lower case UUIDs)
const cleanId = (id: any) => String(id || '').trim();

export interface ProcessedBatch {
    trips: Trip[];
    driverMetrics: DriverMetrics[];
    vehicleMetrics: VehicleMetrics[];
    rentalContracts: RentalContract[];
    organizationMetrics: OrganizationMetrics[];
    organizationName?: string; // Phase 1: Fleet Owner
    tripAnalytics?: TripAnalytics; // Phase 4
}

// Helper to extract and clean driver name
const extractDriverName = (row: ParsedRow, schema: any = {}): string => {
    let name = '';
    
    // 1. Try schema specific fields first
    if (schema.driverName) {
        const names = Array.isArray(schema.driverName) ? schema.driverName : [schema.driverName];
        name = names.map(n => row[n]).filter(Boolean).join(' ').trim();
    }
    
    // 2. Fallback to common columns
    if (!name) {
        const firstName = row['Driver First Name'] || row['First Name'] || row['Driver first name'];
        const lastName = row['Driver Surname'] || row['Driver Last Name'] || row['Last Name'] || row['Driver last name'];
        const fullName = row['Driver Name'] || row['Name'] || row['Driver'];

        if (firstName || lastName) {
            name = `${firstName || ''} ${lastName || ''}`.trim();
        } else if (fullName) {
            name = String(fullName).trim();
        }
    }
    
    // 3. Clean and Normalize
    if (name) {
        // Fix known issue: "CAS" suffix on names (e.g. RATTRAYCAS -> RATTRAY)
        // Only apply if name is uppercase (typical of raw Uber exports) to avoid false positives
        if (name === name.toUpperCase() && name.endsWith('CAS') && name.length > 5) {
             name = name.substring(0, name.length - 3).trim();
        }
        return name;
    }
    
    return 'Unknown Driver';
};

export function mergeAndProcessData(files: FileData[], availableFields: FieldDefinition[], knownFleetName?: string): ProcessedBatch {
    const tripMap = new Map<string, Partial<Trip>>();
    const genericTrips: Trip[] = [];
    const driverMetricsMap = new Map<string, DriverMetrics>();
    const vehicleMetrics: VehicleMetrics[] = [];
    const rentalContracts: RentalContract[] = [];
    const organizationMetrics: OrganizationMetrics[] = [];
    let organizationName = knownFleetName || ''; // Phase 1: Track Fleet Owner Name

    // 1. Process all files
    files.forEach(file => {
        if (file.type === 'generic') {
            // Process generic files immediately as standalone trips
            // Priority: 1. AI Custom Mapping, 2. Auto-Detect
            const mapping = file.customMapping ? (file.customMapping as unknown as CsvMapping) : detectMapping(file.headers, availableFields);
            const processed = processData(file.rows, mapping, availableFields);
            processed.forEach(t => {
                if (t.driverId === 'fleet-org-ignore') return; // Filter out Fleet Org trips
                genericTrips.push(t);
            });
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
                    
                    // Phase 4: Global Exclusion - Check Trip Data
                    if (row[schema.driverId]) {
                        const rawId = String(row[schema.driverId]).trim();
                        if (rawId.toLowerCase() !== FLEET_ORG_UUID) {
                             current.driverId = rawId;
                        }
                    }
                    
                    // Extract Driver Name
                    const name = extractDriverName(row, schema);
                    if (name && name !== 'Unknown Driver') current.driverName = name;

                    if (row[schema.vehicleId]) current.vehicleId = String(row[schema.vehicleId]);
                    if (row[schema.distance]) current.distance = parseFloat(String(row[schema.distance]).replace(/[^0-9.]/g, '')) || 0;
                    if (row[schema.status]) {
                        const s = String(row[schema.status]).toLowerCase();
                        if (s.includes('cancel')) current.status = 'Cancelled';
                        else if (s.includes('complet')) current.status = 'Completed';
                        else current.status = 'Processing';
                    }

                    // Extract Service Type
                    if (row['Product Type']) current.serviceType = String(row['Product Type']);
                    else current.serviceType = 'UberX'; 

                    // Robust Time Extraction (Dynamic Column Search)
                    // 1. Request Time
                    let reqVal = row['Trip request time'] || row['Request Time'] || row['Request time'];
                    if (!reqVal) {
                        const key = Object.keys(row).find(k => k.toLowerCase().includes('request') && k.toLowerCase().includes('time'));
                        if (key) reqVal = row[key];
                    }
                    if (reqVal) {
                        try { current.requestTime = new Date(String(reqVal)).toISOString(); } catch(e) {}
                    }

                    // 2. Dropoff Time
                    let dropVal = row['Drop off time'] || row['Drop-off time'] || row['Dropoff Time'];
                    if (!dropVal) {
                        const key = Object.keys(row).find(k => {
                            const l = k.toLowerCase();
                            return l.includes('drop') && l.includes('time') && !l.includes('wait');
                        });
                        if (key) dropVal = row[key];
                    }
                    if (dropVal) {
                        try { current.dropoffTime = new Date(String(dropVal)).toISOString(); } catch(e) {}
                    }

                    // Phase 4: Per-Trip Analytics Logic
                    // 1. Duration Calculation
                    let durationMinutes = 0;
                    
                    // Priority 1: Calculate from timestamps (Most accurate)
                    if (current.requestTime && current.dropoffTime) {
                         const start = new Date(current.requestTime).getTime();
                         const end = new Date(current.dropoffTime).getTime();
                         const diff = (end - start) / 60000;
                         // Sanity check: positive duration (0 to 24 hours)
                         if (diff >= 0 && diff < 1440) { 
                             durationMinutes = diff;
                         }
                    }

                    // Fallback to 'Trip duration' column if calculation failed or unavailable
                    if (durationMinutes === 0) {
                        // Extended search for duration columns
                        let rawDur = String(row['Trip duration'] || row['Duration (min)'] || row['Duration'] || row['Trip Duration'] || '');
                        
                        // If empty, try searching for any column with "duration"
                        if (!rawDur) {
                             const key = Object.keys(row).find(k => k.toLowerCase().includes('duration'));
                             if (key) rawDur = String(row[key]);
                        }

                        if (rawDur) {
                            if (rawDur.includes(':')) {
                                const parts = rawDur.split(':').map(Number);
                                if (parts.length === 3) durationMinutes = parts[0]*60 + parts[1] + parts[2]/60; // HH:MM:SS
                                else if (parts.length === 2) durationMinutes = parts[0] + parts[1]/60; // MM:SS (unlikely for trips but possible)
                            } else {
                                let val = parseFloat(rawDur);
                                // Heuristic: If value is > 1000, assume seconds (e.g. 1200 sec = 20 min). 
                                // Uber usually uses minutes or HH:MM:SS. But raw seconds is possible.
                                // If column header says "sec", treat as seconds.
                                const isSeconds = Object.keys(row).some(k => k.toLowerCase().includes('duration') && (k.toLowerCase().includes('sec') || k.toLowerCase().includes('(s)')));
                                
                                if (isSeconds || val > 1000) {
                                    val = val / 60;
                                }
                                durationMinutes = val || 0;
                            }
                        }
                    }
                    
                    current.duration = durationMinutes > 0 ? durationMinutes : 0;
                    
                    // Time of Day
                    if (current.requestTime) {
                        current.timeOfDay = new Date(current.requestTime).getHours();
                    } else {
                        current.timeOfDay = new Date(current.date || Date.now()).getHours();
                    }

                    // 2. Speed (km/h or mph depending on distance unit, usually miles or km. We just handle raw units)
                    if (current.distance && current.duration) {
                        current.speed = current.distance / (current.duration / 60); 
                    }

                    // 3. Area Extraction (Simple heuristic: "Street, City, Country")
                    const extractArea = (addr?: string) => {
                        if (!addr) return 'Unknown';
                        const parts = addr.split(',');
                        if (parts.length >= 2) return parts[parts.length - 2].trim(); // Take City/Area
                        return parts[0].trim();
                    };
                    current.pickupArea = extractArea(current.pickupLocation);
                    current.dropoffArea = extractArea(current.dropoffLocation);
                    
                    // Phase 1 (Enhanced Metrics):
                    // Route ID
                    if (current.pickupArea && current.dropoffArea) {
                        current.routeId = `${current.pickupArea}_${current.dropoffArea}`.replace(/\s+/g, '-').toLowerCase();
                    }
                    
                    // Day of Week
                    if (current.date) {
                        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        current.dayOfWeek = days[new Date(current.date).getDay()];
                    }

                    // Earnings Efficiency
                    if (current.amount && current.distance && current.distance > 0) {
                        current.earningsPerKm = current.amount / current.distance;
                    }
                    
                    if (current.amount && current.duration && current.duration > 0) {
                        current.earningsPerMin = current.amount / current.duration;
                    }
                    
                    // Efficiency Score (0-100)
                    // Simple model: Base 50 + (Earn/km * 10) + (Earn/min * 20) - Penalty for deadhead (not tracked yet)
                    // Cap at 100
                    if (current.earningsPerKm && current.earningsPerMin) {
                        let score = 50 + (current.earningsPerKm * 5) + (current.earningsPerMin * 10);
                        current.efficiencyScore = Math.min(100, Math.max(0, Math.round(score)));
                    } else {
                        current.efficiencyScore = 50; // Neutral default
                    }

                } else if (file.type === 'uber_payment') {
                    const schema = UBER_SCHEMAS.PAYMENTS_ORDER.mapping;
                    
                    // Helper for currency parsing
                    const parseCurrency = (val: any) => parseFloat(String(val || '0').replace(/[^0-9.-]/g, '')) || 0;

                    // 1. Earnings ("Paid to you" or "Fare")
                    // Phase 2 Step 2.1: Extract Earnings, Payouts, Cash Collected
                    // FIX (Option 2 Refinement): Prioritize "Your earnings" (Gross) over "Paid to you" (Net)
                    // "Paid to you" in Uber reports is often the Net Payout (Earnings - Cash - Fees).
                    // "Paid to you : Your earnings" is the Gross Earnings before Cash deductions.
                    let earningsVal = row['Paid to you : Your earnings'] || row['Paid to you:Your earnings'] || row['Paid to you'] || row['Fare'];
                    let netPayoutVal = row['Paid to you'];
                    let payoutsVal = row['Payouts'] || row['Your Earnings'] || '0';
                    let cashVal = row['Paid to you : Trip balance : Payouts : Cash Collected'] || row['Paid to you:Trip balance:Payouts:Cash Collected'] || row['Cash Collected'] || row['Cash collected'] || '0';
                    
                    let earnings = parseCurrency(earningsVal);
                    const netPayoutRaw = parseCurrency(netPayoutVal);
                    const cash = Math.abs(parseCurrency(cashVal)); // Cash is often negative in payout columns, we want the absolute magnitude

                    // FIX for Zero-Earnings Rows (Adjustments/Tips)
                    // If "Your earnings" is 0, but "Paid to you" has value:
                    // 1. If it's a TIP -> It IS new Gross Revenue. Add it.
                    // 2. If it's a FARE ADJUSTMENT (like the $418.44 case) -> It is likely a Net Payout correction, NOT new Gross Revenue.
                    //    We should NOT add it to 'amount' (Gross), but we SHOULD add it to 'netTransaction' (Payout).
                    
                    let addToGross = 0;
                    let addToNet = 0;

                    if (earnings !== 0) {
                        // Normal case: We have explicit earnings
                        addToGross = earnings;
                        
                        if (row['Paid to you']) {
                             addToNet = netPayoutRaw;
                        } else {
                             addToNet = earnings - cash;
                        }
                    } else if (netPayoutRaw !== 0) {
                         // Edge case: Earnings is 0, but Payout exists (Adjustment/Tip)
                         const desc = String(row['Description'] || '').toLowerCase();
                         
                         if (desc.includes('tip')) {
                             // Tips are new revenue
                             addToGross = netPayoutRaw;
                             addToNet = netPayoutRaw;
                         } else {
                             // Adjustments (e.g. "trip fare adjust order") are usually Payout corrections, not new Revenue volume.
                             // Do NOT add to Gross. Only Net.
                             addToGross = 0; 
                             addToNet = netPayoutRaw;
                         }
                    }

                    // Step 2.1 Calculations - ACCUMULATE
                    current.amount = (current.amount || 0) + addToGross; // Gross Accumulation
                    current.grossEarnings = (current.grossEarnings || 0) + addToGross;
                    
                    current.cashCollected = (current.cashCollected || 0) + cash;
                    current.netTransaction = (current.netTransaction || 0) + addToNet;
                    
                    current.payouts = current.netTransaction;
                    const totalEarnings = current.amount || 0;
                    const totalCash = current.cashCollected || 0;
                    current.cashPercentage = totalEarnings !== 0 ? (totalCash / totalEarnings) * 100 : 0;

                    // Detailed Financial Breakdown (New Requirement) - Accumulate
                    const existingBreakdown = current.fareBreakdown || { baseFare: 0, tips: 0, waitTime: 0, surge: 0, airportFees: 0, timeAtStop: 0, taxes: 0 };
                    
                    current.fareBreakdown = {
                        baseFare: existingBreakdown.baseFare + parseCurrency(row['Paid to you:Your earnings:Fare:Fare']),
                        tips: existingBreakdown.tips + parseCurrency(row['Paid to you:Your earnings:Tip']),
                        waitTime: existingBreakdown.waitTime + parseCurrency(row['Paid to you:Your earnings:Fare:Wait Time at Pickup']),
                        surge: existingBreakdown.surge + parseCurrency(row['Paid to you:Your earnings:Fare:Surge']),
                        airportFees: existingBreakdown.airportFees + parseCurrency(row['Paid to you:Your earnings:Fare:Airport Surcharge']),
                        timeAtStop: existingBreakdown.timeAtStop + parseCurrency(row['Paid to you:Your earnings:Fare:Time at Stop']),
                        taxes: existingBreakdown.taxes + parseCurrency(row['Paid to you : Your earnings : Taxes'] || row['Paid to you:Your earnings:Taxes'])
                    };
                    
                    current.tollCharges = (current.tollCharges || 0) + parseCurrency(row['Paid to you:Trip balance:Refunds:Toll']);
                    
                    // Net to Driver: "Your earnings" minus any adjustments
                    // We check both short and long forms for "Your earnings"
                    let netBase = parseCurrency(row['Your Earnings'] || row['Your earnings'] || row['Paid to you:Your earnings'] || row['Paid to you : Your earnings']);
                    
                    // If specific "Your earnings" column is missing/zero, fallback to Gross Earnings
                    if (netBase === 0 && earnings !== 0) {
                        netBase = earnings;
                    }
                    
                    // Note: Adjustments are often negative in one column and positive in another, strictly parsing row by row
                    const adjustments = parseCurrency(row['Paid to you:Your earnings:Fare:Fare Adjustment'] || row['Fare Adjustment'] || row['Adjustment']);
                    current.netToDriver = (current.netToDriver || 0) + (netBase - adjustments);
                    
                    // Determine Transaction Type (Append if multiple)
                    const desc = String(row['Description'] || '').toLowerCase();
                    let type = 'Completed Trip';
                    if (desc.includes('adjustment')) type = 'Fare Adjustment';
                    else if (desc.includes('tip')) type = 'Tip';
                    else if (desc.includes('settle')) type = 'Settlement';
                    
                    if (current.transactionType && current.transactionType !== type) {
                        current.transactionType = `${current.transactionType}, ${type}`;
                    } else {
                        current.transactionType = type;
                    }

                    if (!current.date && row['vs reporting']) {
                         try { current.date = new Date(String(row['vs reporting'])).toISOString(); } catch(e) {}
                    }
                    if (!current.driverId && row[schema.driverId]) current.driverId = String(row[schema.driverId]);
                    
                    const name = extractDriverName(row, schema);
                    if (name && name !== 'Unknown Driver' && !current.driverName) current.driverName = name;
                }
                tripMap.set(tripId, current);
             }
             
             // --- NEW: Parse Side-Channel Data ---
             
             else if (file.type === 'uber_payment_driver') {
                 // Driver Level Payments Parsing
                 const dId = String(row['Driver UUID'] || '').trim().toLowerCase();

                 // Phase 4: Global Exclusion - STRICTLY IGNORE FLEET ORG UUID
                 if (dId === FLEET_ORG_UUID) return;

                 if (dId) {
                     const driverId = dId;
                     
                     // Get existing or init
                     const current = driverMetricsMap.get(driverId) || {
                         id: `dm-pay-${driverId}-${Math.random()}`,
                         driverId: driverId,
                         driverName: 'Unknown Driver',
                         periodStart: new Date().toISOString(),
                         periodEnd: new Date().toISOString(),
                         totalEarnings: 0, refundsAndExpenses: 0, cashCollected: 0,
                         netEarnings: 0, cashFlowRisk: 'OK', expenseRatio: 0,
                         acceptanceRate: 0, cancellationRate: 0, completionRate: 0,
                         ratingLast500: 0, ratingLast4Weeks: 0,
                         score: 0, tier: 'Bronze', recommendation: '',
                         onlineHours: 0, onTripHours: 0, tripsCompleted: 0,
                         dataSources: [] // Phase 2: Source Tracking
                     };
                     
                     // Mark Source
                     if (!current.dataSources) current.dataSources = [];
                     if (!current.dataSources.includes('payment')) current.dataSources.push('payment');

                     const driverName = extractDriverName(row);
                     if (driverName && driverName !== 'Unknown Driver') current.driverName = driverName;

                     const totalEarnings = parseFloat(String(row['Total Earnings'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const refundsAndExpenses = parseFloat(String(row['Refunds and Expenses'] || row['Refunds'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const cashCollected = parseFloat(String(row['Cash Collected'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     
                     current.totalEarnings = totalEarnings;
                     current.refundsAndExpenses = refundsAndExpenses;
                     current.cashCollected = cashCollected;
                     
                     // Calculations Step 2.2
                     current.netEarnings = totalEarnings - refundsAndExpenses;
                     current.cashFlowRisk = (totalEarnings > 0 && (cashCollected / totalEarnings) > 0.3) ? 'HIGH' : 'OK';
                     current.expenseRatio = totalEarnings !== 0 ? (refundsAndExpenses / totalEarnings) * 100 : 0;

                     driverMetricsMap.set(driverId, current);
                 }
             }

             else if (file.type === 'uber_payment_org') {
                 // Phase 3: Strict Organization Parsing
                 // Verified Isolation - This block strictly updates OrganizationMetrics and does NOT touch DriverMetrics.
                 
                 // 1. Organization Name Extraction
                 const extractedOrgName = String(row['Organization Name'] || row['Organization'] || row['Account Name'] || row['Organization Description'] || '').trim();
                 if (extractedOrgName && !organizationName) organizationName = extractedOrgName;

                 // 2. Financial Metrics
                 const balanceStart = parseFloat(String(row['Start Of Period Balance'] || row['Balance Start'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const balanceEnd = parseFloat(String(row['End Of Period Balance'] || row['Balance End'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const totalEarnings = parseFloat(String(row['Total Earnings'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const netFare = parseFloat(String(row['NetFare'] || row['Net Fare'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const cashCollected = parseFloat(String(row['Cash Collected'] || '0').replace(/[^0-9.-]/g, '')) || 0;

                 // 3. Date Extraction
                 let pStart = row['Period Start'] || row['Start Date'] || row['Date'];
                 let pEnd = row['Period End'] || row['End Date'] || row['Date'];
                 
                 // Try to infer from filename if missing in row
                 if (!pStart && file.reportDate) pStart = file.reportDate;

                 organizationMetrics.push({
                     periodStart: safeDateISO(pStart) || new Date().toISOString(),
                     periodEnd: safeDateISO(pEnd) || new Date().toISOString(),
                     balanceStart,
                     balanceEnd,
                     totalEarnings,
                     netFare,
                     
                     // Calculations
                     periodChange: balanceEnd - balanceStart,
                     fleetProfitMargin: totalEarnings !== 0 ? (netFare / totalEarnings) * 100 : 0,
                     cashPosition: totalEarnings !== 0 ? cashCollected / totalEarnings : 0
                 });
             }

             else if (file.type === 'uber_driver_quality' || file.type === 'uber_driver_activity') {
                 // Enhanced Driver Metrics Parsing
                 const dId = String(row['Driver UUID'] || row['Driver UUID (Driver)'] || '').trim().toLowerCase();
                 
                 // Phase 4: Global Exclusion - STRICTLY IGNORE FLEET ORG UUID
                 if (dId === FLEET_ORG_UUID) return;

                 if (dId || file.type === 'uber_driver_activity') { // Allow activity even if UUID matches loosely
                     const driverId = dId || `unknown-${Math.random()}`;
                     
                     // Helper for fuzzy lookup
                     const findKey = (keywords: string[]) => Object.keys(row).find(k => keywords.every(w => k.toLowerCase().includes(w.toLowerCase())));
                     
                     const arKey = findKey(['acceptance', 'rate']);
                     const crKey = findKey(['cancellation', 'rate']);
                     const ratingKey = findKey(['driver', 'rating']) || findKey(['rating']) || 'Driver Ratings (Previous 500 Trips)';
                     
                     // Extract Raw Values
                     const ar = parseFloat(String(row[arKey || ''] || '0').replace('%','')) / 100 || 0;
                     const cr = parseFloat(String(row[crKey || ''] || '0').replace('%','')) / 100 || 0;
                     const rating = parseFloat(String(row[ratingKey || ''] || '5.0')) || 5.0; // Default to 5 if new
                     
                     // Phase 3: Score Calculation
                     // Formula: 30% Acceptance + 30% Completion (1-Cancel) + 40% Rating
                     // Normalized to 0-100
                     
                     const scoreAr = ar * 30; // Max 30
                     const scoreCr = (1 - cr) * 30; // Max 30
                     const scoreRating = (rating / 5) * 40; // Max 40
                     
                     const rawScore = scoreAr + scoreCr + scoreRating;
                     const score = Math.min(100, Math.max(0, Math.round(rawScore)));

                     // Phase 3: Tier Determination
                     let tier: 'Platinum' | 'Gold' | 'Silver' | 'Bronze' = 'Bronze';
                     if (score >= 90) tier = 'Platinum';
                     else if (score >= 80) tier = 'Gold';
                     else if (score >= 70) tier = 'Silver';
                     
                     // Phase 3: Recommendations
                     let recommendation = 'Keep up the good work';
                     if (cr > 0.10) recommendation = 'CRITICAL: Reduce cancellations immediately';
                     else if (ar < 0.40) recommendation = 'CRITICAL: Increase acceptance rate';
                     else if (rating < 4.7) recommendation = 'Improve service quality (Rating < 4.7)';
                     else if (cr > 0.05) recommendation = 'Warning: Cancellations are rising';
                     else if (ar < 0.70) recommendation = 'Try to accept more trips to reach Gold';

                     // Extract Driver Name
                     const driverName = extractDriverName(row);

                     // Get existing or init
                     const current = driverMetricsMap.get(driverId) || {
                         id: `dm-${driverId}-${Math.random()}`,
                         driverId: driverId,
                         driverName: 'Unknown Driver',
                         periodStart: new Date().toISOString(),
                         periodEnd: new Date().toISOString(),
                         totalEarnings: 0, refundsAndExpenses: 0, cashCollected: 0,
                         netEarnings: 0, cashFlowRisk: 'OK', expenseRatio: 0,
                         acceptanceRate: 0, cancellationRate: 0, completionRate: 0,
                         ratingLast500: 0, ratingLast4Weeks: 0,
                         score: 0, tier: 'Bronze', recommendation: '',
                         onlineHours: 0, onTripHours: 0, tripsCompleted: 0,
                         dataSources: [], // Phase 2: Source Tracking
                         isFleetOwner: false
                     };

                     // Mark Source
                     if (!current.dataSources) current.dataSources = [];
                     const source = file.type === 'uber_driver_activity' ? 'activity' : 'quality';
                     if (!current.dataSources.includes(source)) current.dataSources.push(source);

                     if (driverName && driverName !== 'Unknown Driver') current.driverName = driverName;

                     // Merge Quality Metrics
                     // Only update if we have valid quality data in this row (using fuzzy keys)
                     if (arKey || ratingKey || (row[arKey || ''] !== undefined)) {
                         current.acceptanceRate = ar;
                         current.cancellationRate = cr;
                         current.ratingLast500 = rating;
                         current.score = score;
                         current.tier = tier;
                         current.recommendation = recommendation;
                         
                         const compRate = parseFloat(String(row['Completion Rate'] || '0').replace('%','')) / 100 || 0;
                         if (compRate > 0) current.completionRate = compRate;
                     }

                     // Merge Activity Metrics
                     const oh = parseFloat(String(row['Online Hours'] || row['Hours Online'] || '0')) || 0;
                     const oth = parseFloat(String(row['On Trip Hours'] || '0')) || 0;
                     const tc = parseInt(String(row['Trips Completed'] || row['Finished Trips'] || '0')) || 0;
                     
                     if (oh > 0) current.onlineHours = oh;
                     if (oth > 0) current.onTripHours = oth;
                     if (tc > 0) current.tripsCompleted = tc;
                     
                     driverMetricsMap.set(driverId, current);
                 }
             }
             
             else if (file.type === 'uber_vehicle_performance') {
                 // Vehicle Metrics Parsing
                 // Spec: "Vehicle Plate Number", "Earnings Per Hour", "Total Trips"
                 const vId = String(row['Vehicle UUID'] || row['Vehicle ID'] || row['Vehicle Plate Number'] || row['License Plate'] || '');
                 if (vId) {
                     const totalEarnings = parseFloat(String(row['Total Earnings'] || row['Gross Fares'] || row['Gross Earnings'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const onlineHours = parseFloat(String(row['Online Hours'] || row['Hours Online'] || row['Time Online'] || row['Hours'] || '0')) || 0;
                     const onTripHours = parseFloat(String(row['On Trip Hours'] || '0')) || 0;
                     let earningsPerHour = parseFloat(String(row['Earnings Per Hour'] || row['Earnings / Hour'] || row['Earnings/Hour'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     
                     // Fallback: Calculate Earnings Per Hour if missing
                     if (earningsPerHour === 0 && onlineHours > 0) {
                         earningsPerHour = totalEarnings / onlineHours;
                     }

                     // Phase 4: Utilization Calculation
                     const utilizationRate = onlineHours > 0 ? (onTripHours / onlineHours) * 100 : 0;
                     
                     // Phase 4: ROI Score (Simplified Relative Benchmark)
                     // Assume target earnings/hr is $20 (placeholder, customizable later)
                     const targetHourly = 20; 
                     const roiScore = Math.min(100, Math.round((earningsPerHour / targetHourly) * 100));
                     
                     // Phase 4: Maintenance Status (Inferred from activity/efficiency drops)
                     // If efficiency is < 50% of target but hours are high, flag it
                     let maintenanceStatus: 'Good' | 'Due Soon' | 'Critical' = 'Good';
                     if (onlineHours > 40 && earningsPerHour < 10) maintenanceStatus = 'Critical';
                     else if (onlineHours > 30 && earningsPerHour < 15) maintenanceStatus = 'Due Soon';
                     
                     vehicleMetrics.push({
                         id: `vm-${vId}-${Math.random()}`,
                         vehicleId: vId,
                         plateNumber: String(row['Vehicle Plate Number'] || row['License Plate'] || row['Plate'] || 'Unknown'),
                         vehicleName: String(row['Vehicle Make'] || '') + ' ' + String(row['Vehicle Model'] || ''),
                         periodStart: new Date().toISOString(),
                         periodEnd: new Date().toISOString(),
                         
                         totalEarnings,
                         earningsPerHour,
                         tripsPerHour: 0,
                         onlineHours,
                         onTripHours,
                         totalTrips: parseInt(String(row['Trips Completed'] || row['Total Trips'] || '0')) || 0,
                         
                         // Phase 4 Fields
                         utilizationRate,
                         roiScore,
                         maintenanceStatus
                     });
                 }
             }
             
             else if (file.type === 'uber_rental_contract') {
                 // Basic extraction for Phase 6 awareness
                 const balanceStart = parseFloat(String(row['Balance at the beginning of the period']).replace(/[^0-9.-]/g, '')) || 0;
                 const totalCharges = parseFloat(String(row['Amount to charge']).replace(/[^0-9.-]/g, '')) || 0;
                 const totalPaid = parseFloat(String(row['Amount Charged/ Paid']).replace(/[^0-9.-]/g, '')) || 0;
                 const balanceEnd = parseFloat(String(row['Balance at the end of the period']).replace(/[^0-9.-]/g, '')) || 0;

                 // Phase 5: Rental Logic Calculations
                 const collectionRate = totalCharges > 0 ? (Math.abs(totalPaid) / totalCharges) * 100 : 0;
                 
                 let paymentStatus: 'On Track' | 'Overdue' | 'Paid Off' = 'On Track';
                 if (balanceEnd <= 0) paymentStatus = 'Paid Off';
                 else if (collectionRate < 80) paymentStatus = 'Overdue';

                 rentalContracts.push({
                     termId: String(row['TermUUID'] || `term-${Math.random()}`),
                     driverId: String(row['DriverUUID'] || ''),
                     organizationId: String(row['OrganizationUUID'] || ''),
                     startDate: new Date().toISOString(), // Placeholder
                     endDate: new Date().toISOString(), // Placeholder
                     status: 'Active',
                     balanceStart,
                     totalCharges,
                     totalPaid,
                     balanceEnd,
                     
                     // Phase 5 Fields
                     paymentStatus,
                     collectionRate
                 });
             }
        });
    });

    // 2. Convert Map to Array and Finalize
    // Phase 4: Strict "Source of Truth" Filter
    // Only allow drivers who have a valid 'Birth Certificate' (Activity or Payment source)
    const driverMetrics = Array.from(driverMetricsMap.values()).filter(d => {
        const name = d.driverName ? d.driverName.trim().toLowerCase() : '';
        
        // Exclude System Entities (Always exclude)
        if (name === 'uber b.v.' || name.includes('uber payments')) return false;

        // Source Verification
        const sources = d.dataSources || [];
        const hasBirthCertificate = sources.includes('activity') || sources.includes('payment');
        
        // RULE: If a record comes ONLY from Quality/Supplemental files, it is NOT a valid driver.
        // This implicitly handles the "Ghost Fleet Owner" who appears in Quality but has no Activity.
        // It also handles cases where the Fleet Owner is explicitly flagged (Phase 3).
        if (!hasBirthCertificate) {
            return false;
        }
        
        return true;
    });

    const mergedTrips = Array.from(tripMap.values()).map(t => {
        const amount = t.amount || 0;
        const cashCollected = t.cashCollected || 0;
        const distance = t.distance || 0;
        
        return {
            id: t.id || `trip-${Math.random()}`,
            date: t.date || new Date().toISOString(),
            amount: amount,
            cashCollected: cashCollected,
            netPayout: amount - cashCollected, // Phase 3: Auto-calculate reconciliation
            driverId: t.driverId || 'unknown',
            platform: t.platform || 'Other',
            status: t.status || 'Completed',
            // Phase 4: Efficiency Calculation (Requires merging Amount + Distance)
            efficiency: (amount > 0 && distance > 0) ? amount / distance : 0,
            ...t
        } as Trip;
    }).filter(t => {
        // Phase 1: Logic Correction (Phantom Trip Filtering)
        // REFINED: Only filter if it's truly empty (No money AND No distance).
        // If it has money (> $5), we must keep it for accounting even if distance is 0 (e.g. Tips, Adjustments, or Glitched GPS).
        // If it has distance, we keep it.
        const hasMoney = Math.abs(t.amount) > 5;
        const hasDistance = t.distance && t.distance > 0.05;
        
        // Keep if it has either money or distance
        // The only "Phantom" is something with NO money AND NO distance (and usually Completed status implies it should have one)
        if (hasMoney || hasDistance) return true;
        
        // If we are here, it has no money and no distance.
        // If it's Cancelled, that's normal (cancelled before start).
        // If it's Completed but has no money/distance, it's likely a CSV artifact or header row.
        if (t.status === 'Completed') return false;
        
        return true;
    });

    // --- PHASE 4: AGGREGATE ANALYTICS ---
    const tripAnalytics: TripAnalytics = {
        geographic: { topPickups: [], topDropoffs: [], mostProfitableRoutes: [] },
        patterns: { avgDistance: 0, avgDuration: 0, peakHours: [] },
        cancellations: { rate: 0, byHour: [] }
    };

    if (mergedTrips.length > 0) {
        // 1. Patterns
        const completedTrips = mergedTrips.filter(t => t.status === 'Completed');
        const totalDist = completedTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
        const totalDur = completedTrips.reduce((acc, t) => acc + (t.duration || 0), 0);
        
        tripAnalytics.patterns.avgDistance = completedTrips.length ? totalDist / completedTrips.length : 0;
        tripAnalytics.patterns.avgDuration = completedTrips.length ? totalDur / completedTrips.length : 0;

        // Peak Hours
        const hourCounts: Record<number, number> = {};
        mergedTrips.forEach(t => {
            const h = t.timeOfDay ?? new Date(t.date).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        tripAnalytics.patterns.peakHours = Object.entries(hourCounts)
            .map(([h, c]) => ({ hour: parseInt(h), count: c }))
            .sort((a, b) => b.count - a.count);

        // 2. Geographic
        const areaCounts = (key: 'pickupArea' | 'dropoffArea') => {
            const counts: Record<string, number> = {};
            mergedTrips.forEach(t => {
                const area = t[key];
                if (area && area !== 'Unknown') counts[area] = (counts[area] || 0) + 1;
            });
            return Object.entries(counts)
                .map(([area, count]) => ({ area, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
        };
        tripAnalytics.geographic.topPickups = areaCounts('pickupArea');
        tripAnalytics.geographic.topDropoffs = areaCounts('dropoffArea');

        // Profitable Routes
        const routeStats: Record<string, { totalEff: number; count: number }> = {};
        completedTrips.forEach(t => {
            if (t.pickupArea && t.dropoffArea && t.efficiency) {
                const route = `${t.pickupArea} → ${t.dropoffArea}`;
                if (!routeStats[route]) routeStats[route] = { totalEff: 0, count: 0 };
                routeStats[route].totalEff += t.efficiency;
                routeStats[route].count++;
            }
        });
        tripAnalytics.geographic.mostProfitableRoutes = Object.entries(routeStats)
            .map(([route, stats]) => ({ route, earningsPerKm: stats.totalEff / stats.count }))
            .sort((a, b) => b.earningsPerKm - a.earningsPerKm)
            .slice(0, 5);

        // 3. Cancellations
        const cancelled = mergedTrips.filter(t => t.status === 'Cancelled').length;
        tripAnalytics.cancellations.rate = (cancelled / mergedTrips.length) * 100;
        
        const cancelHours: Record<number, number> = {};
        mergedTrips.filter(t => t.status === 'Cancelled').forEach(t => {
             const h = t.timeOfDay ?? new Date(t.date).getHours();
             cancelHours[h] = (cancelHours[h] || 0) + 1;
        });
        tripAnalytics.cancellations.byHour = Object.entries(cancelHours)
            .map(([h, c]) => ({ hour: parseInt(h), count: c }))
            .sort((a, b) => b.count - a.count);
    }

    // --- PHASE 6: AGGREGATION & SYNTHESIS ---
    
    // REVENUE CALCULATION (Option 2: Bottom-Up)
    // We ignore the "Summary" columns from the CSVs to avoid double-counting.
    // Instead, we sum the actual transactions we processed.
    const calculatedTotalEarnings = mergedTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
    const calculatedCashExposure = mergedTrips.reduce((sum, t) => sum + (t.cashCollected || 0), 0);
    const calculatedNetFare = mergedTrips.reduce((sum, t) => sum + (t.netTransaction || 0), 0);

    // If no explicit organization report, create a synthetic one from the bottom-up data
    if (organizationMetrics.length === 0 && (driverMetrics.length > 0 || vehicleMetrics.length > 0 || mergedTrips.length > 0)) {
         organizationMetrics.push({
             periodStart: new Date().toISOString(), 
             periodEnd: new Date().toISOString(),
             balanceStart: 0,
             balanceEnd: 0,
             totalEarnings: calculatedTotalEarnings,
             netFare: calculatedNetFare,
             periodChange: 0,
             fleetProfitMargin: 0,
             cashPosition: 0
         });
    } else if (organizationMetrics.length > 0) {
        // If we DO have summary reports, we still OVERWRITE the revenue numbers 
        // with our calculated bottom-up numbers to ensure accuracy and prevent double-counting.
        organizationMetrics.forEach(om => {
            om.totalEarnings = calculatedTotalEarnings;
            om.netFare = calculatedNetFare;
            om.totalCashExposure = calculatedCashExposure;
            
            // Re-calculate derived metrics
            om.cashPosition = calculatedTotalEarnings > 0 ? calculatedCashExposure / calculatedTotalEarnings : 0;
            om.fleetProfitMargin = calculatedTotalEarnings > 0 ? (calculatedNetFare / calculatedTotalEarnings) * 100 : 0;
        });
    }

    // Populate Phase 6 fields
    if (organizationMetrics.length > 0) {
        const om = organizationMetrics[0];
        
        // 1. Counts
        const activeDrivers = new Set(driverMetrics.map(d => d.driverId)).size || new Set(mergedTrips.map(t => t.driverId)).size;
        const activeVehicles = new Set(vehicleMetrics.map(v => v.vehicleId)).size || new Set(mergedTrips.map(t => t.vehicleId).filter(Boolean)).size;
        
        // FIX: Only count COMPLETED trips for the KPI to match user expectation (42 trips vs 50 requests)
        const totalTrips = mergedTrips.filter(t => t.status === 'Completed').length; 

        // 2. Fleet Utilization (Average of vehicle utilization)
        let avgUtilization = 0;
        if (vehicleMetrics.length > 0) {
            const totalUtil = vehicleMetrics.reduce((sum, v) => sum + (v.utilizationRate || 0), 0);
            avgUtilization = totalUtil / vehicleMetrics.length;
        }

        // 3. Total Cash Exposure (Risk) - Already calculated above
        
        // 4. Update Metric Object
        om.activeDrivers = activeDrivers;
        om.activeVehicles = activeVehicles;
        om.totalTrips = totalTrips;
        om.fleetUtilization = avgUtilization;
        om.totalCashExposure = calculatedCashExposure; // Ensure this is set
    }

    return {
        trips: [...mergedTrips, ...genericTrips],
        driverMetrics,
        vehicleMetrics,
        rentalContracts,
        organizationMetrics,
        organizationName, // Return extracted name
        tripAnalytics
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

    // Phase 4 FIX: Global Exclusion in Generic Parsing
    // If the Generic Parser extracts the Fleet UUID, strictly ignore it.
    if (trip.driverId && String(trip.driverId).trim().toLowerCase() === FLEET_ORG_UUID) {
         trip.driverId = 'fleet-org-ignore'; 
         trip.driverName = 'Fleet Organization';
    }

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

export const downloadTemplate = (fields: FieldDefinition[]) => {
    // Create a CSV with just headers
    const headers = fields.map(f => f.label);
    const csv = Papa.unparse({
        fields: headers,
        data: [] 
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'goride_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- PHASE 2: AI PAYLOAD CONSTRUCTION ---

export function constructAiPayload(files: FileData[]): string {
    let payload = "";

    files.forEach((file, index) => {
        // Optimization: Strip columns first to save tokens
        const cleanRows = stripEmptyColumns(file.rows, file.headers);
        
        if (cleanRows.length === 0) return;

        payload += `\n=== FILE ${index + 1}: ${file.name} (Type: ${file.type}) ===\n`;
        
        // Papa.unparse automatically handles headers from the keys of the first object
        const csv = Papa.unparse(cleanRows);
        payload += csv;
        payload += "\n\n";
    });

    return payload;
}

function stripEmptyColumns(rows: ParsedRow[], originalHeaders: string[]): ParsedRow[] {
    if (rows.length === 0) return [];

    // 1. Identify columns that are completely empty or have only ""/null/undefined across ALL rows
    const emptyColumns = new Set<string>();
    
    // Check for empty values
    originalHeaders.forEach(header => {
        const isEmpty = rows.every(row => {
            const val = row[header];
            return val === undefined || val === null || String(val).trim() === "";
        });
        if (isEmpty) emptyColumns.add(header);
    });

    // 2. Identify "Junk" columns (heuristics) that confuse the AI or waste tokens
    const junkKeywords = [
        'device type', 'device_type', 
        'os version', 'os_version', 
        'app version', 'app_version', 
        'user os', 'user_os', 
        'ip address', 'ip_address'
    ];
    
    originalHeaders.forEach(header => {
        if (junkKeywords.some(k => header.toLowerCase().includes(k))) {
            emptyColumns.add(header);
        }
    });

    // 3. Construct new rows without these columns
    return rows.map(row => {
        const newRow: ParsedRow = {};
        Object.keys(row).forEach(key => {
            if (!emptyColumns.has(key)) {
                newRow[key] = row[key];
            }
        });
        return newRow;
    });
}
