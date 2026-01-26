import { api } from './api';
import { fuelService } from './fuelService';
import { ImportType } from './import-validator';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest } from '../types/data';
import { OdometerReading } from '../types/vehicle';

export interface RestoreResult {
    successCount: number;
    failureCount: number;
    errors: Array<{ row: number; error: string; data: any }>;
}

export const importExecutor = {
    /**
     * Main entry point for processing a batch of validated records.
     */
    async processBatch(
        records: any[], 
        type: ImportType, 
        onProgress: (pct: number) => void
    ): Promise<RestoreResult> {
        const result: RestoreResult = {
            successCount: 0,
            failureCount: 0,
            errors: []
        };

        const total = records.length;
        if (total === 0) return result;

        for (let i = 0; i < total; i++) {
            const record = records[i];
            try {
                if (type === 'fuel') {
                    await this.restoreFuelAnchor(record);
                } else if (type === 'service') {
                    await this.restoreServiceLog(record);
                } else if (type === 'odometer') {
                    await this.restoreOdometerReading(record);
                } else if (type === 'checkin') {
                    await this.restoreCheckIn(record);
                }
                result.successCount++;
            } catch (err: any) {
                console.error(`Failed to restore record ${i}:`, err);
                result.failureCount++;
                result.errors.push({
                    row: i + 1,
                    error: err.message || "Unknown error",
                    data: record
                });
            }

            // Update progress
            const pct = Math.round(((i + 1) / total) * 100);
            onProgress(pct);
        }

        return result;
    },

    /**
     * Restores a Fuel Log as a Verified Anchor.
     * Ensures we don't accidentally create duplicate transaction records if they aren't needed.
     * Forces entryMode to 'Anchor'.
     */
    async restoreFuelAnchor(data: any): Promise<void> {
        const entry: FuelEntry = {
            ...data,
            // Ensure ID is new or preserved if valid UUID. 
            // If data.id is missing, backend or helper might generate it, but let's be safe.
            id: data.id || crypto.randomUUID(),
            entryMode: 'Anchor', // Force Anchor mode for imported historical data
            reconciliationStatus: 'Verified', // Assume imported history is verified
            date: new Date(data.date).toISOString() // Ensure ISO format
        };

        await fuelService.saveFuelEntry(entry);
    },

    /**
     * Restores a Service Log.
     */
    async restoreServiceLog(data: any): Promise<void> {
        const log = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Completed', // Default to Completed for history
            date: new Date(data.date).toISOString()
        };
        
        // Map to ServiceRequest structure expected by backend
        // Note: api.saveMaintenanceLog expects a specific shape.
        // We assume the CSV columns map reasonably well, but we might need adaptation here
        // depending on what 'saveMaintenanceLog' exactly requires vs what is in the CSV.
        // Based on Phase 15 export, we exported specific fields.
        
        await api.saveMaintenanceLog(log);
    },

    /**
     * Restores an Odometer Reading (General History).
     */
    async restoreOdometerReading(data: any): Promise<void> {
        const reading: Partial<OdometerReading> = {
            ...data,
            id: data.id || crypto.randomUUID(),
            date: new Date(data.date).toISOString(),
            isVerified: true // Assume historical imports are verified
        };

        await api.addOdometerReading(reading);
    },

    /**
     * Restores a Weekly Check-in as an Odometer Reading.
     * Note: Since CSV lacks driverId, we cannot fully restore to check-in table.
     * We restore to odometer history but tag it so it appears as a check-in in timeline.
     */
    async restoreCheckIn(data: any): Promise<void> {
        const reading: Partial<OdometerReading> = {
            ...data,
            id: data.id || crypto.randomUUID(),
            date: new Date(data.date).toISOString(),
            isVerified: true,
            source: 'Weekly Check-in' // Enforce specific source tag
        };

        await api.addOdometerReading(reading);
    }
};
