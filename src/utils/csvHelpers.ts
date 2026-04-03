import { Trip, CsvMapping, ParsedRow, FieldDefinition, FieldType, DriverMetrics, VehicleMetrics, RentalContract, OrganizationMetrics, DisputeRefund } from '../types/data';
import { FuelEntry, FuelCard } from '../types/fuel';
import Papa from 'papaparse';
import {
    parseUberDriverStatementSsot,
    parseUberPaymentTransactionSsotLine,
    UberDriverStatementRow,
    UberSsotTotals,
} from './uberSsot';
import { isUberTripFareAdjustOrderDescription } from './uberTripFareAdjustOrder';

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
  { key: 'odometer', label: 'Odometer Reading', type: 'number', isCustom: false, isRequired: false, isVisible: true },
  { key: 'notes', label: 'Notes', type: 'text', isCustom: false, isRequired: false, isVisible: true },
];

export const DEFAULT_FIELDS = DEFAULT_SYSTEM_FIELDS;

// Fleet Organization UUID (Source of Truth)
// This UUID represents the Fleet Entity and must NEVER be treated as a Driver.
export const FLEET_ORG_UUID = '73dfc14d-3798-4a00-8d86-b2a3eb632f54';

/** Uber `trip_activity.csv` (and payment rows if column exists): `cash` vs `braintree` / other → app labels. */
export function mapUberTripActivityPaymentType(raw: unknown): 'Cash' | 'Digital (card/Bank)' | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (s === 'cash') return 'Cash';
  return 'Digital (card/Bank)';
}

