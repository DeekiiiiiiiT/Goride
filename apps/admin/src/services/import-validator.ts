import { csvToJson, CsvColumn } from '../utils/csv-helper';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest, Trip } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { FUEL_CSV_COLUMNS, SERVICE_CSV_COLUMNS, ODOMETER_CSV_COLUMNS, CHECKIN_CSV_COLUMNS, TRIP_CSV_COLUMNS } from '../types/csv-schemas';
import { normalizePlatform } from '../utils/normalizePlatform';

// ─── Browser-side timezone helpers (mirrors server-side timezone_helper.tsx) ───

/** Returns true if the string already ends with Z or ±HH:MM */
function hasTzSuffix(s: string): boolean {
    return /[Zz]|[+-]\d{2}:\d{2}$/.test(s);
}

/**
 * Browser-side equivalent of the server's naiveToUtc().
 * Interprets a naive datetime string (no TZ suffix) as being in `timezone`,
 * then returns an ISO-8601 UTC string. Uses Intl.DateTimeFormat for offset lookup.
 *
 * Two-pass DST correction: the first guess might land on the wrong side of a
 * DST boundary, so we re-check the offset at the corrected instant.
 */
function naiveToUtcBrowser(naiveStr: string, timezone: string): string {
    // Parse components: "2026-02-27T14:30:00" or "2026-02-27 14:30:00"
    const cleaned = naiveStr.replace(' ', 'T');
    const parts = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!parts) throw new Error(`Cannot parse naive datetime: "${naiveStr}"`);

    const [, ys, ms, ds, hs = '0', mins = '0', ss = '0'] = parts;
    const y = Number(ys), m = Number(ms) - 1, d = Number(ds);
    const h = Number(hs), min = Number(mins), s = Number(ss);

    // First guess: treat components as UTC
    const guess = new Date(Date.UTC(y, m, d, h, min, s));

    // Find the UTC offset that `timezone` has at this instant
    const getOffset = (instant: Date): number => {
        const utcFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC', hour: 'numeric', minute: 'numeric', hour12: false,
            year: 'numeric', month: 'numeric', day: 'numeric',
        });
        const tzFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, hour: 'numeric', minute: 'numeric', hour12: false,
            year: 'numeric', month: 'numeric', day: 'numeric',
        });

        const parseFmtParts = (fmt: Intl.DateTimeFormat) => {
            const p: Record<string, string> = {};
            for (const { type, value } of fmt.formatToParts(instant)) p[type] = value;
            return p;
        };

        const u = parseFmtParts(utcFmt);
        const t = parseFmtParts(tzFmt);

        const toMin = (p: Record<string, string>) => {
            const dNum = new Date(Number(p.year), Number(p.month) - 1, Number(p.day)).getTime();
            return dNum / 60000 + Number(p.hour) * 60 + Number(p.minute);
        };

        return toMin(t) - toMin(u); // offset in minutes (positive = east of UTC)
    };

    const off1 = getOffset(guess);
    const corrected = new Date(guess.getTime() - off1 * 60000);

    // Two-pass: re-check offset at the corrected time (DST edge case)
    const off2 = getOffset(corrected);
    if (off2 !== off1) {
        return new Date(guess.getTime() - off2 * 60000).toISOString();
    }
    return corrected.toISOString();
}

// --- Types ---

export type ImportType = 'fuel' | 'service' | 'odometer' | 'checkin' | 'trip' | 'driver' | 'vehicle' | 'transaction' | 'tollTag' | 'tollPlaza' | 'station' | 'equipment' | 'inventory' | 'claim';

export interface ValidationResult<T> {
    validRecords: T[];
    errors: ValidationError[];
    totalProcessed: number;
}

export interface ValidationError {
    row: number;
    message: string;
    rawRecord: Record<string, string>;
}

// --- Validation Logic ---

/**
 * Validates a CSV string against the expected schema for the given import type.
 */
