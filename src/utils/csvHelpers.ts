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
        required: ['Earnings Per Hour'], 
        anyOne: ['Vehicle UUID', 'License Plate', 'Vehicle Plate Number'],
        label: 'Vehicle Stats' 
    },
    'uber_driver_activity': { 
        required: ['Online Hours'], 
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

    // Check strict required
    rules.required.forEach(req => {
        const found = file.headers.some(h => h.toLowerCase().includes(req.toLowerCase()));
        if (!found) errors.push(`Missing required column: "${req}"`);
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
        name.includes('payments_transaction') || name.includes('payment_order')
    ) return 'uber_payment';

    // 3. Driver Payments (Financials - Driver Level)
    if (
        ((has('Driver UUID') || has('Driver ID') || has('Driver Name')) && 
        (has('Total Earnings') || has('Refunds and Expenses') || has('Refunds')) && 
        !has('Trip UUID')) ||
        name.includes('payments_driver')
    ) return 'uber_payment_driver';

    // 4. Organization Payments (Financials - Fleet Level)
    if (
        has('NetFare') || has('Net Fare') || 
        (has('Start Of Period Balance') && has('End Of Period Balance')) ||
        (has('Balance Start') && has('Balance End')) ||
        name.includes('payment_organisation') || name.includes('payment_organization')
    ) return 'uber_payment_org';

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
    tripAnalytics?: TripAnalytics; // Phase 4
}

export function mergeAndProcessData(files: FileData[], availableFields: FieldDefinition[]): ProcessedBatch {
    const tripMap = new Map<string, Partial<Trip>>();
    const genericTrips: Trip[] = [];
    const driverMetrics: DriverMetrics[] = [];
    const vehicleMetrics: VehicleMetrics[] = [];
    const rentalContracts: RentalContract[] = [];
    const organizationMetrics: OrganizationMetrics[] = [];

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
                    
                    // Extract Driver Name
                    if (schema.driverName) {
                        const names = Array.isArray(schema.driverName) ? schema.driverName : [schema.driverName];
                        const name = names.map(n => row[n]).filter(Boolean).join(' ').trim();
                        if (name) current.driverName = name;
                    }

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
                        const rawDur = String(row['Trip duration'] || row['Duration (min)'] || '');
                        if (rawDur) {
                            if (rawDur.includes(':')) {
                                const parts = rawDur.split(':').map(Number);
                                if (parts.length === 3) durationMinutes = parts[0]*60 + parts[1] + parts[2]/60;
                            } else {
                                durationMinutes = parseFloat(rawDur) || 0;
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
                    let earningsVal = row['Paid to you'] || row['Paid to you : Your earnings'] || row['Fare'];
                    let payoutsVal = row['Payouts'] || row['Your Earnings'] || '0';
                    let cashVal = row['Cash Collected'] || row['Cash collected'] || '0';
                    
                    const earnings = parseCurrency(earningsVal);
                    const payouts = parseCurrency(payoutsVal);
                    const cash = parseCurrency(cashVal);

                    // Step 2.1 Calculations
                    current.amount = earnings;
                    current.grossEarnings = earnings;
                    current.cashCollected = cash;
                    current.payouts = payouts;
                    current.netTransaction = earnings - payouts; // Net Transaction
                    current.cashPercentage = earnings !== 0 ? (cash / earnings) * 100 : 0;

                    // Detailed Financial Breakdown (New Requirement)
                    current.fareBreakdown = {
                        baseFare: parseCurrency(row['Paid to you:Your earnings:Fare:Fare']),
                        tips: parseCurrency(row['Paid to you:Your earnings:Tip']),
                        waitTime: parseCurrency(row['Paid to you:Your earnings:Fare:Wait Time at Pickup']),
                        surge: parseCurrency(row['Paid to you:Your earnings:Fare:Surge']),
                        airportFees: parseCurrency(row['Paid to you:Your earnings:Fare:Airport Surcharge']),
                        timeAtStop: parseCurrency(row['Paid to you:Your earnings:Fare:Time at Stop']),
                        taxes: parseCurrency(row['Paid to you : Your earnings : Taxes'] || row['Paid to you:Your earnings:Taxes'])
                    };
                    
                    current.tollCharges = parseCurrency(row['Paid to you:Trip balance:Refunds:Toll']);
                    
                    // Net to Driver: "Your earnings" minus any adjustments
                    // We check both short and long forms for "Your earnings"
                    let netBase = parseCurrency(row['Your Earnings'] || row['Your earnings'] || row['Paid to you:Your earnings'] || row['Paid to you : Your earnings']);
                    
                    // If specific "Your earnings" column is missing/zero, fallback to Gross Earnings
                    if (netBase === 0 && earnings !== 0) {
                        netBase = earnings;
                    }

                    const adjustments = parseCurrency(row['Paid to you:Your earnings:Fare:Fare Adjustment'] || row['Fare Adjustment'] || row['Adjustment']);
                    current.netToDriver = netBase - adjustments;
                    
                    // Determine Transaction Type
                    const desc = String(row['Description'] || '').toLowerCase();
                    if (desc.includes('adjustment')) current.transactionType = 'Fare Adjustment';
                    else if (desc.includes('tip')) current.transactionType = 'Tip';
                    else if (desc.includes('settle')) current.transactionType = 'Settlement';
                    else current.transactionType = 'Completed Trip';

                    if (!current.date && row['vs reporting']) {
                         try { current.date = new Date(String(row['vs reporting'])).toISOString(); } catch(e) {}
                    }
                    if (!current.driverId && row[schema.driverId]) current.driverId = String(row[schema.driverId]);
                    
                    if (schema.driverName && !current.driverName) {
                        const names = Array.isArray(schema.driverName) ? schema.driverName : [schema.driverName];
                        const name = names.map(n => row[n]).filter(Boolean).join(' ').trim();
                        if (name) current.driverName = name;
                    }
                }
                tripMap.set(tripId, current);
             }
             
             // --- NEW: Parse Side-Channel Data ---
             
             else if (file.type === 'uber_payment_driver') {
                 // Driver Level Payments Parsing
                 // Phase 2 Step 2.2
                 const dId = String(row['Driver UUID'] || '');
                 if (dId) {
                     const totalEarnings = parseFloat(String(row['Total Earnings'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const refundsAndExpenses = parseFloat(String(row['Refunds and Expenses'] || row['Refunds'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const cashCollected = parseFloat(String(row['Cash Collected'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     
                     // Extract Driver Name - Robust Logic
                     let driverName = 'Unknown Driver';
                     const firstName = row['Driver First Name'] || row['First Name'] || row['Driver first name'];
                     const lastName = row['Driver Surname'] || row['Driver Last Name'] || row['Last Name'] || row['Driver last name'];
                     const fullName = row['Driver Name'] || row['Name'] || row['Driver'];

                     if (firstName || lastName) {
                         driverName = `${firstName || ''} ${lastName || ''}`.trim();
                     } else if (fullName) {
                         driverName = String(fullName).trim();
                     }

                     driverMetrics.push({
                         id: `dm-pay-${dId}-${Math.random()}`,
                         driverId: dId,
                         driverName: driverName || 'Unknown Driver',
                         periodStart: new Date().toISOString(),
                         periodEnd: new Date().toISOString(),
                         
                         // Financials
                         totalEarnings,
                         refundsAndExpenses,
                         cashCollected,
                         
                         // Calculations Step 2.2
                         netEarnings: totalEarnings - refundsAndExpenses,
                         cashFlowRisk: (totalEarnings > 0 && (cashCollected / totalEarnings) > 0.3) ? 'HIGH' : 'OK',
                         expenseRatio: totalEarnings !== 0 ? (refundsAndExpenses / totalEarnings) * 100 : 0,

                         // Zero out other metrics as this is a payment file
                         acceptanceRate: 0,
                         cancellationRate: 0,
                         completionRate: 0,
                         ratingLast500: 0,
                         ratingLast4Weeks: 0,
                         onlineHours: 0,
                         onTripHours: 0,
                         tripsCompleted: 0
                     });
                 }
             }

             else if (file.type === 'uber_payment_org') {
                 // Phase 2 Step 2.3: Process Payment_Organization.csv
                 const balanceStart = parseFloat(String(row['Start Of Period Balance'] || row['Balance Start'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const balanceEnd = parseFloat(String(row['End Of Period Balance'] || row['Balance End'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const totalEarnings = parseFloat(String(row['Total Earnings'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 const netFare = parseFloat(String(row['NetFare'] || row['Net Fare'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                 // Cash collected usually aggregated, assume 0 if not present here or sum later
                 const cashCollected = parseFloat(String(row['Cash Collected'] || '0').replace(/[^0-9.-]/g, '')) || 0;

                 organizationMetrics.push({
                     periodStart: new Date().toISOString(),
                     periodEnd: new Date().toISOString(),
                     balanceStart,
                     balanceEnd,
                     totalEarnings,
                     netFare,
                     
                     // Calculations Step 2.3
                     periodChange: balanceEnd - balanceStart,
                     fleetProfitMargin: totalEarnings !== 0 ? (netFare / totalEarnings) * 100 : 0,
                     cashPosition: totalEarnings !== 0 ? cashCollected / totalEarnings : 0
                 });
             }

             else if (file.type === 'uber_driver_quality' || file.type === 'uber_driver_activity') {
                 // Enhanced Driver Metrics Parsing
                 const dId = String(row['Driver UUID'] || row['Driver UUID (Driver)'] || '');
                 if (dId || file.type === 'uber_driver_activity') { // Allow activity even if UUID matches loosely
                     const driverId = dId || `unknown-${Math.random()}`;
                     
                     // Extract Raw Values
                     const ar = parseFloat(String(row['Acceptance Rate'] || '0').replace('%','')) / 100 || 0;
                     const cr = parseFloat(String(row['Cancellation Rate'] || '0').replace('%','')) / 100 || 0;
                     const rating = parseFloat(String(row['Driver Ratings (Previous 500 Trips)'] || row['Driver Rating'] || '5.0')) || 5.0; // Default to 5 if new
                     
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

                     // Extract Driver Name - Robust Logic
                     let driverName = 'Unknown Driver';
                     const firstName = row['Driver First Name'] || row['First Name'] || row['Driver first name'];
                     const lastName = row['Driver Surname'] || row['Driver Last Name'] || row['Last Name'] || row['Driver last name'];
                     const fullName = row['Driver Name'] || row['Name'] || row['Driver'];

                     if (firstName || lastName) {
                         driverName = `${firstName || ''} ${lastName || ''}`.trim();
                     } else if (fullName) {
                         driverName = String(fullName).trim();
                     }

                     driverMetrics.push({
                        id: `dm-${driverId}-${Math.random()}`,
                        driverId: driverId,
                        driverName: driverName || 'Unknown Driver',
                        periodStart: new Date().toISOString(),  
                        periodEnd: new Date().toISOString(),
                        
                        // Quality Params (might be missing in Activity files)
                        acceptanceRate: ar,
                        cancellationRate: cr,
                        completionRate: parseFloat(String(row['Completion Rate'] || '0').replace('%','')) / 100 || 0,
                        ratingLast500: rating,
                        ratingLast4Weeks: 0, // Often not in CSV
                        
                        // Phase 3 Fields
                        score,
                        tier,
                        recommendation,
                        
                        // Activity Params
                        onlineHours: parseFloat(String(row['Online Hours'] || row['Hours Online'] || '0')) || 0,
                        onTripHours: parseFloat(String(row['On Trip Hours'] || '0')) || 0,
                        tripsCompleted: parseInt(String(row['Trips Completed'] || row['Finished Trips'] || '0')) || 0
                     });
                 }
             }
             
             else if (file.type === 'uber_vehicle_performance') {
                 // Vehicle Metrics Parsing
                 // Spec: "Vehicle Plate Number", "Earnings Per Hour", "Total Trips"
                 const vId = String(row['Vehicle UUID'] || row['Vehicle ID'] || row['Vehicle Plate Number'] || row['License Plate'] || '');
                 if (vId) {
                     const totalEarnings = parseFloat(String(row['Total Earnings'] || row['Gross Fares'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     const onlineHours = parseFloat(String(row['Online Hours'] || '0')) || 0;
                     const onTripHours = parseFloat(String(row['On Trip Hours'] || '0')) || 0;
                     const earningsPerHour = parseFloat(String(row['Earnings Per Hour'] || '0').replace(/[^0-9.-]/g, '')) || 0;
                     
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
    // If no explicit organization report, create a synthetic one from the bottom-up data
    if (organizationMetrics.length === 0 && (driverMetrics.length > 0 || vehicleMetrics.length > 0 || mergedTrips.length > 0)) {
         organizationMetrics.push({
             periodStart: new Date().toISOString(), 
             periodEnd: new Date().toISOString(),
             balanceStart: 0,
             balanceEnd: 0,
             totalEarnings: 0,
             netFare: 0,
             periodChange: 0,
             fleetProfitMargin: 0,
             cashPosition: 0
         });
    }

    // Populate Phase 6 fields
    if (organizationMetrics.length > 0) {
        const om = organizationMetrics[0];
        
        // 1. Counts
        const activeDrivers = new Set(driverMetrics.map(d => d.driverId)).size || new Set(mergedTrips.map(t => t.driverId)).size;
        const activeVehicles = new Set(vehicleMetrics.map(v => v.vehicleId)).size || new Set(mergedTrips.map(t => t.vehicleId).filter(Boolean)).size;
        const totalTrips = mergedTrips.length; 

        // 2. Fleet Utilization (Average of vehicle utilization)
        let avgUtilization = 0;
        if (vehicleMetrics.length > 0) {
            const totalUtil = vehicleMetrics.reduce((sum, v) => sum + (v.utilizationRate || 0), 0);
            avgUtilization = totalUtil / vehicleMetrics.length;
        }

        // 3. Total Cash Exposure (Risk)
        const totalCash = mergedTrips.reduce((sum, t) => sum + (t.cashCollected || 0), 0);
        
        // 4. Update Metric Object
        om.activeDrivers = activeDrivers;
        om.activeVehicles = activeVehicles;
        om.totalTrips = totalTrips;
        om.fleetUtilization = avgUtilization;
        om.totalCashExposure = totalCash;

        // 5. Backfill financials if synthetic
        if (om.totalEarnings === 0 && mergedTrips.length > 0) {
            om.totalEarnings = mergedTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
            om.cashPosition = om.totalEarnings > 0 ? totalCash / om.totalEarnings : 0;
        }
    }

    return {
        trips: [...mergedTrips, ...genericTrips],
        driverMetrics,
        vehicleMetrics,
        rentalContracts,
        organizationMetrics,
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
