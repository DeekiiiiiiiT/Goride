import { UnifiedOdometerEntry, UnifiedOdometerSource } from '../types/vehicle';
import { OdometerExportRow } from './odometerUtils';

export interface ImportAnalysisResult {
    summary: {
        total: number;
        new: number;
        duplicates: number;
        conflicts: number;
    };
    newRecords: UnifiedOdometerEntry[];
    duplicates: { importRow: OdometerExportRow; existing: UnifiedOdometerEntry }[];
    conflicts: { importRow: OdometerExportRow; existing: UnifiedOdometerEntry; reason: string }[];
}

/**
 * Helper to parse the human-readable source back to the system type
 */
const parseSource = (sourceStr: string): UnifiedOdometerSource => {
    const s = sourceStr.toLowerCase();
    if (s.includes('fuel')) return 'fuel';
    if (s.includes('service')) return 'service';
    if (s.includes('check')) return 'checkin';
    return 'manual';
};

/**
 * Helper to combine Date and Time strings back to an ISO string.
 * Assumes the input Date is YYYY-MM-DD and Time is HH:mm
 */
const combineDateTime = (dateStr: string, timeStr: string): string => {
    try {
        const d = new Date(`${dateStr}T${timeStr}:00`);
        // If the CSV was created with local time but without TZ info, 
        // new Date() might interpret it as UTC or Local depending on browser.
        // However, since we used toLocaleString in export, it's best to try 
        // to match the original timestamp if possible.
        // For simple conflict detection, string matching might be safer if the format is consistent.
        
        // Let's assume standard ISO construction for the new record
        return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    } catch (e) {
        return new Date().toISOString();
    }
};

export const analyzeImportData = (
    importRows: OdometerExportRow[],
    existingHistory: UnifiedOdometerEntry[]
): ImportAnalysisResult => {
    const result: ImportAnalysisResult = {
        summary: {
            total: importRows.length,
            new: 0,
            duplicates: 0,
            conflicts: 0
        },
        newRecords: [],
        duplicates: [],
        conflicts: []
    };

    // Index existing history for fast lookup
    // 1. Map by Reference ID (Source + RefID)
    const refIdMap = new Map<string, UnifiedOdometerEntry>();
    // 2. Map by Timestamp + Value (for "Manual" entries or those missing Ref IDs)
    const valueMap = new Map<string, UnifiedOdometerEntry>();

    existingHistory.forEach(entry => {
        if (entry.referenceId && entry.source) {
            refIdMap.set(`${entry.source}_${entry.referenceId}`, entry);
        }
        // Key: ISO Date string (roughly) + Value
        // Since ISO strings might vary slightly (ms), we might look at just the minute
        const timeKey = new Date(entry.date).toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
        valueMap.set(`${timeKey}_${entry.value}`, entry);
    });

    importRows.forEach(row => {
        const source = parseSource(row.Source);
        const refId = row['Reference ID'];
        const odoValue = Number(row.Odometer);
        
        // Construct Date
        // Note: The export used separate Date/Time columns.
        // We try to reconstruct a comparable timestamp.
        const rowDateStr = row.Date; // YYYY-MM-DD
        const rowTimeStr = row.Time; // HH:mm
        // Make a "fuzzy" key for value matching
        const tempDate = new Date(`${rowDateStr}T${rowTimeStr}`);
        const importTimeKey = !isNaN(tempDate.getTime()) 
            ? tempDate.toISOString().slice(0, 16) 
            : ''; 

        // 1. Check for Reference ID Conflict
        const refKey = `${source}_${refId}`;
        const existingByRef = refIdMap.get(refKey);

        if (existingByRef) {
            // Found a record with same Source & Ref ID
            if (existingByRef.value === odoValue) {
                // Exact Match -> Duplicate
                result.duplicates.push({ importRow: row, existing: existingByRef });
                result.summary.duplicates++;
            } else {
                // Same Ref ID but different value -> Conflict
                // (e.g. Fuel Log 123 was edited in DB to be 5000km, but CSV says 4000km)
                result.conflicts.push({ 
                    importRow: row, 
                    existing: existingByRef, 
                    reason: `Value mismatch for ID ${refId}: Database has ${existingByRef.value}, Import has ${odoValue}`
                });
                result.summary.conflicts++;
            }
            return; // Done with this row
        }

        // 2. Check for Date+Value Duplicate (if no Ref ID matched)
        // This catches Manual entries that don't have stable external IDs, 
        // or cases where Ref IDs might have changed but data is same.
        const existingByValue = valueMap.get(`${importTimeKey}_${odoValue}`);
        if (existingByValue) {
            result.duplicates.push({ importRow: row, existing: existingByValue });
            result.summary.duplicates++;
            return;
        }

        // 3. If no conflicts or duplicates, it's New
        // Create the UnifiedOdometerEntry object
        const newEntry: UnifiedOdometerEntry = {
            id: `restored_${source}_${refId || crypto.randomUUID().slice(0,8)}`, // Temporary ID
            vehicleId: '', // Will be filled by context
            date: combineDateTime(row.Date, row.Time),
            value: odoValue,
            type: 'Hard', // Restored readings are treated as Hard anchors
            source: source,
            referenceId: refId || '',
            notes: row.Notes || `Restored from ${row.Source}`,
            isVerified: true, // Master log is trusted
            createdAt: new Date().toISOString(),
            metaData: {
                isRestored: true,
                originalCreatedBy: row['Created By']
            }
        };

        result.newRecords.push(newEntry);
        result.summary.new++;
    });

    return result;
};