export function validateImportFile(content: string, type: ImportType, fleetTimezone?: string): ValidationResult<any> {
    const rawRecords = csvToJson(content);
    const errors: ValidationError[] = [];
    const validRecords: any[] = [];
    
    // Select the correct columns definition based on type
    let columns: CsvColumn<any>[];
    switch (type) {
        case 'fuel': columns = FUEL_CSV_COLUMNS; break;
        case 'service': columns = SERVICE_CSV_COLUMNS; break;
        case 'odometer': columns = ODOMETER_CSV_COLUMNS; break;
        case 'checkin': columns = CHECKIN_CSV_COLUMNS; break;
        case 'trip': columns = TRIP_CSV_COLUMNS; break;
        // Phase 5 types use dedicated validators — columns unused but needed for switch
        case 'driver': columns = []; break;
        case 'vehicle': columns = []; break;
        case 'transaction': columns = []; break;
        // Phase 6 types use dedicated validators
        case 'tollTag': columns = []; break;
        case 'tollPlaza': columns = []; break;
        case 'station': columns = []; break;
        case 'equipment': columns = []; break;
        case 'inventory': columns = []; break;
        case 'claim': columns = []; break;
        default: return { validRecords: [], errors: [{ row: 0, message: 'Invalid import type', rawRecord: {} }], totalProcessed: 0 };
    }

    rawRecords.forEach((record, index) => {
        const rowNum = index + 2; // +1 for 0-index, +1 for header row

        // Trip type uses its own dedicated validator
        if (type === 'trip') {
            const validation = validateTripRecord(record, rowNum, fleetTimezone);
            if (validation.isValid) {
                validRecords.push(validation.record);
            } else {
                errors.push({ row: rowNum, message: validation.error || 'Unknown error', rawRecord: record });
            }
            return;
        }

        // Phase 5: Driver, Vehicle, Transaction use dedicated validators
        if (type === 'driver' || type === 'vehicle' || type === 'transaction') {
            const validation =
                type === 'driver' ? validateDriverRecord(record, fleetTimezone) :
                type === 'vehicle' ? validateVehicleRecord(record, fleetTimezone) :
                validateTransactionRecord(record, fleetTimezone);
            if (validation.isValid) {
                validRecords.push(validation.record);
            } else {
                errors.push({ row: rowNum, message: validation.error || 'Unknown error', rawRecord: record });
            }
            return;
        }

        // Phase 6: Infrastructure entity validators
        const phase6Types: ImportType[] = ['tollTag', 'tollPlaza', 'station', 'equipment', 'inventory', 'claim'];
        if (phase6Types.includes(type)) {
            const validatorMap: Record<string, (r: Record<string, string>, tz?: string) => { isValid: boolean; record?: any; error?: string }> = {
                tollTag: validateTollTagRecord,
                tollPlaza: validateTollPlazaRecord,
                station: validateStationRecord,
                equipment: validateEquipmentRecord,
                inventory: validateInventoryRecord,
                claim: validateClaimRecord,
            };
            const validation = validatorMap[type](record, fleetTimezone);
            if (validation.isValid) {
                validRecords.push(validation.record);
            } else {
                errors.push({ row: rowNum, message: validation.error || 'Unknown error', rawRecord: record });
            }
            return;
        }

        const validation = validateRecord(record, columns, type);

        if (validation.isValid) {
            validRecords.push(validation.record);
        } else {
            errors.push({
                row: rowNum,
                message: validation.error || 'Unknown error',
                rawRecord: record
            });
        }
    });

    // For trips: flag duplicate IDs within the file
    if (type === 'trip') {
        const idSet = new Set<string>();
        const dupeRows: number[] = [];
        validRecords.forEach((r, i) => {
            if (r.id && idSet.has(r.id)) {
                dupeRows.push(i + 2);
            }
            if (r.id) idSet.add(r.id);
        });
        if (dupeRows.length > 0) {
            errors.push({
                row: 0,
                message: `${dupeRows.length} duplicate IDs detected within this file (rows: ${dupeRows.slice(0, 10).join(', ')}${dupeRows.length > 10 ? '...' : ''})`,
                rawRecord: {}
            });
        }
    }

    return {
        validRecords,
        errors,
        totalProcessed: rawRecords.length
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Trip-specific validation (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

/** Flexible date parser: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, ISO 8601 */
function parseFlexibleDate(value: string | undefined | null, fleetTimezone?: string): string | null {
    if (!value || value.trim() === '') return null;
    const v = value.trim();

    // Try ISO / YYYY-MM-DD first
    if (v.includes('-') || v.includes('T')) {
        // If fleet timezone is set and the value has no TZ suffix, use naiveToUtcBrowser
        if (fleetTimezone && !hasTzSuffix(v)) {
            try {
                return naiveToUtcBrowser(v, fleetTimezone);
            } catch {
                // Fall through to Date.parse
            }
        }
        const isoTs = Date.parse(v);
        if (!isNaN(isoTs)) {
            return new Date(isoTs).toISOString();
        }
    }

    // Try DD/MM/YYYY (Jamaica standard)
    const ddMmYyyy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddMmYyyy) {
        const [, d, m, y] = ddMmYyyy;
        if (fleetTimezone) {
            try {
                return naiveToUtcBrowser(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`, fleetTimezone);
            } catch {
                // Fall through
            }
        }
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        if (!isNaN(dt.getTime())) return dt.toISOString();
    }

    // Fallback: let Date.parse try
    const fallback = Date.parse(v);
    if (!isNaN(fallback)) return new Date(fallback).toISOString();

    return null;
}

/** Clean a numeric string: strip $, commas, spaces */
function cleanNumeric(value: string | undefined | null): number | undefined {
    if (!value || value.trim() === '') return undefined;
    const cleaned = value.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
}

function validateTripRecord(
    raw: Record<string, string>,
    _rowNum: number,
    fleetTimezone?: string,
): { isValid: boolean; record?: Partial<Trip>; error?: string } {
    const result: any = {};

    // --- Required: date ---
    const parsedDate = parseFlexibleDate(raw['date'], fleetTimezone);
    if (!parsedDate) {
        return { isValid: false, error: `Missing or invalid date: "${raw['date'] || ''}"` };
    }
    result.date = parsedDate;

    // --- Required: driverId OR driverName ---
    const driverId = (raw['driverId'] || '').trim();
    const driverName = (raw['driverName'] || '').trim();
    if (!driverId && !driverName) {
        return { isValid: false, error: 'Missing both driverId and driverName — at least one is required' };
    }
    if (driverId) result.driverId = driverId;
    if (driverName) result.driverName = driverName;

    // --- Required: amount (earnings) ---
    const amount = cleanNumeric(raw['amount']);
    if (amount === undefined) {
        return { isValid: false, error: `Missing or invalid amount: "${raw['amount'] || ''}"` };
    }
    result.amount = amount;

    // --- Optional string fields ---
    const stringFields = ['id', 'requestTime', 'dropoffTime', 'vehicleId', 'platform',
        'serviceType', 'status', 'pickupLocation', 'dropoffLocation',
        'pickupArea', 'dropoffArea', 'batchId', 'paymentMethod'];
    for (const field of stringFields) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Optional date fields ---
    if (raw['requestTime']) {
        const rt = parseFlexibleDate(raw['requestTime'], fleetTimezone);
        if (rt) result.requestTime = rt;
    }
    if (raw['dropoffTime']) {
        const dt = parseFlexibleDate(raw['dropoffTime'], fleetTimezone);
        if (dt) result.dropoffTime = dt;
    }

    // --- Optional numeric fields ---
    const numericFields = ['grossEarnings', 'netToDriver', 'cashCollected',
        'tollCharges', 'distance', 'duration'];
    for (const field of numericFields) {
        const num = cleanNumeric(raw[field]);
        if (num !== undefined) result[field] = num;
    }

    // --- Fare breakdown columns (baseFare, tips, surge, waitTime, airportFees, taxes) ---
    const breakdownFields = ['baseFare', 'tips', 'surge', 'waitTime', 'airportFees', 'taxes'];
    const hasBreakdown = breakdownFields.some(f => raw[f] && raw[f].trim() !== '');
    if (hasBreakdown) {
        result.fareBreakdown = {};
        for (const f of breakdownFields) {
            const num = cleanNumeric(raw[f]);
            if (num !== undefined) result.fareBreakdown[f] = num;
        }
    }

    // --- Platform normalization (GoRide → Roam) ---
    if (result.platform) {
        result.platform = normalizePlatform(result.platform);
    }

    // --- Status default ---
    if (!result.status) result.status = 'Completed';

    return { isValid: true, record: result };
}

/**
 * Individual record validator.
 * Checks for required fields and proper data types.
 */
function validateRecord(
    raw: Record<string, string>, 
    columns: CsvColumn<any>[], 
    type: ImportType
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    for (const col of columns) {
        const value = raw[col.label]; // CSV Header -> Value

        // 1. Check for missing required fields
        // In our simple schema, we generally assume all defined columns are critical,
        // or at least require 'date', 'vehicleId'.
        const isRequired = ['date', 'vehicleId', 'amount', 'liters', 'value'].includes(col.key as string);
        
        if (isRequired && (!value || value.trim() === '')) {
            return { isValid: false, error: `Missing required field: ${col.label}` };
        }

        // 2. Type coercion and specific validation
        if (col.key === 'date') {
            const timestamp = Date.parse(value);
            if (isNaN(timestamp)) {
                return { isValid: false, error: `Invalid date format: ${value}` };
            }
            result[col.key] = new Date(timestamp).toISOString();
        } 
        else if (['amount', 'liters', 'odometer', 'value', 'cost'].includes(col.key as string)) {
             // Allow empty if not required, but if present must be number
             if (value && value.trim() !== '') {
                 const num = parseFloat(value);
                 if (isNaN(num)) {
                     return { isValid: false, error: `Invalid number for field ${col.label}: ${value}` };
                 }
                 result[col.key] = num;
             } else {
                 result[col.key] = undefined;
             }
        }
        else {
            // String fields
            result[col.key] = value;
        }
    }

    // 3. Domain Specific Rules
    if (type === 'fuel') {
        const entry = result as FuelEntry;
        if (entry.liters && entry.liters <= 0) return { isValid: false, error: 'Liters must be positive' };
        if (entry.amount && entry.amount < 0) return { isValid: false, error: 'Amount cannot be negative' }; // Zero allowed for corrections?
    }

    return { isValid: true, record: result };
}

// Phase 5: Driver, Vehicle, Transaction validators

/** Email regex for basic format validation */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateDriverRecord(
    raw: Record<string, string>,
    fleetTimezone?: string,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: name ---
    const name = (raw['name'] || '').trim();
    if (!name) {
        return { isValid: false, error: 'Missing required field: name' };
    }
    result.name = name;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- email: validate format if provided ---
    const email = (raw['email'] || '').trim();
    if (email) {
        if (!EMAIL_RE.test(email)) {
            return { isValid: false, error: `Invalid email format: "${email}"` };
        }
        result.email = email;
    }

    // --- phone: normalize (strip spaces, dashes, parens) ---
    const phone = (raw['phone'] || '').trim();
    if (phone) {
        result.phone = phone.replace(/[\s\-()]/g, '');
    }

    // --- Optional string fields ---
    for (const field of ['licenseNumber', 'status', 'assignedVehicleId', 'emergencyContact']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Optional date fields ---
    for (const field of ['licenseExpiry', 'hireDate']) {
        const val = parseFlexibleDate(raw[field], fleetTimezone);
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateVehicleRecord(
    raw: Record<string, string>,
    fleetTimezone?: string,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: licensePlate ---
    const plate = (raw['licensePlate'] || '').trim();
    if (!plate) {
        return { isValid: false, error: 'Missing required field: licensePlate' };
    }
    // Normalize: uppercase, strip spaces
    result.licensePlate = plate.toUpperCase().replace(/\s/g, '');

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['make', 'model', 'year', 'color', 'vin', 'status', 'currentDriverId', 'currentDriverName']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Optional date fields ---
    for (const field of ['insuranceExpiry', 'fitnessExpiry', 'registrationExpiry']) {
        const val = parseFlexibleDate(raw[field], fleetTimezone);
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateTransactionRecord(
    raw: Record<string, string>,
    fleetTimezone?: string,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: date ---
    const parsedDate = parseFlexibleDate(raw['date'], fleetTimezone);
    if (!parsedDate) {
        return { isValid: false, error: `Missing or invalid date: "${raw['date'] || ''}"` };
    }
    result.date = parsedDate;

    // --- Required: amount ---
    const amount = cleanNumeric(raw['amount']);
    if (amount === undefined) {
        return { isValid: false, error: `Missing or invalid amount: "${raw['amount'] || ''}"` };
    }
    result.amount = amount;

    // --- Required: category ---
    const category = (raw['category'] || '').trim();
    if (!category) {
        return { isValid: false, error: 'Missing required field: category' };
    }
    result.category = category;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['type', 'description', 'driverId', 'driverName', 'vehicleId', 'vehiclePlate', 'paymentMethod', 'status', 'tripId', 'receiptUrl']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- isReconciled ---
    const reconciled = (raw['isReconciled'] || '').trim().toLowerCase();
    result.isReconciled = reconciled === 'true' || reconciled === '1' || reconciled === 'yes';

    // --- Default type and status ---
    if (!result.type) result.type = 'Expense';
    if (!result.status) result.status = 'Completed';
    if (!result.paymentMethod) result.paymentMethod = 'Cash';

    return { isValid: true, record: result };
}

// Phase 6: Infrastructure entity validators

function validateTollTagRecord(
    raw: Record<string, string>,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: tagNumber ---
    const tagNumber = (raw['tagNumber'] || '').trim();
    if (!tagNumber) {
        return { isValid: false, error: 'Missing required field: tagNumber' };
    }
    result.tagNumber = tagNumber;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['status', 'vehicleId', 'driverId']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateTollPlazaRecord(
    raw: Record<string, string>,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: name ---
    const name = (raw['name'] || '').trim();
    if (!name) {
        return { isValid: false, error: 'Missing required field: name' };
    }
    result.name = name;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['location', 'status']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateStationRecord(
    raw: Record<string, string>,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: name ---
    const name = (raw['name'] || '').trim();
    if (!name) {
        return { isValid: false, error: 'Missing required field: name' };
    }
    result.name = name;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['location', 'status']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateEquipmentRecord(
    raw: Record<string, string>,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: name ---
    const name = (raw['name'] || '').trim();
    if (!name) {
        return { isValid: false, error: 'Missing required field: name' };
    }
    result.name = name;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['description', 'status']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateInventoryRecord(
    raw: Record<string, string>,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: name ---
    const name = (raw['name'] || '').trim();
    if (!name) {
        return { isValid: false, error: 'Missing required field: name' };
    }
    result.name = name;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['description', 'status']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- Default status ---
    if (!result.status) result.status = 'Active';

    return { isValid: true, record: result };
}

function validateClaimRecord(
    raw: Record<string, string>,
    fleetTimezone?: string,
): { isValid: boolean; record?: any; error?: string } {
    const result: any = {};

    // --- Required: date ---
    const parsedDate = parseFlexibleDate(raw['date'], fleetTimezone);
    if (!parsedDate) {
        return { isValid: false, error: `Missing or invalid date: "${raw['date'] || ''}"` };
    }
    result.date = parsedDate;

    // --- Required: amount ---
    const amount = cleanNumeric(raw['amount']);
    if (amount === undefined) {
        return { isValid: false, error: `Missing or invalid amount: "${raw['amount'] || ''}"` };
    }
    result.amount = amount;

    // --- Required: category ---
    const category = (raw['category'] || '').trim();
    if (!category) {
        return { isValid: false, error: 'Missing required field: category' };
    }
    result.category = category;

    // --- id: auto-generate if missing ---
    result.id = (raw['id'] || '').trim() || crypto.randomUUID();

    // --- Optional string fields ---
    for (const field of ['type', 'description', 'driverId', 'driverName', 'vehicleId', 'vehiclePlate', 'paymentMethod', 'status', 'tripId', 'receiptUrl']) {
        const val = (raw[field] || '').trim();
        if (val) result[field] = val;
    }

    // --- isReconciled ---
    const reconciled = (raw['isReconciled'] || '').trim().toLowerCase();
    result.isReconciled = reconciled === 'true' || reconciled === '1' || reconciled === 'yes';

    // --- Default type and status ---
    if (!result.type) result.type = 'Expense';
    if (!result.status) result.status = 'Completed';
    if (!result.paymentMethod) result.paymentMethod = 'Cash';

    return { isValid: true, record: result };
}