import { UnifiedOdometerEntry } from '../types/vehicle';

/**
 * Sorts odometer entries by date descending (newest first).
 */
export const sortOdometerEntries = (entries: UnifiedOdometerEntry[]): UnifiedOdometerEntry[] => {
    return [...entries].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
};

/**
 * Detects and merges duplicate odometer entries.
 * A duplicate is defined as an entry with the exact same timestamp (down to the minute) and odometer value.
 * Priority for retention: Fuel > Service > Check-in > Manual.
 */
export const deduplicateEntries = (entries: UnifiedOdometerEntry[]): UnifiedOdometerEntry[] => {
    const uniqueMap = new Map<string, UnifiedOdometerEntry>();
    const PRIORITY = { 'fuel': 4, 'service': 3, 'checkin': 2, 'manual': 1 };

    entries.forEach(entry => {
        const time = new Date(entry.date).getTime();
        const key = `${time}-${entry.value}`;

        if (uniqueMap.has(key)) {
            const existing = uniqueMap.get(key)!;
            
            // Priority 1: Explicit Anchor Point
            if (entry.isAnchorPoint && !existing.isAnchorPoint) {
                uniqueMap.set(key, entry);
                return;
            }
            if (!entry.isAnchorPoint && existing.isAnchorPoint) {
                return;
            }

            // Priority 2: Source Priority
            const existingPriority = PRIORITY[existing.source] || 0;
            const newPriority = PRIORITY[entry.source] || 0;

            if (newPriority > existingPriority) {
                uniqueMap.set(key, entry);
            }
        } else {
            uniqueMap.set(key, entry);
        }
    });

    return Array.from(uniqueMap.values());
};

/**
 * Calculates the distance delta between consecutive entries.
 * Adds 'deltaKm' to the metaData of the entry.
 * Note: Since the list is typically Descending (Newest First), 
 * the delta for Entry[i] is (Entry[i].value - Entry[i+1].value).
 */
export const calculateGapAnalysis = (entries: UnifiedOdometerEntry[]): UnifiedOdometerEntry[] => {
    // Ensure sorted first
    const sorted = sortOdometerEntries(entries);

    return sorted.map((entry, index) => {
        const nextEntry = sorted[index + 1];
        if (nextEntry) {
            const delta = entry.value - nextEntry.value;
            return {
                ...entry,
                metaData: {
                    ...entry.metaData,
                    deltaKm: delta,
                    prevReadingId: nextEntry.id
                }
            };
        }
        // Oldest entry has no delta
        return {
            ...entry,
            metaData: {
                ...entry.metaData,
                deltaKm: 0,
                isBase: true
            }
        };
    });
};

/**
 * Master processing function for Phase 3
 */
export const processUnifiedHistory = (entries: UnifiedOdometerEntry[]): UnifiedOdometerEntry[] => {
    let processed = deduplicateEntries(entries);
    processed = sortOdometerEntries(processed);
    processed = calculateGapAnalysis(processed);
    return processed;
};

// --- Phase 4: CSV Export Helpers (Smart Unified Restoration) ---

/**
 * Strategy: Smart Unified Restoration
 * 
 * We distinguish between two export types:
 * 1. CheckInExportRow: The Legacy format. Strictly strictly strictly raw data.
 *    Mapping Rule: No mapping. Direct database dump.
 *    Target: "Export Check-ins" button.
 * 
 * 2. MasterLogExportRow: The Unified Master Log.
 *    Mapping Rule: Applies "Friendly Names" (e.g. fuel -> Fuel Log).
 *    Target: "Export Master Log" button.
 */

// Step 1.1: Legacy Check-in Format (Matches Screenshot 2)
export interface CheckInExportRow {
    date: string;      // "2024-01-26T10:00:00+00:00" (Raw ISO)
    vehicleId: string; // "v-123"
    value: number;     // 45000
    source: string;    // "checkin" (Raw DB value)
}

// Step 1.2: Master Log Format (Unified Audit)
export interface MasterLogExportRow {
    Date: string;        // "2024-01-26"
    Time: string;        // "10:00"
    Odometer: number;    // 45000
    Source: string;      // "Weekly Check-in" (Mapped)
    'Reference ID': string;
    Notes: string;
    'Created By': string;
}

const formatSource = (source: string): string => {
    switch (source) {
        case 'fuel': return 'Fuel Log';
        case 'service': return 'Service Log';
        case 'checkin': return 'Weekly Check-in';
        case 'manual': return 'Manual Entry';
        default: return source;
    }
};

/**
 * Transforms Unified Data into the Master Log format.
 */
export const formatMasterLogExport = (entries: UnifiedOdometerEntry[]): MasterLogExportRow[] => {
    return entries.map(entry => {
        const d = new Date(entry.date);
        const dateStr = d.toLocaleDateString('en-CA'); 
        const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

        return {
            Date: dateStr,
            Time: timeStr,
            Odometer: entry.value,
            Source: formatSource(entry.source),
            'Reference ID': entry.referenceId,
            Notes: entry.notes || '',
            'Created By': entry.driverName || entry.driverId || 'System'
        };
    });
};

/**
 * Transforms Raw Data into the Legacy Check-in format.
 * This is a pass-through to ensure the CSV structure matches the legacy expectations.
 */
export const formatCheckInExport = (rawEntries: any[]): CheckInExportRow[] => {
    return rawEntries.map(entry => ({
        date: entry.created_at || entry.date, // Handle both raw DB field and normalized field
        vehicleId: entry.vehicle_id || entry.vehicleId,
        value: entry.value || entry.odometer,
        source: entry.source || 'checkin'
    }));
};

