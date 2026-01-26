import { csvToJson } from '../utils/csv-helper';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { FUEL_CSV_COLUMNS, SERVICE_CSV_COLUMNS, ODOMETER_CSV_COLUMNS, CHECKIN_CSV_COLUMNS, CsvColumn } from '../types/csv-schemas';

// --- Types ---

export type ImportType = 'fuel' | 'service' | 'odometer' | 'checkin';

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
export function validateImportFile(content: string, type: ImportType): ValidationResult<any> {
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
        default: return { validRecords: [], errors: [{ row: 0, message: 'Invalid import type', rawRecord: {} }], totalProcessed: 0 };
    }

    rawRecords.forEach((record, index) => {
        const rowNum = index + 2; // +1 for 0-index, +1 for header row
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

    return {
        validRecords,
        errors,
        totalProcessed: rawRecords.length
    };
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