function readUberCsvPaymentTypeCell(row: ParsedRow): unknown {
  if (row['Payment Type'] !== undefined && row['Payment Type'] !== '') return row['Payment Type'];
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === 'payment type');
  return key !== undefined ? row[key] : undefined;
}

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
  type: 'uber_trip' | 'uber_payment' | 'uber_payment_driver' | 'uber_payment_org' | 'uber_driver_quality' | 'uber_vehicle_performance' | 'uber_driver_activity' | 'uber_driver_time_distance' | 'uber_vehicle_time_distance' | 'uber_rental_contract' | 'fuel_statement' | 'generic';
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
    'uber_driver_time_distance': {
        required: ['Driver UUID', 'Open Time', 'Enroute Time'],
        label: 'Driver Time & Distance'
    },
    'uber_vehicle_time_distance': {
        required: ['Vehicle UUID', 'Open Time', 'Enroute Time'],
        label: 'Vehicle Time & Distance'
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

// Phase 3: Audit Locking Helpers
export function isRecordLocked(dateStr: string, anchorDateStr?: string): boolean {
    if (!anchorDateStr) return false;
    const recordDate = new Date(dateStr);
    const anchorDate = new Date(anchorDateStr);
    return recordDate < anchorDate;
}

export function validateImmutableRecord(row: ParsedRow, lastAnchorDate?: string, override: boolean = false): { valid: boolean; error?: string } {
    if (!lastAnchorDate || override) return { valid: true };
    
    const dateField = row['date'] || row['Trip request time'] || row['Date'];
    if (dateField && isRecordLocked(String(dateField), lastAnchorDate)) {
        return { 
            valid: false, 
            error: `Historical Lock: Record precedes Verified Anchor (${lastAnchorDate}). Modification requires Audit Override.` 
        };
    }
    return { valid: true };
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
    const hasOrgId = has('Organization UUID') || has('OrganizationUUID');
    // We check for specific ledger columns. Note: 'End of period balance' matches the user's screenshot.
    const hasLedger = has('End Of Period Balance') || has('Balance End') || has('Start Of Period Balance') || has('Balance Start') || has('NetFare') || has('Net Fare') || has('Net Earnings');
    // Guard: Files with Driver UUID are driver-level, not org-level
    const hasDriverId = has('Driver UUID') || has('Driver ID');

    if (
        !hasDriverId && ( // Exclude driver-level files from org classification
            (hasOrgId && hasLedger) || // Strongest Signal: Org ID + Ledger Data
            (hasLedger && !has('Trip UUID')) || // Ledger Data without Trip Data (avoids Trip Activity confusion)
            name.includes('payment_organisation') || name.includes('payment_organization')
        )
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

    // 7.1 Driver Time & Distance (New) - High Priority Check
    // We strictly check for 'Driver UUID' to distinguish from Vehicle files
    if (
        (has('Open Time') && has('Unavailable Time') && has('Driver UUID')) ||
        (has('Open Distance') && has('Unavailable Distance') && has('Driver UUID')) ||
        name.includes('driver_time_and_distance') ||
        name.includes('driver time and distance')
    ) return 'uber_driver_time_distance';

    // 7.2 Vehicle Time & Distance (New) - High Priority Check
    // We strictly check for 'Vehicle UUID' to distinguish from Driver files
    if (
        (has('Open Time') && has('Unavailable Time') && has('Vehicle UUID')) || 
        (has('Open Distance') && has('Unavailable Distance') && has('Vehicle UUID')) ||
        name.includes('vehicle_time_and_distance') ||
        name.includes('vehicle time and distance')
    ) return 'uber_vehicle_time_distance';

    // 8. Rental Contracts
    if (has('TermUUID') || (has('OrganizationUUID') && has('Balance'))) return 'uber_rental_contract';
    
    // 9. Fuel Statement
    if (
        (has('Card Number') || has('Card #') || has('Pan') || has('Card ID')) && 
        (has('Volume') || has('Liters') || has('Gallons') || has('Qty') || has('Quantity')) && 
        (has('Amount') || has('Cost') || has('Total') || has('Price'))
    ) return 'fuel_statement';
    
    return 'generic';
}

// Helper to normalize keys for merging (e.g., lower case UUIDs)
const cleanId = (id: any) => String(id || '').trim();

// Phase 6: Robust Date Parsing Helper
const parseDateString = (str: string, isMMDD: boolean): Date | null => {
    if (!str) return null;
    const s = String(str).trim();
    
    // Check if it's strictly numeric date parts (slash or dash)
    // "12/14/2025" or "12/14/2025 10:30 AM"
    // Regex matches start of string: NN/NN/NNNN or NN-NN-NNNN
    const dateMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
    
    if (dateMatch) {
        let p1 = parseInt(dateMatch[1]);
        let p2 = parseInt(dateMatch[2]);
        let year = parseInt(dateMatch[3]);
        if (year < 100) year += 2000; // 2-digit year assumption
        
        let month, day;
        if (isMMDD) {
            month = p1;
            day = p2;
        } else {
            // DD/MM
            month = p2;
            day = p1;
        }
        
        // Basic Validation
        if (month < 1 || month > 12 || day < 1 || day > 31) {
             // If validation fails, fallback to standard parser
             const d = new Date(s);
             return isNaN(d.getTime()) ? null : d;
        }
        
        // Preserve Time
        const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
        let h = 0, m = 0, s_sec = 0;
        if (timeMatch) {
            h = parseInt(timeMatch[1]);
            m = parseInt(timeMatch[2]);
            s_sec = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
            const meridian = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
            
            if (meridian === 'PM' && h < 12) h += 12;
            if (meridian === 'AM' && h === 12) h = 0;
        }
        
        return new Date(year, month - 1, day, h, m, s_sec);
    }
    
    // Fallback to standard parser (ISO, etc.)
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

export interface ProcessedBatch {
    trips: Trip[];
    driverMetrics: DriverMetrics[];
    vehicleMetrics: VehicleMetrics[];
    rentalContracts: RentalContract[];
    organizationMetrics: OrganizationMetrics[];
    fuelEntries?: FuelEntry[];
    organizationName?: string; // Phase 1: Fleet Owner
    tripAnalytics?: TripAnalytics; // Phase 4
    /**
     * Phase 2: Uber driver statement SSOT totals parsed from `payments_driver.csv`.
     * Used later to reconcile per-trip components into statement totals (Phase 4/5).
     */
    uberStatementsByDriverId?: Record<string, UberSsotTotals>;
    driverTimeData?: DriverTimeDistance[];
    vehicleTimeData?: VehicleTimeDistance[];
    calibrationStats?: {
        fleetStats: FleetStats;
        deductionPerTrip: number;
        phantomLagDetected: boolean;
    };
    disputeRefunds?: DisputeRefund[];
    /** Post-merge hints for the import UI (e.g. Uber payments without matching trip_activity rows). */
    importWarnings?: {
        uberTripsMissingTripActivity: number;
    };
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
        // Fleet standard: driver names from imports are uppercase (Uber CSV, etc.) — case-insensitive identity.
        return name.toUpperCase();
    }
    
    return 'Unknown Driver';
};

// Phase 2: Static Import Reconstruction Helper
export interface DriverTimeDistance {
    driverUuid: string;
    openTime: number; // Hours
    enrouteTime: number; // Hours
    onTripTime: number; // Hours
    unavailableTime: number; // Hours
    openDistance: number;
    enrouteDistance: number;
    onTripDistance: number;
    unavailableDistance: number;
}

export interface VehicleTimeDistance {
    vehicleUuid: string;
    vehiclePlate: string;
    openTime: number;
    enrouteTime: number;
    onTripTime: number;
    unavailableTime: number;
    openDistance: number;
    enrouteDistance: number;
    onTripDistance: number;
    unavailableDistance: number;
}

export function parseHHMMSS(value: string): number {
    if (!value) return 0;
    const clean = value.trim();
    const parts = clean.split(':').map(p => parseFloat(p) || 0);

    // Format: HH:MM:SS (e.g. 0:00:07 = 7 seconds)
    if (parts.length === 3) {
        return parts[0] + (parts[1] / 60) + (parts[2] / 3600);
    }
    // Fallback
    return 0;
}

export interface FleetStats {
    onTripRatio: number;
    toTripRatio: number;
    availableRatio: number;
    totalOnlineHours: number;
    totalOnJobHours: number;
    totalOnTripHours: number;
    totalUnavailableHours: number;
    
    // Distance Metrics
    totalOpenDistance?: number;
    totalEnrouteDistance?: number;
    totalOnTripDistance?: number;
    totalUnavailableDistance?: number;

    // Phase 4: Separate Breakdowns
    driverStats?: FleetStats;
    vehicleStats?: FleetStats;
}

function parseDurationToHours(raw: string): number {
    if (!raw) return 0;
    const clean = raw.trim();
    
    // Handle "days : hours : minutes" format (e.g. "2:20:28")
    if (clean.includes(':')) {
        const parts = clean.split(':').map(p => parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
        if (parts.length === 3) {
            // Uber Driver Activity often uses D:H:M format (e.g. 1:15:20 = 1 day 15 hours 20 mins)
            // We assume this format for 3-part durations in these specific files.
            return (parts[0] * 24) + parts[1] + (parts[2] / 60);
        }
        if (parts.length === 2) {
            // H:M format
            return parts[0] + (parts[1] / 60);
        }
    }
    
    // Fallback to simple float parse
    return parseFloat(clean.replace(/[^0-9.-]/g, '')) || 0;
}

function createFleetStatsObject(
    sumOnline: number, 
    sumOnJob: number, 
    sumOnTrip: number, 
    sumToTrip: number, 
    sumUnavailable: number,
    sumOpenDist: number = 0,
    sumEnrouteDist: number = 0,
    sumOnTripDist: number = 0,
    sumUnavailableDist: number = 0
): FleetStats {
    // If sumOnJob is 0 (missing), we cannot calculate ratios correctly relative to Job.
    // However, to prevent divide by zero, we handle it.
    let onTripRatio = 0;
    let toTripRatio = 0;
    let availableRatio = 0;

    if (sumOnJob > 0) {
        onTripRatio = sumOnTrip / sumOnJob;
        // To Trip = Job - Trip
        toTripRatio = (sumOnJob - sumOnTrip) / sumOnJob;
        // Available = Online - Job
        availableRatio = (sumOnline - sumOnJob) / sumOnJob;
    }

    // Ensure no negative ratios if data is slightly dirty
    toTripRatio = Math.max(0, toTripRatio);
    availableRatio = Math.max(0, availableRatio);

    return {
        onTripRatio,
        toTripRatio,
        availableRatio,
        totalOnlineHours: sumOnline,
        totalOnJobHours: sumOnJob,
        totalOnTripHours: sumOnTrip,
        totalUnavailableHours: sumUnavailable,
        
        totalOpenDistance: sumOpenDist,
        totalEnrouteDistance: sumEnrouteDist,
        totalOnTripDistance: sumOnTripDist,
        totalUnavailableDistance: sumUnavailableDist
    };
}

function calculateFleetStats(files: FileData[]): FleetStats {
    let sumOnTrip = 0;
    let sumOnJob = 0;
    let sumOnline = 0;
    // Phase 2: New Variable for "To Trip" tracking
    let sumToTrip = 0;
    let sumUnavailable = 0;
    
    let foundPerformance = false;

    // PRIORITY 1: New Time & Distance Files (Direct Mapping)
    const driverTimeFiles = files.filter(f => f.type === 'uber_driver_time_distance');
    const vehicleTimeFiles = files.filter(f => f.type === 'uber_vehicle_time_distance');
    
    let driverStats: FleetStats | undefined;
    let vehicleStats: FleetStats | undefined;

    if (driverTimeFiles.length > 0 || vehicleTimeFiles.length > 0) {
        foundPerformance = true;

        // 1. Driver Stats
        if (driverTimeFiles.length > 0) {
            let dSumOnline = 0;
            let dSumOnJob = 0;
            let dSumOnTrip = 0;
            let dSumToTrip = 0;
            let dSumUnavailable = 0;
            let dSumOpenDist = 0;
            let dSumEnrouteDist = 0;
            let dSumOnTripDist = 0;
            let dSumUnavailableDist = 0;

            driverTimeFiles.forEach(file => {
                 file.rows.forEach(row => {
                     // Updated to use parseDurationToHours to support D:H:M format (e.g. 1:14:04 = 1d 14h 4m)
                     const openTime = parseDurationToHours(String(row['Open Time'])); 
                     const enrouteTime = parseDurationToHours(String(row['Enroute Time'])); 
                     const onTripTime = parseDurationToHours(String(row['On Trip Time'])); 
                     const unavailableTime = parseDurationToHours(String(row['Unavailable Time'])); 
                     
                     dSumOnline += (openTime + enrouteTime + onTripTime);
                     dSumOnJob += (enrouteTime + onTripTime);
                     dSumOnTrip += onTripTime;
                     dSumToTrip += enrouteTime;
                     dSumUnavailable += unavailableTime;

                     dSumOpenDist += parseFloat(String(row['Open Distance'] || 0));
                     dSumEnrouteDist += parseFloat(String(row['Enroute Distance'] || 0));
                     dSumOnTripDist += parseFloat(String(row['On Trip Distance'] || 0));
                     dSumUnavailableDist += parseFloat(String(row['Unavailable Distance'] || 0));
                 });
            });
            driverStats = createFleetStatsObject(dSumOnline, dSumOnJob, dSumOnTrip, dSumToTrip, dSumUnavailable, dSumOpenDist, dSumEnrouteDist, dSumOnTripDist, dSumUnavailableDist);
        }

        // 2. Vehicle Stats
        if (vehicleTimeFiles.length > 0) {
            let vSumOnline = 0;
            let vSumOnJob = 0;
            let vSumOnTrip = 0;
            let vSumToTrip = 0;
            let vSumUnavailable = 0;
            let vSumOpenDist = 0;
            let vSumEnrouteDist = 0;
            let vSumOnTripDist = 0;
            let vSumUnavailableDist = 0;

            vehicleTimeFiles.forEach(file => {
                 file.rows.forEach(row => {
                     // Updated to use parseDurationToHours to support D:H:M format
                     const openTime = parseDurationToHours(String(row['Open Time'])); 
                     const enrouteTime = parseDurationToHours(String(row['Enroute Time'])); 
                     const onTripTime = parseDurationToHours(String(row['On Trip Time'])); 
                     const unavailableTime = parseDurationToHours(String(row['Unavailable Time'])); 
                     
                     vSumOnline += (openTime + enrouteTime + onTripTime);
                     vSumOnJob += (enrouteTime + onTripTime);
                     vSumOnTrip += onTripTime;
                     vSumToTrip += enrouteTime;
                     vSumUnavailable += unavailableTime;

                     vSumOpenDist += parseFloat(String(row['Open Distance'] || 0));
                     vSumEnrouteDist += parseFloat(String(row['Enroute Distance'] || 0));
                     vSumOnTripDist += parseFloat(String(row['On Trip Distance'] || 0));
                     vSumUnavailableDist += parseFloat(String(row['Unavailable Distance'] || 0));
                 });
            });
            vehicleStats = createFleetStatsObject(vSumOnline, vSumOnJob, vSumOnTrip, vSumToTrip, vSumUnavailable, vSumOpenDist, vSumEnrouteDist, vSumOnTripDist, vSumUnavailableDist);
        }

        // 3. Determine Global Fleet Stats
        // If driver stats exist, use them as primary (more likely to have accurate unavailable time)
        // If not, use vehicle stats.
        // We do NOT sum them together anymore.
        const primaryStats = driverStats || vehicleStats;
        if (primaryStats) {
            // Assign to the tracking variables for legacy compatibility if needed, 
            // though we construct the object directly below.
            return {
                ...primaryStats,
                driverStats,
                vehicleStats
            };
        }
    } 
    
    // PRIORITY 2: Legacy Files (Reconstruction) - Only run if no Time files found
    // (This block remains largely the same, but we wrap it to ensure we don't mix logic)
    if (!foundPerformance) {
        for (const file of files) {
            if (file.type === 'uber_vehicle_performance') {
                foundPerformance = true;
                file.rows.forEach(row => {
                     const getValRaw = (keys: string[]) => {
                         // 1. Exact match
                         for (const k of keys) {
                              if (row[k] !== undefined) return String(row[k]);
                         }
                         // 2. Partial match (Robust)
                         const rowKeys = Object.keys(row);
                         for (const k of keys) {
                             if (k === 'Hours') continue;
                             const found = rowKeys.find(rk => rk.toLowerCase().includes(k.toLowerCase()));
                             if (found) return String(row[found]);
                         }
                         return '0';
                     };

                     const oh = parseDurationToHours(getValRaw(['Hours Online', 'Online Hours', 'Total Online', 'Time Online', 'Online Duration']));
                     const oth = parseDurationToHours(getValRaw(['Hours On Trip', 'On Trip Hours', 'Time On Trip', 'On Trip Duration']));
                     // Expanded list to catch "Time On Job" which caused the previous failure
                     const hoj = parseDurationToHours(getValRaw(['Hours On Job', 'Hours on Job', 'Job Hours', 'Active Hours', 'Time On Job', 'On Job Duration', 'Active Duration']));

                     sumOnline += oh;
                     sumOnTrip += oth;
                     sumOnJob += hoj;
                });
            } else if (file.type === 'uber_driver_activity') {
                // Treat Driver Activity strictly via Reconstruction Formula
                // "On Job" column is assumed to be missing or unreliable.
                foundPerformance = true;
                file.rows.forEach(row => {
                     const getValRaw = (keys: string[]) => {
                         // 1. Exact match
                         for (const k of keys) {
                              if (row[k] !== undefined) return String(row[k]);
                         }
                         // 2. Partial match (Robust)
                         const rowKeys = Object.keys(row);
                         for (const k of keys) {
                             if (k === 'Hours') continue;
                             const found = rowKeys.find(rk => rk.toLowerCase().includes(k.toLowerCase()));
                             if (found) return String(row[found]);
                         }
                         return '0';
                     };

                     const oh = parseDurationToHours(getValRaw(['Time Online', 'Online Duration', 'Online Hours', 'Hours Online']));
                     const oth = parseDurationToHours(getValRaw(['Time On Trip', 'On Trip Duration', 'On Trip Hours', 'Hours On Trip']));
                     
                     // Phase 2: Find "Time driving to pickup" (To Trip)
                     const toTrip = parseDurationToHours(getValRaw(['Time driving to pickup', 'Time to pickup', 'Driving to Pickup']));

                     // RECONSTRUCTION FORMULA: On Job = On Trip + To Trip
                     // We do NOT search for an "On Job" column here, per user instruction.
                     const hoj = oth + toTrip;

                     sumOnline += oh;
                     sumOnTrip += oth;
                     sumOnJob += hoj;
                     sumToTrip += toTrip;
                });
            }
        }
    }

    // Phase 2 Reconstruction Logic:
    // If On Job is missing (0) BUT we found the components (On Trip + To Trip), reconstruct it.
    if (sumOnJob === 0 && sumOnTrip > 0 && sumToTrip > 0) {
        // Reconstruct On Job = On Trip + To Trip
        // This allows us to support Driver Activity files that have the granular columns but lack the summary column.
        sumOnJob = sumOnTrip + sumToTrip;
        
        // Sanity Check: On Job cannot exceed Online Time
        if (sumOnline > 0 && sumOnJob > sumOnline) {
             console.warn(`[Import] Reconstructed On Job (${sumOnJob.toFixed(2)}) exceeds Online (${sumOnline.toFixed(2)}). Capping at Online.`);
             sumOnJob = sumOnline;
             // Adjust To Trip to fit: To Trip = On Job (Online) - On Trip
             // This is a rough heuristic to keep data sane.
        }
    }

    // STRICT LOGIC: Do not guess sumOnJob if it is still 0 after reconstruction attempt.
    
    if (!foundPerformance || (sumOnJob === 0 && sumOnline === 0 && sumUnavailable === 0)) {
         return { 
            onTripRatio: 1, 
            toTripRatio: 0, 
            availableRatio: 0,
            totalOnlineHours: 0,
            totalOnJobHours: 0,
            totalOnTripHours: 0,
            totalUnavailableHours: 0
        };
    }

    // If sumOnJob is 0 (missing), we cannot calculate ratios correctly relative to Job.
    // However, to prevent divide by zero, we handle it.
    let onTripRatio = 0;
    let toTripRatio = 0;
    let availableRatio = 0;

    if (sumOnJob > 0) {
        onTripRatio = sumOnTrip / sumOnJob;
        // To Trip = Job - Trip
        toTripRatio = (sumOnJob - sumOnTrip) / sumOnJob;
        // Available = Online - Job
        availableRatio = (sumOnline - sumOnJob) / sumOnJob;
    }

    // Ensure no negative ratios if data is slightly dirty
    toTripRatio = Math.max(0, toTripRatio);
    availableRatio = Math.max(0, availableRatio);

    console.log(`[Import] Fleet Stats Calculated (Phase 2): OnTrip=${onTripRatio.toFixed(2)}, ToTrip=${toTripRatio.toFixed(2)}, Available=${availableRatio.toFixed(2)}, Online=${sumOnline.toFixed(2)}, Job=${sumOnJob.toFixed(2)}, Trip=${sumOnTrip.toFixed(2)}, RawToTrip=${sumToTrip.toFixed(2)}`);

    return { 
        onTripRatio, 
        toTripRatio, 
        availableRatio,
        totalOnlineHours: sumOnline,
        totalOnJobHours: sumOnJob,
        totalOnTripHours: sumOnTrip,
        totalUnavailableHours: sumUnavailable
    };
}

// Helper to extract duration for calibration (and potentially main loop)
const calculateTripDurationMinutes = (row: any, isMMDD: boolean): number => {
    let requestTime: string | undefined;
    let dropoffTime: string | undefined;

    // 1. Request Time
    let reqVal = row['Trip request time'] || row['Request Time'] || row['Request time'];
    if (!reqVal) {
        const key = Object.keys(row).find(k => k.toLowerCase().includes('request') && k.toLowerCase().includes('time'));
        if (key) reqVal = row[key];
    }
    if (reqVal) {
        try { 
             const d = parseDateString(String(reqVal), isMMDD);
             if (d) requestTime = d.toISOString(); 
        } catch(e) {}
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
        try { 
            const d = parseDateString(String(dropVal), isMMDD);
            if (d) dropoffTime = d.toISOString(); 
        } catch(e) {}
    }

    // 3. Calc Diff
    if (requestTime && dropoffTime) {
         const start = new Date(requestTime).getTime();
         const end = new Date(dropoffTime).getTime();
         const diff = (end - start) / 60000;
         if (diff >= 0 && diff < 1440) return diff;
    }

    // 4. Fallback Column
    let rawDur = String(row['Trip duration'] || row['Duration (min)'] || row['Duration'] || row['Trip Duration'] || '');
    if (!rawDur) {
         const key = Object.keys(row).find(k => k.toLowerCase().includes('duration'));
         if (key) rawDur = String(row[key]);
    }

    if (rawDur) {
        if (rawDur.includes(':')) {
            const parts = rawDur.split(':').map(Number);
            if (parts.length === 3) return parts[0]*60 + parts[1] + parts[2]/60;
            if (parts.length === 2) return parts[0] + parts[1]/60;
        } else {
            let val = parseFloat(rawDur);
            // Heuristic: If value is > 1000, assume seconds (e.g. 1200 sec = 20 min). 
            // New Heuristic: If value is > 100000, assume milliseconds (e.g. 600000 ms = 10 min).
            const isSeconds = Object.keys(row).some(k => k.toLowerCase().includes('duration') && (k.toLowerCase().includes('sec') || k.toLowerCase().includes('(s)')));
            
            if (val > 100000) {
                 val = val / 60000;
            } else if (isSeconds || val > 1000) {
                val = val / 60;
            }
            return val || 0;
        }
    }

    return 0;
};

function calculateCalibrationDeduction(fleetStats: FleetStats, files: FileData[]): number {
    let rawLogSumMinutes = 0;
    let tripCount = 0;

    files.forEach(file => {
        if (file.type === 'uber_trip') {
            // Date Detection Logic (Duplicated from main loop)
            let isMMDD = true;
            let detected = false;
            for (const row of file.rows.slice(0, 50)) {
                 for (const val of Object.values(row)) {
                     if (typeof val !== 'string') continue;
                     const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
                     if (match) {
                         const p1 = parseInt(match[1]);
                         const p2 = parseInt(match[2]);
                         if (p1 > 12) { isMMDD = false; detected = true; break; } 
                         if (p2 > 12) { isMMDD = true; detected = true; break; }
                     }
                 }
                 if (detected) break;
            }

            file.rows.forEach(row => {
                const dur = calculateTripDurationMinutes(row, isMMDD);
                if (dur > 0) {
                    rawLogSumMinutes += dur;
                    tripCount++;
                }
            });
        }
    });

    if (tripCount === 0) return 0;

    const rawLogSumHours = rawLogSumMinutes / 60;
    
    // THE CORE LOGIC: Compare with Total On Job
    // If Logs > OnJob, we have "Phantom Lag"
    const excessHours = rawLogSumHours - fleetStats.totalOnJobHours;

    if (excessHours > 0) {
        const deductionHoursPerTrip = excessHours / tripCount;
        console.log(`[Calibration] Phantom Lag Detected! Excess=${excessHours.toFixed(2)}h, Trips=${tripCount}, Deduction=${(deductionHoursPerTrip*60).toFixed(2)}m/trip`);
        return deductionHoursPerTrip;
    }

    console.log(`[Calibration] No Phantom Lag. Logs=${rawLogSumHours.toFixed(2)}h, Job=${fleetStats.totalOnJobHours.toFixed(2)}h`);
    return 0;
}

function processFuelData(rows: ParsedRow[], fuelCards: FuelCard[]): FuelEntry[] {
    const entries: FuelEntry[] = [];
    
    rows.forEach(row => {
        // 1. Identify Key Fields
        const getVal = (keys: string[]) => {
             for (const k of keys) {
                  if (row[k] !== undefined) return String(row[k]);
                  const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
                  if (found) return String(row[found]);
             }
             return undefined;
        };

        // Date
        const dateStr = getVal(['Date', 'Transaction Date', 'Time', 'Date/Time']);
        if (!dateStr) return;
        
        let date: Date | null = null;
        try {
            date = parseDateString(dateStr, true); // Default to MM/DD
        } catch (e) {}
        
        if (!date) return;

        // Amount
        const amountStr = getVal(['Amount', 'Total', 'Cost', 'Net Amount', 'Total Cost']);
        if (!amountStr) return;
        const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
        if (isNaN(amount) || amount === 0) return;

        // Volume
        const volStr = getVal(['Volume', 'Liters', 'Gallons', 'Qty', 'Quantity']);
        const liters = volStr ? parseFloat(volStr.replace(/[^0-9.-]/g, '')) : undefined;

        // Price Unit
        const priceStr = getVal(['Price', 'Unit Price', 'PPG', 'PPL']);
        const pricePerLiter = priceStr ? parseFloat(priceStr.replace(/[^0-9.-]/g, '')) : undefined;

        // Card
        const cardNumRaw = getVal(['Card Number', 'Card #', 'Pan', 'Card ID']);
        const cardNum = cardNumRaw ? cardNumRaw.replace(/[^0-9]/g, '') : '';
        
        // Location
        const location = getVal(['Location', 'Site', 'Station', 'Merchant', 'Site Name']);

        // Match Card
        let matchedCard: FuelCard | undefined;
        if (cardNum && fuelCards && fuelCards.length > 0) {
            // Try exact match (last 4 or full)
            matchedCard = fuelCards.find(c => {
                const cleanStored = c.cardNumber.replace(/[^0-9]/g, '');
                return cleanStored.endsWith(cardNum) || cardNum.endsWith(cleanStored);
            });
        }

        const entry: FuelEntry = {
            id: crypto.randomUUID(),
            date: date.toISOString(),
            amount,
            liters,
            pricePerLiter,
            location,
            cardId: matchedCard?.id,
            vehicleId: matchedCard?.assignedVehicleId,
            driverId: matchedCard?.assignedDriverId,
            type: 'Card_Transaction'
        };

        entries.push(entry);
    });

    console.log(`[Import] Processed ${entries.length} fuel entries.`);
    return entries;
}

export function mergeAndProcessData(files: FileData[], availableFields: FieldDefinition[], knownFleetName?: string, fuelCards: FuelCard[] = []): ProcessedBatch {
    const tripMap = new Map<string, Partial<Trip>>();
    /** Trip UUIDs that appeared in Uber `trip_activity` / TRIP_ACTIVITY CSV (not payments-only).
     * Stored in lower-case for case-insensitive matching with `payments_transaction` Trip UUIDs.
     */
    const uberTripActivityTripIds = new Set<string>();
    const genericTrips: Trip[] = [];
    const driverMetricsMap = new Map<string, DriverMetrics>();
    const uberStatementsByDriverId = new Map<string, UberSsotTotals>();
    const vehicleMetrics: VehicleMetrics[] = [];
    const rentalContracts: RentalContract[] = [];
    const organizationMetrics: OrganizationMetrics[] = [];
    const fuelEntries: FuelEntry[] = [];
    const driverTimeData: DriverTimeDistance[] = [];
    const vehicleTimeData: VehicleTimeDistance[] = [];
    let organizationName = knownFleetName || ''; // Phase 1: Track Fleet Owner Name
    const disputeRefundsMap = new Map<string, DisputeRefund>(); // Dispute Refund: keyed by supportCaseId for dedup
    
    // Phase 2: Calculate Global Fleet Stats for Static Reconstruction
    const fleetStats = calculateFleetStats(files);

    // Phase 3: Dynamic Auto-Calibration (Phantom Lag Calculation)
    // CHECK: Do we have trusted Time & Distance files?
    const hasTrustedTimeData = files.some(f => f.type === 'uber_driver_time_distance' || f.type === 'uber_vehicle_time_distance');
    
    // If we have trusted data, we skip calibration (force 0). 
    // Otherwise, we run the legacy calibration logic.
    const deductionPerTrip = hasTrustedTimeData ? 0 : calculateCalibrationDeduction(fleetStats, files);

    // Phase 6: Cross-File Verification Accumulators
    let sumVehicleCash = 0; // From Vehicle Performance Report
    let sumDriverCash = 0;  // From Driver Payments Report

    // Phase 6.1: Determine Batch Date (Fallback for files missing explicit dates)
    const batchFallbackDate = files.find(f => f.reportDate)?.reportDate || new Date().toISOString();

    // Pre-populate `trip_activity` Trip UUIDs BEFORE any `payments_transaction` merge.
    // If `uber_payment` runs first in `files` order, `uberTripActivityTripIds` was still empty,
    // so every `trip fare adjust order` row was misclassified as prior-period adjustment
    // (e.g. all 8 rows ≈ $3,688.70; Tips stayed $0). Upload order must not affect classification.
    for (const file of files) {
        if (file.type !== 'uber_trip') continue;
        for (const row of file.rows) {
            const tid = cleanId(row['Trip UUID'] || row['trip uuid']);
            if (tid) uberTripActivityTripIds.add(String(tid).toLowerCase());
        }
    }

    // Map to hold VehicleMetrics to avoid duplicates and allow merging
    // We didn't have this before (we just pushed to array), but we need it for merging Time & Distance data
    // with potentially existing Performance data (though usually they are separate files/rows).
    // Given the structure, we can just push to vehicleMetrics array if we treat them as separate entries,
    // OR we can try to merge. Since `vehicleMetrics` is an array in the output, let's keep it simple
    // but we need a way to look them up if we want to merge data from multiple files for the same vehicle/period.
    // For now, we'll just create new entries for Time & Distance, similar to how we did for Drivers.
    
    // 1. Process all files
    files.forEach(file => {
        if (file.type === 'uber_driver_time_distance') {
             file.rows.forEach(row => {
                 const dId = cleanId(row['Driver UUID']);
                 if (dId) {
                     // 1. Populate Array for Fleet Stats
                     driverTimeData.push({
                         driverUuid: dId,
                         openTime: parseHHMMSS(String(row['Open Time'])),
                         enrouteTime: parseHHMMSS(String(row['Enroute Time'])),
                         onTripTime: parseHHMMSS(String(row['On Trip Time'])),
                         unavailableTime: parseHHMMSS(String(row['Unavailable Time'])),
                         openDistance: parseFloat(String(row['Open Distance'] || 0)),
                         enrouteDistance: parseFloat(String(row['Enroute Distance'] || 0)),
                         onTripDistance: parseFloat(String(row['On Trip Distance'] || 0)),
                         unavailableDistance: parseFloat(String(row['Unavailable Distance'] || 0))
                     });

                     // 2. Populate DriverMetrics (for Individual Driver Detail View)
                     const current = driverMetricsMap.get(dId) || {
                         id: `dm-dist-${dId}-${Math.random()}`,
                         driverId: dId,
                         driverName: extractDriverName(row) || 'Unknown Driver',
                         periodStart: safeDateISO(file.reportDate) || batchFallbackDate,
                         periodEnd: safeDateISO(file.reportDate) || batchFallbackDate,
                         acceptanceRate: 0, cancellationRate: 0, completionRate: 0,
                         ratingLast500: 0, ratingLast4Weeks: 0,
                         onlineHours: 0, onTripHours: 0, tripsCompleted: 0,
                         dataSources: []
                     };
                     
                     // Add Source
                     if (!current.dataSources) current.dataSources = [];
                     if (!current.dataSources.includes('time_distance')) current.dataSources.push('time_distance');

                     // Populate Fields
                     current.openTime = parseHHMMSS(String(row['Open Time']));
                     current.enrouteTime = parseHHMMSS(String(row['Enroute Time']));
                     current.onTripHours = parseHHMMSS(String(row['On Trip Time'])); // Sync with standard field
                     current.unavailableTime = parseHHMMSS(String(row['Unavailable Time']));
                     
                     current.openDistance = parseFloat(String(row['Open Distance'] || 0));
                     current.enrouteDistance = parseFloat(String(row['Enroute Distance'] || 0));
                     current.onTripDistance = parseFloat(String(row['On Trip Distance'] || 0));
                     current.unavailableDistance = parseFloat(String(row['Unavailable Distance'] || 0));

                     // Update Total Online Hours (Open + Enroute + OnTrip)
                     current.onlineHours = current.openTime + current.enrouteTime + current.onTripHours;

                     driverMetricsMap.set(dId, current);
                 }
            });
            return;
        }

        if (file.type === 'uber_vehicle_time_distance') {
             file.rows.forEach(row => {
                 const vId = cleanId(row['Vehicle UUID']);
                 if (vId) {
                     // 1. Populate Array for Fleet Stats
                     vehicleTimeData.push({
                         vehicleUuid: vId,
                         vehiclePlate: String(row['Vehicle License Plate'] || ''),
                         openTime: parseHHMMSS(String(row['Open Time'])),
                         enrouteTime: parseHHMMSS(String(row['Enroute Time'])),
                         onTripTime: parseHHMMSS(String(row['On Trip Time'])),
                         unavailableTime: parseHHMMSS(String(row['Unavailable Time'])),
                         openDistance: parseFloat(String(row['Open Distance'] || 0)),
                         enrouteDistance: parseFloat(String(row['Enroute Distance'] || 0)),
                         onTripDistance: parseFloat(String(row['On Trip Distance'] || 0)),
                         unavailableDistance: parseFloat(String(row['Unavailable Distance'] || 0))
                     });

                     // 2. Populate VehicleMetrics
                     // We create a new metric entry for this report.
                     const openTime = parseHHMMSS(String(row['Open Time']));
                     const enrouteTime = parseHHMMSS(String(row['Enroute Time']));
                     const onTripTime = parseHHMMSS(String(row['On Trip Time']));
                     
                     vehicleMetrics.push({
                         id: `vm-dist-${vId}-${Math.random()}`,
                         vehicleId: vId,
                         plateNumber: String(row['Vehicle License Plate'] || 'Unknown'),
                         vehicleName: 'Unknown Vehicle', // Not in this report
                         periodStart: safeDateISO(file.reportDate) || batchFallbackDate,
                         periodEnd: safeDateISO(file.reportDate) || batchFallbackDate,
                         
                         // Standard Fields
                         totalEarnings: 0,
                         earningsPerHour: 0,
                         tripsPerHour: 0,
                         totalTrips: 0,
                         
                         // Time Metrics
                         onlineHours: openTime + enrouteTime + onTripTime,
                         onTripHours: onTripTime,
                         openTime: openTime,
                         enrouteTime: enrouteTime,
                         unavailableTime: parseHHMMSS(String(row['Unavailable Time'])),
                         
                         // Distance Metrics
                         openDistance: parseFloat(String(row['Open Distance'] || 0)),
                         enrouteDistance: parseFloat(String(row['Enroute Distance'] || 0)),
                         onTripDistance: parseFloat(String(row['On Trip Distance'] || 0)),
                         unavailableDistance: parseFloat(String(row['Unavailable Distance'] || 0))
                     });
                 }
            });
            return;
        }

        if (file.type === 'fuel_statement') {
             const entries = processFuelData(file.rows, fuelCards);
             fuelEntries.push(...entries);
             return;
        }

        if (file.type === 'generic') {
            // Process generic files immediately as standalone trips
            // Priority: 1. AI Custom Mapping, 2. Auto-Detect
            const mapping = file.customMapping ? (file.customMapping as unknown as CsvMapping) : detectMapping(file.headers, availableFields);
            const processed = processData(file.rows, mapping, availableFields);
            processed.forEach(t => {
                if (t.driverId === 'fleet-org-ignore') return; // Filter out Fleet Org trips

                // Step 4: "No ID, No Entry" Rule
                // If we have a Driver Name but NO Driver UUID, strictly discard the row.
                // This prevents Organization files (which have names but no Driver UUIDs) from creating ghost drivers.
                if (t.driverName && (!t.driverId || t.driverId === 'unknown' || t.driverId === '')) return;

                genericTrips.push(t);
            });
            return;
        }

        // Process Uber Files
        // Phase 6: Detect Date Format (MM/DD vs DD/MM)
        // Default to MM/DD (US) as it's most common for Uber, but switch if we see DD > 12 in first position
        let isMMDD = true; 
        if (file.type === 'uber_trip' || file.type === 'uber_payment') {
             let detected = false;
             for (const row of file.rows.slice(0, 50)) {
                 for (const val of Object.values(row)) {
                     if (typeof val !== 'string') continue;
                     // Look for NN/NN/NNNN pattern
                     const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4}|\d{2})/);
                     if (match) {
                         const p1 = parseInt(match[1]);
                         const p2 = parseInt(match[2]);
                         if (p1 > 12) { isMMDD = false; detected = true; break; } // 14/12 -> DD/MM
                         if (p2 > 12) { isMMDD = true; detected = true; break; }  // 12/14 -> MM/DD
                     }
                 }
                 if (detected) break;
             }
        }

        file.rows.forEach(row => {
             // ... existing trip logic ...
             if (file.type === 'uber_trip' || file.type === 'uber_payment') {
                // Excel SUM(L): every row in payments_transaction, regardless of Trip UUID (statement-level).
                if (file.type === 'uber_payment') {
                    // Lowercase UUID so this merges with payments_driver rows (they use .toLowerCase()).
                    const driverIdForCashSum = cleanId(row['Driver UUID'] || row['driver uuid'] || '').toLowerCase();
                    if (driverIdForCashSum && driverIdForCashSum !== FLEET_ORG_UUID) {
                        const parseCurrencyCashSum = (val: unknown) =>
                            parseFloat(String(val || '0').replace(/[^0-9.-]/g, '')) || 0;
                        const cashColRaw =
                            row['Paid to you : Trip balance : Payouts : Cash Collected'] ||
                            row['Paid to you:Trip balance:Payouts:Cash Collected'] ||
                            row['Cash Collected'] ||
                            row['Cash collected'] ||
                            '0';
                        const cashCell = parseCurrencyCashSum(cashColRaw);
                        const dmCash = driverMetricsMap.get(driverIdForCashSum) || {
                            id: `dm-ptx-${driverIdForCashSum}-${Math.random()}`,
                            driverId: driverIdForCashSum,
                            driverName: 'Unknown Driver',
                            periodStart: safeDateISO(file.reportDate) || batchFallbackDate,
                            periodEnd: safeDateISO(file.reportDate) || batchFallbackDate,
                            acceptanceRate: 0,
                            cancellationRate: 0,
                            completionRate: 0,
                            ratingLast500: 0,
                            ratingLast4Weeks: 0,
                            onlineHours: 0,
                            onTripHours: 0,
                            tripsCompleted: 0,
                            dataSources: [] as string[],
                        };
                        if (!dmCash.dataSources) dmCash.dataSources = [];
                        if (!dmCash.dataSources.includes('payment_transaction_cash_sum')) {
                            dmCash.dataSources.push('payment_transaction_cash_sum');
                        }
                        dmCash.uberPaymentsTransactionCashColumnSum =
                            (dmCash.uberPaymentsTransactionCashColumnSum || 0) + cashCell;
                        const nm = extractDriverName(row, UBER_SCHEMAS.PAYMENTS_ORDER.mapping);
                        if (nm && nm !== 'Unknown Driver') dmCash.driverName = nm;
                        driverMetricsMap.set(driverIdForCashSum, dmCash);
                    }
                }

                const tripId = cleanId(row['Trip UUID'] || row['trip uuid']);

                // ── Dispute Refund Extraction ──
                // Support Adjustment rows in payments_transaction CSV have NO Trip UUID
                // but contain a refund amount in the Toll column. Capture these before skipping.
                if (!tripId && file.type === 'uber_payment') {
                    const desc = String(row['Description'] || '');
                    const isSupportAdj = desc.startsWith('Support Adjustment');
                    if (isSupportAdj) {
                        const parseCurrencyLocal = (val: any) => parseFloat(String(val || '0').replace(/[^0-9.-]/g, '')) || 0;
                        const tollRefundAmt = parseCurrencyLocal(row['Paid to you:Trip balance:Refunds:Toll'] || row['Paid to you : Trip balance : Refunds : Toll']);
                        // Only capture if there's an actual toll refund amount
                        if (tollRefundAmt !== 0) {
                            // Extract support case UUID from description
                            // Format: "Support Adjustment:  <UUID>" or "Support Adjustment: <UUID>"
                            const supportCaseId = desc.replace(/^Support Adjustment:\s*/i, '').trim() || `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            
                            // Dedup by supportCaseId within this import session
                            if (!disputeRefundsMap.has(supportCaseId)) {
                                const driverId = String(row['Driver UUID'] || row['driver uuid'] || '').trim();
                                const firstName = String(row['Driver first name'] || row['Driver First Name'] || '').trim();
                                const lastName = String(row['Driver last name'] || row['Driver Last Name'] || '').trim();
                                const driverName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Driver';
                                
                                // Extract date
                                let refundDate = '';
                                if (row['vs reporting']) {
                                    try { refundDate = new Date(String(row['vs reporting'])).toISOString(); } catch(e) {}
                                }
                                if (!refundDate) {
                                    const dateKeys = ['Trip request time', 'Request Time', 'Date/Time', 'Date', 'Time'];
                                    for (const k of dateKeys) {
                                        if (row[k]) {
                                            try {
                                                const d = parseDateString(String(row[k]), isMMDD);
                                                if (d && !isNaN(d.getTime())) { refundDate = d.toISOString(); break; }
                                            } catch(e) {}
                                        }
                                    }
                                }
                                if (!refundDate) refundDate = new Date().toISOString();

                                const refund: DisputeRefund = {
                                    id: `dr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                                    supportCaseId,
                                    amount: Math.abs(tollRefundAmt),
                                    date: refundDate,
                                    driverId,
                                    driverName,
                                    platform: 'Uber',
                                    source: 'platform_import',
                                    status: 'unmatched',
                                    matchedTollId: null,
                                    matchedClaimId: null,
                                    importedAt: new Date().toISOString(),
                                    resolvedAt: null,
                                    resolvedBy: null,
                                    rawDescription: desc,
                                };
                                disputeRefundsMap.set(supportCaseId, refund);
                                console.log(`[Import] Captured dispute refund: ${supportCaseId} → $${Math.abs(tollRefundAmt).toFixed(2)} for driver ${driverName} (${driverId})`);
                            }
                        }
                    }
                    return; // Still skip tripMap for rows with no Trip UUID
                }

                if (!tripId) return; 

                const current = tripMap.get(tripId) || { id: tripId, platform: 'Uber' };
                
                if (file.type === 'uber_trip') {
                    uberTripActivityTripIds.add(String(tripId).toLowerCase());
                    const schema = UBER_SCHEMAS.TRIP_ACTIVITY.mapping;
                    
                    // Improved Date Parsing: Don't default to Now() immediately
                    if (row[schema.date]) {
                         try { 
                             const d = parseDateString(String(row[schema.date]), isMMDD);
                             if (d && !isNaN(d.getTime())) current.date = d.toISOString();
                         } catch(e) { }
                    }

                    // Fallback Date Search if schema failed
                    if (!current.date) {
                         const dateKeys = ['Trip request time', 'Request Time', 'Date', 'Time', 'Trip Date', 'Begin Trip Time'];
                         for (const k of dateKeys) {
                             if (row[k]) {
                                 try {
                                     const d = parseDateString(String(row[k]), isMMDD);
                                     if (d && !isNaN(d.getTime())) {
                                         current.date = d.toISOString();
                                         break;
                                     }
                                 } catch(e) {}
                             }
                         }
                    }

                    // Final Fallback: Use File Report Date or leave undefined (don't force Today)
                    if (!current.date && file.reportDate) {
                        current.date = file.reportDate;
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
                        
                        // Capture raw status for detailed breakdown
                        if (s.includes('cancel') || s.includes('failed')) {
                             current.cancellationReason = s;
                        }

                        if (s.includes('cancel')) current.status = 'Cancelled';
                        else if (s.includes('failed')) current.status = 'Cancelled';
                        else if (s.includes('complet')) current.status = 'Completed';
                        else current.status = 'Processing';
                    }

                    // Extract Service Type
                    if (row['Product Type']) current.serviceType = String(row['Product Type']);
                    else current.serviceType = 'UberX'; 

                    const payType = mapUberTripActivityPaymentType(readUberCsvPaymentTypeCell(row));
                    if (payType) current.paymentMethod = payType;

                    // Robust Time Extraction (Dynamic Column Search)
                    // 1. Request Time
                    let reqVal = row['Trip request time'] || row['Request Time'] || row['Request time'];
                    if (!reqVal) {
                        const key = Object.keys(row).find(k => k.toLowerCase().includes('request') && k.toLowerCase().includes('time'));
                        if (key) reqVal = row[key];
                    }
                    if (reqVal) {
                        try { 
                             const d = parseDateString(String(reqVal), isMMDD);
                             if (d) current.requestTime = d.toISOString(); 
                        } catch(e) {}
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
                        try { 
                            const d = parseDateString(String(dropVal), isMMDD);
                            if (d) current.dropoffTime = d.toISOString(); 
                        } catch(e) {}
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
                    
                    // Phase 2: Static Reconstruction of Time Metrics
                    const rawDurationHours = current.duration / 60;
                    
                    // Phase 3: Apply Dynamic Auto-Calibration (Phantom Lag Deduction)
                    // We deduct the "lag" from the raw duration to get the "True Job Time"
                    const trueJobTime = Math.max(0, rawDurationHours - deductionPerTrip);

                    current.onTripHours = trueJobTime * fleetStats.onTripRatio;
                    current.toTripHours = trueJobTime * fleetStats.toTripRatio;
                    current.availableHours = trueJobTime * fleetStats.availableRatio;
                    
                    // Phase 4: Data Integrity Check
                    // Ensure totalHours never exceeds 24 hours for a single trip (sanity check)
                    let rawTotal = (current.onTripHours || 0) + (current.toTripHours || 0) + (current.availableHours || 0);
                    
                    if (rawTotal > 24) {
                         const scale = 24 / rawTotal;
                         if (current.onTripHours) current.onTripHours *= scale;
                         if (current.toTripHours) current.toTripHours *= scale;
                         if (current.availableHours) current.availableHours *= scale;
                         rawTotal = 24;
                    }

                    current.totalHours = rawTotal;
                    
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

                    // Phase 4: Extract Date from Payment Rows (if available)
                    if (!current.date) {
                         // Common Payment Date Columns
                         const dateKeys = ['Trip request time', 'Request Time', 'Date/Time', 'Date', 'Time', 'Trip Date', 'Job Date'];
                         for (const k of dateKeys) {
                             // Check exact match or case-insensitive match
                             let val = row[k];
                             if (!val) {
                                 const foundKey = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
                                 if (foundKey) val = row[foundKey];
                             }
                             
                             if (val) {
                                 try {
                                     const d = parseDateString(String(val), isMMDD);
                                     if (d && !isNaN(d.getTime())) {
                                         current.date = d.toISOString();
                                         break;
                                     }
                                 } catch(e) {}
                             }
                         }
                    }

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
                    
                    // Option 2: The Ledger Method - Extracting 'Paid to you : Trip balance : Payouts : Cash Collected'
                    // We extract the RAW signed value to handle corrections properly (Summing signed values).
                    // "The result will be a negative number... You must multiply the result by -1"
                    let cashVal = row['Paid to you : Trip balance : Payouts : Cash Collected'] || row['Paid to you:Trip balance:Payouts:Cash Collected'] || row['Cash Collected'] || row['Cash collected'] || '0';
                    
                    let earnings = parseCurrency(earningsVal);
                    const netPayoutRaw = parseCurrency(netPayoutVal);
                    
                    // Keep sign for aggregation (usually negative: -10.00). Corrections might be positive.
                    const cash = parseCurrency(cashVal); 

                    // FIX for Zero-Earnings Rows (Adjustments/Tips)
                    // If "Your earnings" is 0, but "Paid to you" has value:
                    // 1. If it's a TIP -> It IS new Gross Revenue. Add it.
                    // 2. If it's a FARE ADJUSTMENT (like the $418.44 case) -> It is likely a Net Payout correction, NOT new Gross Revenue.
                    //    We should NOT add it to 'amount' (Gross), but we SHOULD add it to 'netTransaction' (Payout).
                    
                    // Check the dedicated Tip column (not just Description) for tip detection
                    const tipColumnVal = parseCurrency(row['Paid to you:Your earnings:Tip'] || row['Paid to you : Your earnings : Tip']);
                    /**
                     * Uber app: "Adjustments from previous periods" vs real tips.
                     *
                     * Heuristic used for this import:
                     * - If this is a `trip fare adjust order` row and the Trip UUID does NOT
                     *   exist in Uber `trip_activity` exports, treat it as "prior-period adjustment".
                     * - Otherwise, treat the Tip column as real tips (extra gratuity).
                     */
                    const isUberFareAdjustOrderRow = isUberTripFareAdjustOrderDescription(row['Description']);
                    const tripInUberTripActivity =
                        !!tripId && uberTripActivityTripIds.has(String(tripId).toLowerCase());
                    const isPriorPeriodFareAdjust = isUberFareAdjustOrderRow && !tripInUberTripActivity;

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

                         if (isPriorPeriodFareAdjust) {
                             // Prior-period credits: treat like other inflow to gross for the trip total
                             addToGross = netPayoutRaw;
                             addToNet = netPayoutRaw;
                         } else if (desc.includes('tip') || tipColumnVal !== 0) {
                             // Tips are new revenue
                             addToGross = netPayoutRaw;
                             addToNet = netPayoutRaw;
                         } else {
                             // Adjustments (e.g. legacy fare adjust) are usually Payout corrections, not new Revenue volume.
                             // Do NOT add to Gross. Only Net.
                             addToGross = 0; 
                             addToNet = netPayoutRaw;
                         }
                    }

                    // Step 2.1 Calculations - ACCUMULATE
                    current.amount = (current.amount || 0) + addToGross; // Gross Accumulation
                    current.grossEarnings = (current.grossEarnings || 0) + addToGross;

                    // Phase 2 (Uber SSOT canonical decomposition): populate per-trip fare vs tip components
                    // from `payments_transaction.csv` rows. This is additive-only and does not change
                    // the existing `amount` / `netPayout` behavior yet.
                    const ssotLine = parseUberPaymentTransactionSsotLine(row as Record<string, unknown>);
                    // For prior-period adjustments, do not count the Tip column into tip buckets.
                    current.uberTips = (current.uberTips || 0) + (isPriorPeriodFareAdjust ? 0 : (ssotLine.tips || 0));
                    current.uberFareComponents = (current.uberFareComponents || 0) + (ssotLine.fareComponents || 0);
                    if (isPriorPeriodFareAdjust) {
                        const priorAmt =
                            tipColumnVal !== 0
                                ? tipColumnVal
                                : earnings !== 0
                                  ? earnings
                                  : Math.abs(netPayoutRaw);
                        current.uberPriorPeriodAdjustment = (current.uberPriorPeriodAdjustment || 0) + priorAmt;
                    }
                    if (!isPriorPeriodFareAdjust && (ssotLine.fareComponents !== 0 || ssotLine.tips !== 0)) {
                        const farePlusTips = (ssotLine.fareComponents || 0) + (ssotLine.tips || 0);
                        const tolerance = 0.05; // export rounding differences
                        const rowMatches = Math.abs(farePlusTips - earnings) <= tolerance;
                        current.uberSsotFarePlusTipsMatch =
                            current.uberSsotFarePlusTipsMatch === undefined
                                ? rowMatches
                                : current.uberSsotFarePlusTipsMatch && rowMatches;
                    }
                    
                    // Sum signed cash across all payment rows for this trip, then use magnitude only where needed.
                    // Per-row Math.abs() was wrong: adjustment rows (e.g. fare adjust) offset completed-row cash;
                    // abs-after-each-row inflated totals vs Uber's payments_driver statement.
                    current.cashCollected = (current.cashCollected || 0) + cash;
                    const cashMag = Math.abs(current.cashCollected);
                    // Tag payment method: any non-zero net cash activity → Cash; else map from trip_activity-style cell
                    if (cashMag > 0.0001) current.paymentMethod = 'Cash';
                    else {
                      const fromRow = mapUberTripActivityPaymentType(readUberCsvPaymentTypeCell(row));
                      if (fromRow) current.paymentMethod = fromRow;
                    }
                    current.netTransaction = (current.netTransaction || 0) + addToNet;
                    
                    current.payouts = current.netTransaction;
                    const totalEarnings = current.amount || 0;
                    const totalCash = cashMag;
                    current.cashPercentage = totalEarnings !== 0 ? (totalCash / totalEarnings) * 100 : 0;

                    // Detailed Financial Breakdown (New Requirement) - Accumulate
                    const existingBreakdown = current.fareBreakdown || { baseFare: 0, tips: 0, waitTime: 0, surge: 0, airportFees: 0, timeAtStop: 0, taxes: 0 };
                    
                    current.fareBreakdown = {
                        baseFare: existingBreakdown.baseFare + parseCurrency(row['Paid to you:Your earnings:Fare:Fare']),
                        tips: existingBreakdown.tips + (isPriorPeriodFareAdjust ? 0 : tipColumnVal),
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
                    if (isPriorPeriodFareAdjust) type = 'Prior Period Adjustment';
                    else if (desc.includes('adjustment')) type = 'Fare Adjustment';
                    else if (desc.includes('tip') || tipColumnVal !== 0) type = 'Tip';
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
                    const tips = parseFloat(
                        String(row['Total Earnings:Tip'] || row['Total Earnings : Tip'] || '0').replace(/[^0-9.-]/g, '')
                    ) || 0;
                    const promotions = parseFloat(
                        String(
                            row['Total Earnings : Promotions'] ||
                            row['Total Earnings:Promotions'] ||
                            row['Total Earnings : Promotion'] ||
                            row['Total Earnings:Promotion'] ||
                            '0'
                        ).replace(/[^0-9.-]/g, '')
                    ) || 0;
                     const cashCollected =
                         parseFloat(
                             String(
                                 row['Payouts : Cash Collected'] ||
                                     row['Payouts: Cash Collected'] ||
                                     row['Cash Collected'] ||
                                     row['Cash collected'] ||
                                     '0',
                             ).replace(/[^0-9.-]/g, ''),
                         ) || 0;
                     
                     current.totalEarnings = (current.totalEarnings || 0) + totalEarnings;
                     current.refundsAndExpenses = (current.refundsAndExpenses || 0) + refundsAndExpenses;
                     current.cashCollected = (current.cashCollected || 0) + cashCollected;

                    // Phase 2: store canonical statement SSOT totals for later reconciliation/ledger generation.
                    // These are statement-level (period) totals per driver from `payments_driver.csv`.
                    const ssotStatement = parseUberDriverStatementSsot({
                        'Total Earnings': totalEarnings,
                        'Total Earnings:Tip': row['Total Earnings:Tip'] ?? row['Total Earnings : Tip'] ?? tips,
                        'Total Earnings : Promotions':
                            row['Total Earnings : Promotions'] ??
                            row['Total Earnings:Promotions'] ??
                            promotions,
                        'Refunds & Expenses': row['Refunds & Expenses'] ?? row['Refunds'] ?? refundsAndExpenses,
                        'Total Earnings : Net Fare': row['Total Earnings : Net Fare'],
                        'Total Earnings:Net Fare': row['Total Earnings:Net Fare'],
                    } as UberDriverStatementRow);

                    const prevSsot = uberStatementsByDriverId.get(driverId);
                    if (!prevSsot) {
                        uberStatementsByDriverId.set(driverId, { ...ssotStatement });
                    } else {
                        uberStatementsByDriverId.set(driverId, {
                            periodEarningsGross: prevSsot.periodEarningsGross + ssotStatement.periodEarningsGross,
                            fareComponents: prevSsot.fareComponents + ssotStatement.fareComponents,
                            statementNetFare:
                                (prevSsot.statementNetFare ?? prevSsot.fareComponents) +
                                ssotStatement.statementNetFare,
                            promotions: prevSsot.promotions + ssotStatement.promotions,
                            tips: prevSsot.tips + ssotStatement.tips,
                            refundsAndExpenses: prevSsot.refundsAndExpenses + ssotStatement.refundsAndExpenses,
                            netEarnings:
                                (prevSsot.periodEarningsGross + ssotStatement.periodEarningsGross) -
                                (prevSsot.refundsAndExpenses + ssotStatement.refundsAndExpenses),
                        });
                    }
                     
                     // Calculations Step 2.2
                     current.netEarnings = current.totalEarnings - current.refundsAndExpenses;
                     current.cashFlowRisk = (current.totalEarnings > 0 && (current.cashCollected / current.totalEarnings) > 0.3) ? 'HIGH' : 'OK';
                     current.expenseRatio = current.totalEarnings !== 0 ? (current.refundsAndExpenses / current.totalEarnings) * 100 : 0;

                     driverMetricsMap.set(driverId, current);
                 }
             }

             else if (file.type === 'uber_payment_org') {
                 // Phase 3: Strict Organization Parsing
                 // Verified Isolation - This block strictly updates OrganizationMetrics and does NOT touch DriverMetrics.
                 
                 // 1. Organization Name Extraction
                 const extractedOrgName = String(row['Organization Name'] || row['Organization'] || row['Account Name'] || row['Organization Description'] || '').trim();
                 if (extractedOrgName && !organizationName) organizationName = extractedOrgName;

                 // Helper for case-insensitive and fuzzy lookup
                 const getValue = (keys: string[]) => {
                     // 1. Exact match
                     for (const k of keys) {
                         if (row[k] !== undefined) return row[k];
                     }
                     
                     // 2. Fuzzy match (normalize header: lowercase + remove non-alphanumeric)
                     const normalize = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
                     const rowKeys = Object.keys(row);
                     
                     for (const k of keys) {
                         const searchNorm = normalize(k);
                         // Find a header that "contains" the search term (to handle "Payouts: Cash Collected (USD)")
                         // OR exact normalized match
                         const match = rowKeys.find(rk => {
                             const rowNorm = normalize(rk);
                             return rowNorm === searchNorm || rowNorm.includes(searchNorm);
                         });
                         if (match) return row[match];
                     }
                     return '0';
                 };

                 // 2. Financial Metrics
                 const balanceStart = parseFloat(String(getValue(['Start Of Period Balance', 'Balance Start'])).replace(/[^0-9.-]/g, '')) || 0;
                 const balanceEnd = parseFloat(String(getValue(['End Of Period Balance', 'Balance End'])).replace(/[^0-9.-]/g, '')) || 0;
                 const bankTransfer = parseFloat(String(getValue(['Transferred To Bank Account', 'Bank Transfer'])).replace(/[^0-9.-]/g, '')) || 0;
                 const totalEarnings = parseFloat(String(getValue(['Total Earnings', 'Gross Fares', 'Gross Revenue', 'Gross Earnings'])).replace(/[^0-9.-]/g, '')) || 0;
                 const netFare = parseFloat(String(getValue([
                     'NetFare',
                     'Net Fare',
                     'Total Earnings : Net Fare',
                     'Total Earnings:Net Fare',
                 ])).replace(/[^0-9.-]/g, '')) || 0;
                 const refundsToll = Math.abs(parseFloat(String(getValue([
                     'Refunds & Expenses:Refunds:Toll',
                     'Refunds & Expenses : Refunds : Toll',
                     'Refunds:Refunds:Toll',
                 ])).replace(/[^0-9.-]/g, '')) || 0);
                 
                 // IMPROVED CASH COLLECTION PARSING
                 // We look for specific variations found in Uber reports
                 const cashCollected = Math.abs(parseFloat(String(getValue([
                     'Payouts : Cash Collected', // Standard
                     'Payouts: Cash Collected',  // Colon variation
                     'Payouts Cash Collected',   // No colon
                     'Cash Collected'            // Simple
                 ])).replace(/[^0-9.-]/g, '')) || 0);

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
                     bankTransfer,
                     totalEarnings,
                     netFare,
                     totalCashExposure: cashCollected, // Explicitly store from Summary Report
                     ...(refundsToll > 0.005 ? { refundsToll } : {}),
                     
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
                         periodStart: safeDateISO(row['Period Start'] || row['Start Date'] || row['Date'] || file.reportDate) || new Date().toISOString(),
                         periodEnd: safeDateISO(row['Period End'] || row['End Date'] || row['Date'] || file.reportDate) || new Date().toISOString(),
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
                     const getValLocal = (searchPhrases: string[]) => {
                        // 1. Exact match
                        for (const phrase of searchPhrases) {
                            if (row[phrase] !== undefined) return String(row[phrase]);
                        }
                        // 2. Partial match (Robust)
                        const rowKeys = Object.keys(row);
                        for (const phrase of searchPhrases) {
                            // Skip generic "Hours" to avoid false positives if we use .includes()
                            if (phrase === 'Hours') continue;
                            
                            const foundKey = rowKeys.find(rk => rk.toLowerCase().includes(phrase.toLowerCase()));
                            if (foundKey) return String(row[foundKey]);
                        }
                        return undefined;
                     };

                     const parseDur = (val: string | undefined) => {
                         if (!val) return 0;
                         return parseDurationToHours(val);
                     };

                     const oh = parseDur(getValLocal(['Online Hours', 'Hours Online', 'Time Online', 'Online Duration', 'Online Time']));
                     const oth = parseDur(getValLocal(['On Trip Hours', 'Hours On Trip', 'Time On Trip', 'On Trip Duration', 'Trip Duration']));
                     
                     // Phase 2: Enhanced "To Trip" and "On Job" parsing
                     const ttp = parseDur(getValLocal(['Time driving to pickup', 'Time to pickup', 'Driving to Pickup']));
                     let hoj = parseDur(getValLocal(['Hours On Job', 'Time On Job', 'On Job Duration', 'Active Duration', 'Active Hours']));

                     // Reconstruction Logic
                     if (hoj === 0 && oth > 0 && ttp > 0) {
                         hoj = oth + ttp;
                     }

                     const tc = parseInt(getValLocal(['Trips Completed', 'Finished Trips', 'Total Trips']) || '0') || 0;
                     
                     if (oh > 0) current.onlineHours = oh;
                     if (oth > 0) current.onTripHours = oth;
                     if (hoj > 0) current.hoursOnJob = hoj;
                     if (tc > 0) current.tripsCompleted = tc;
                     
                     // Populate Trip Meter Data
                     const onTrip = current.onTripHours || 0;
                     const totalOnline = current.onlineHours || 0;
                     const onJob = current.hoursOnJob || 0;
                     
                     const toTrip = ttp > 0 ? ttp : Math.max(0, onJob - onTrip);
                     const available = Math.max(0, totalOnline - (onTrip + toTrip));

                     current.tripRatio = {
                         available: available,
                         toTrip: toTrip,
                         onTrip: onTrip,
                         totalOnline: totalOnline
                     };
                     
                     driverMetricsMap.set(driverId, current);
                 }
             }
             
             else if (file.type === 'uber_vehicle_performance') {
                 // Vehicle Metrics Parsing
                 // Spec: "Vehicle Plate Number", "Earnings Per Hour", "Total Trips"
                 
                 const getVal = (keys: string[]) => {
                     // 1. Exact/Trimmed Match
                     for (const k of keys) {
                         if (row[k] !== undefined) return String(row[k]);
                         const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
                         if (found) return String(row[found]);
                     }
                     // 2. Fuzzy Match (Contains)
                     for (const k of keys) {
                         const found = Object.keys(row).find(rk => rk.toLowerCase().includes(k.toLowerCase()));
                         if (found) return String(row[found]);
                     }
                     return '0';
                 };

                 const vId = getVal(['Vehicle UUID', 'Vehicle ID', 'Vehicle Plate Number', 'License Plate']);
                 if (vId && vId !== '0') {
                     // DEBUG: Log headers to verify parser sees them
                     console.log('Parsed Vehicle Headers:', Object.keys(row));

                     const totalEarnings = parseFloat(getVal(['Total Earnings', 'Gross Fares', 'Gross Earnings']).replace(/[^0-9.-]/g, '')) || 0;
                     const onlineHours = parseFloat(getVal(['Online Hours', 'Hours Online', 'Time Online', 'Hours']).replace(/[^0-9.-]/g, '')) || 0;
                     
                     // FIX: Enforce exact casing for Hours On Trip and Hours On Job
                     const onTripHours = parseFloat(getVal(['Hours On Trip', 'Hours on Trip', 'On Trip Hours', 'Time On Trip', 'Trip Hours', 'Time on trip']).replace(/[^0-9.-]/g, '')) || 0;
                     const hoursOnJob = parseFloat(getVal(['Hours On Job', 'Hours on Job', 'Job Hours', 'Time On Job']).replace(/[^0-9.-]/g, '')) || 0;
                     
                     // DEBUG: Log extracted value
                     console.log('Extracted Job Hours:', hoursOnJob, ' | Key used:', 'Hours On Job');

                     let earningsPerHour = parseFloat(getVal(['Earnings Per Hour', 'Earnings / Hour', 'Earnings/Hour']).replace(/[^0-9.-]/g, '')) || 0;
                     
                     // Option 1: The Summary Method (Fastest) - Summing 'Cash Collected'
                     // Note: This is already a positive number in vehicle_performance.csv
                     // Capture Cash for Verification
                     const cashCollected = parseFloat(getVal(['Cash Collected']).replace(/[^0-9.-]/g, '')) || 0;
                     sumVehicleCash += cashCollected;

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
                         plateNumber: getVal(['Vehicle Plate Number', 'License Plate', 'Plate', 'Vehicle']),
                         vehicleName: getVal(['Vehicle Make']) + ' ' + getVal(['Vehicle Model']),
                         periodStart: safeDateISO(getVal(['Period Start', 'Start Date', 'Date']) || file.reportDate) || new Date().toISOString(),
                         periodEnd: safeDateISO(getVal(['Period End', 'End Date', 'Date']) || file.reportDate) || new Date().toISOString(),
                         
                         totalEarnings,
                         earningsPerHour,
                         tripsPerHour: 0,
                         onlineHours,
                         onTripHours,
                         hoursOnJob,
                         totalTrips: parseInt(getVal(['Trips Completed', 'Total Trips', 'Total trips'])) || 0,
                         
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
        const cashCollectedSigned = t.cashCollected || 0;
        const distance = t.distance || 0;
        
        // For the Trip Object (UI), we usually show the magnitude (Absolute).
        // But for internal calculation above (Ledger Sum), we used the signed value from tripMap directly.
        
        const platform = t.platform || 'Other';
        const missingTripActivityInExport =
            platform === 'Uber' &&
            t.id &&
            !uberTripActivityTripIds.has(String(cleanId(t.id)).toLowerCase())
                ? true
                : undefined;

        return {
            id: t.id || `trip-${Math.random()}`,
            date: t.date || new Date().toISOString(),
            amount: amount,
            cashCollected: Math.abs(cashCollectedSigned), // Show positive magnitude in UI
            netPayout: amount + cashCollectedSigned, // Phase 3: Auto-calculate reconciliation (Earnings + (-Cash))
            driverId: t.driverId || 'unknown',
            platform,
            status: t.status || 'Completed',
            // Phase 4: Efficiency Calculation (Requires merging Amount + Distance)
            efficiency: (amount > 0 && distance > 0) ? amount / distance : 0,
            ...t,
            missingTripActivityInExport,
        } as Trip;
    });

    // Phase 4: SSOT allocations (promotions + refunds/expenses) distributed across trips.
    // Uber's `payments_driver.csv` provides statement-level totals, while the ledger is trip-sourced.
    // We distribute those totals across Uber trips proportionally by each trip's gross component.
    const uberStatementKeys = new Set<string>();
    for (const [k] of uberStatementsByDriverId.entries()) uberStatementKeys.add(k);

    const uberDriverGross = new Map<string, number>();
    for (const tr of mergedTrips) {
        // Identify Uber trips by SSOT component presence (Phase 2 output).
        const hasUberComponents = tr.uberFareComponents != null || tr.uberTips != null;
        if (!hasUberComponents) continue;

        const driverKey = cleanId(tr.driverId).toLowerCase();
        if (!uberStatementKeys.has(driverKey)) continue;

        const farePlusTips = (Number(tr.uberFareComponents) || 0) + (Number(tr.uberTips) || 0);
        const gross = farePlusTips > 0 ? farePlusTips : Math.abs(Number(tr.amount) || 0);
        if (gross <= 0) continue;

        uberDriverGross.set(driverKey, (uberDriverGross.get(driverKey) || 0) + gross);
    }

    for (const tr of mergedTrips) {
        const hasUberComponents = tr.uberFareComponents != null || tr.uberTips != null;
        if (!hasUberComponents) continue;

        const driverKey = cleanId(tr.driverId).toLowerCase();
        const statement = uberStatementsByDriverId.get(driverKey);
        if (!statement) continue;

        const farePlusTips = (Number(tr.uberFareComponents) || 0) + (Number(tr.uberTips) || 0);
        const gross = farePlusTips > 0 ? farePlusTips : Math.abs(Number(tr.amount) || 0);
        const totalGross = uberDriverGross.get(driverKey) || 0;

        if (gross <= 0 || totalGross <= 0) {
            tr.uberPromotionsAmount = 0;
            tr.uberRefundExpenseAmount = 0;
            continue;
        }

        const share = gross / totalGross;
        tr.uberPromotionsAmount = (Number(statement.promotions) || 0) * share;
        tr.uberRefundExpenseAmount = (Number(statement.refundsAndExpenses) || 0) * share;
    }

    // Phase 1: Logic Correction (Phantom Trip Filtering)
    const finalizedTrips = mergedTrips.filter(t => {
        const hasMoney = Math.abs(t.amount) > 5;
        const hasDistance = t.distance && t.distance > 0.05;
        if (hasMoney || hasDistance) return true;
        if (t.status === 'Completed') return false;
        return true;
    });

    // --- PHASE 4: DISTANCE METRICS NORMALIZATION (Uniform Average Distribution) ---
    // Distribute aggregate distance components from Time & Distance reports across individual trips.
    // This ensures metrics correctly aggregate in UI tiles (like Distance Metrics in DriverDetail).
    
    // 1. Driver Distribution
    if (driverTimeData.length > 0) {
        // Group totals by driver to handle multiple files/rows for the same driver
        const driverDistTotals = new Map<string, { open: number, enroute: number, unavailable: number }>();
        driverTimeData.forEach(d => {
            const existing = driverDistTotals.get(d.driverUuid) || { open: 0, enroute: 0, unavailable: 0 };
            driverDistTotals.set(d.driverUuid, {
                open: existing.open + (d.openDistance || 0),
                enroute: existing.enroute + (d.enrouteDistance || 0),
                unavailable: existing.unavailable + (d.unavailableDistance || 0)
            });
        });

        // Apply to trips
        driverDistTotals.forEach((totals, driverId) => {
            const driverTrips = finalizedTrips.filter(t => t.driverId === driverId && t.status === 'Completed');
            if (driverTrips.length > 0) {
                const openPerTrip = totals.open / driverTrips.length;
                const enroutePerTrip = totals.enroute / driverTrips.length;
                const unavailablePerTrip = totals.unavailable / driverTrips.length;

                driverTrips.forEach(t => {
                    t.normalizedOpenDistance = openPerTrip;
                    t.normalizedEnrouteDistance = enroutePerTrip;
                    t.normalizedUnavailableDistance = unavailablePerTrip;
                });
                console.log(`[Normalization] Distributed Driver ${driverId} metrics: Enroute=${totals.enroute.toFixed(2)}km across ${driverTrips.length} trips.`);
            }
        });
    }

    // 2. Vehicle Distribution (Fallback/Supplemental)
    // If a trip doesn't have driver-normalized metrics but has a vehicleId, we can use vehicle metrics.
    if (vehicleTimeData.length > 0) {
        const vehicleDistTotals = new Map<string, { open: number, enroute: number, unavailable: number }>();
        vehicleTimeData.forEach(v => {
            const vId = v.vehicleUuid;
            const existing = vehicleDistTotals.get(vId) || { open: 0, enroute: 0, unavailable: 0 };
            vehicleDistTotals.set(vId, {
                open: existing.open + (v.openDistance || 0),
                enroute: existing.enroute + (v.enrouteDistance || 0),
                unavailable: existing.unavailable + (v.unavailableDistance || 0)
            });
        });

        vehicleDistTotals.forEach((totals, vId) => {
            const vehicleTrips = finalizedTrips.filter(t => t.vehicleId === vId && t.status === 'Completed');
            if (vehicleTrips.length > 0) {
                const openPerTrip = totals.open / vehicleTrips.length;
                const enroutePerTrip = totals.enroute / vehicleTrips.length;
                const unavailablePerTrip = totals.unavailable / vehicleTrips.length;

                vehicleTrips.forEach(t => {
                    // Only apply if not already set by driver metrics (Driver > Vehicle for individual details)
                    if (t.normalizedOpenDistance === undefined) t.normalizedOpenDistance = openPerTrip;
                    if (t.normalizedEnrouteDistance === undefined) t.normalizedEnrouteDistance = enroutePerTrip;
                    if (t.normalizedUnavailableDistance === undefined) t.normalizedUnavailableDistance = unavailablePerTrip;
                });
            }
        });
    }

    // --- PHASE 3: CROSS-PROVIDER DUPLICATE DETECTION (Step 3.1) ---
    // Heuristic: Same Driver + Overlapping Request/Dropoff Window = Potential Conflict
    // We sort by requestTime to optimize the scan
    finalizedTrips.sort((a, b) => {
        const timeA = new Date(a.requestTime || a.date).getTime();
        const timeB = new Date(b.requestTime || b.date).getTime();
        return timeA - timeB;
    });

    for (let i = 0; i < finalizedTrips.length; i++) {
        const tripA = finalizedTrips[i];
        if (!tripA.driverId || tripA.driverId === 'unknown') continue;
        
        const startA = new Date(tripA.requestTime || tripA.date).getTime();
        // Assume 20 min duration if dropoffTime is missing for overlap calculation
        const endA = tripA.dropoffTime ? new Date(tripA.dropoffTime).getTime() : startA + (20 * 60000);

        for (let j = i + 1; j < finalizedTrips.length; j++) {
            const tripB = finalizedTrips[j];
            if (!tripB.driverId || tripB.driverId === 'unknown' || tripA.driverId !== tripB.driverId) continue;

            const startB = new Date(tripB.requestTime || tripB.date).getTime();
            const endB = tripB.dropoffTime ? new Date(tripB.dropoffTime).getTime() : startB + (20 * 60000);

            // Temporal Overlap Check
            const hasOverlap = Math.max(startA, startB) < Math.min(endA, endB);
            
            if (hasOverlap) {
                const isCrossProvider = tripA.platform !== tripB.platform;
                console.log(`[Duplicate Audit] Overlap detected for ${tripA.driverId} between ${tripA.platform} and ${tripB.platform}`);
                
                if (!tripA.metadata) tripA.metadata = {};
                if (!tripB.metadata) tripB.metadata = {};
                
                tripA.metadata.isDuplicateCandidate = true;
                tripA.metadata.conflictSource = tripB.id;
                tripA.metadata.conflictProvider = tripB.platform;
                
                tripB.metadata.isDuplicateCandidate = true;
                tripB.metadata.conflictSource = tripA.id;
                tripB.metadata.conflictProvider = tripA.platform;
            }

            // Optimization: If tripB starts more than 2 hours after tripA ends, no more overlaps possible in sorted list
            if (startB > endA + (2 * 3600000)) break;
        }
    }

    // --- AGGREGATE ANALYTICS ---
    const tripAnalytics = {
        geographic: { topPickups: [] as any[], topDropoffs: [] as any[], mostProfitableRoutes: [] as any[] },
        patterns: { avgDistance: 0, avgDuration: 0, peakHours: [] as any[] },
        cancellations: { rate: 0, byHour: [] as any[] }
    };

    if (finalizedTrips.length > 0) {
        // 1. Patterns
        const completedTrips = finalizedTrips.filter(t => t.status === 'Completed');
        const totalDist = completedTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
        const totalDur = completedTrips.reduce((acc, t) => acc + (t.duration || 0), 0);
        
        tripAnalytics.patterns.avgDistance = completedTrips.length ? totalDist / completedTrips.length : 0;
        tripAnalytics.patterns.avgDuration = completedTrips.length ? totalDur / completedTrips.length : 0;

        // Peak Hours
        const hourCounts: Record<number, number> = {};
        finalizedTrips.forEach(t => {
            const h = t.timeOfDay ?? new Date(t.date).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        tripAnalytics.patterns.peakHours = Object.entries(hourCounts)
            .map(([h, c]) => ({ hour: parseInt(h), count: c }))
            .sort((a, b) => b.count - a.count);

        // 2. Geographic
        const areaCounts = (key: 'pickupArea' | 'dropoffArea') => {
            const counts: Record<string, number> = {};
            finalizedTrips.forEach(t => {
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
        const cancelled = finalizedTrips.filter(t => t.status === 'Cancelled').length;
        tripAnalytics.cancellations.rate = (cancelled / finalizedTrips.length) * 100;
        
        const cancelHours: Record<number, number> = {};
        finalizedTrips.filter(t => t.status === 'Cancelled').forEach(t => {
             const h = t.timeOfDay ?? new Date(t.date).getHours();
             cancelHours[h] = (cancelHours[h] || 0) + 1;
        });
        tripAnalytics.cancellations.byHour = Object.entries(cancelHours)
            .map(([h, c]) => ({ hour: parseInt(h), count: c }))
            .sort((a, b) => b.count - a.count);
    }

    const uberTripsMissingTripActivity = finalizedTrips.filter(
        (t) => t.missingTripActivityInExport
    ).length;

    return {
        trips: [...finalizedTrips, ...genericTrips],
        driverMetrics,
        vehicleMetrics,
        rentalContracts,
        organizationMetrics,
        organizationName, // Return extracted name
        tripAnalytics,
        driverTimeData,
        vehicleTimeData,
        uberStatementsByDriverId:
            uberStatementsByDriverId.size > 0
                ? Object.fromEntries(uberStatementsByDriverId.entries())
                : undefined,
        calibrationStats: {
            fleetStats,
            deductionPerTrip,
            phantomLagDetected: deductionPerTrip > 0
        },
        disputeRefunds: Array.from(disputeRefundsMap.values()),
        importWarnings:
            uberTripsMissingTripActivity > 0
                ? { uberTripsMissingTripActivity }
                : undefined,
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
    if (field.key === 'odometer') keywords.push('odometer', 'reading', 'mileage', 'odo', 'end odometer', 'trip_distance');

    const match = findBestMatch(keywords);
    if (match) {
        // ACTION 1: Strict Unmapping for Organization Files
        // If we are looking for a Driver UUID, we must NEVER accept "Organization UUID"
        if (field.key === 'driverId' && match.toLowerCase().includes('organization uuid')) {
             return; // Skip this match
        }
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
        else if (p === 'goride') trip.platform = 'Roam'; // Rebrand: normalize legacy GoRide → Roam
    } else {
        trip.platform = 'Other';
    }

    return trip as Trip;
  });
}

export const exportToCSV = (data: any[], filename: string) => {
  if (!data.length) return;
  // Pre-process: Convert ISO date strings to DD/MM/YYYY (Jamaica standard)
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
  const processed = data.map(row => {
    const newRow: any = {};
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (typeof val === 'string' && isoDateRegex.test(val)) {
        try {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            newRow[key] = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            continue;
          }
        } catch { /* fall through */ }
      }
      newRow[key] = val;
    }
    return newRow;
  });
  const csv = Papa.unparse(processed);
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
    link.setAttribute('download', 'roam_import_template.csv');
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
