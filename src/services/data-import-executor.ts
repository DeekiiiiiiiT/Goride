import { api, fetchFleetTimezone } from './api';
import { fuelService } from './fuelService';
import { equipmentService } from './equipmentService';
import { inventoryService } from './inventoryService';
import { ImportType, validateImportFile } from './import-validator';
import JSZip from 'jszip';
import { BackupManifest } from './data-export';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest, Trip, ImportBatch } from '../types/data';
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
                } else if (type === 'trip') {
                    // Trip import should use processTripBatch() directly — skip here
                    continue;
                } else if (type === 'driver') {
                    await this.restoreDriver(record);
                } else if (type === 'vehicle') {
                    await this.restoreVehicle(record);
                } else if (type === 'transaction') {
                    await this.restoreTransaction(record);
                } else if (type === 'equipment') {
                    await this.restoreEquipment(record);
                } else if (type === 'inventory') {
                    await this.restoreInventory(record);
                } else if (type === 'tollTag') {
                    await this.restoreTollTag(record);
                } else if (type === 'tollPlaza') {
                    await this.restoreTollPlaza(record);
                } else if (type === 'station') {
                    await this.restoreStation(record);
                } else if (type === 'claim') {
                    await this.restoreClaim(record);
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
    },

    /**
     * Phase 4: Trip Re-Import — batch import with automatic ledger backfill.
     * Saves trips in batches of 50 to the server (which triggers write-time ledger).
     * Handles deduplication: if trip has an existing ID, it will be updated (not duplicated).
     */
    async processTripBatch(
        records: Partial<Trip>[],
        onProgress: (pct: number) => void,
        options?: { overwriteDuplicates?: boolean }
    ): Promise<RestoreResult & { batchId: string; weeksCovered: Set<string> }> {
        const BATCH_SIZE = 50;
        const batchId = `reimport_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const weeksCovered = new Set<string>();
        const result: RestoreResult = {
            successCount: 0,
            failureCount: 0,
            errors: []
        };

        // Assign batch ID and generate IDs if missing
        const prepared = records.map(r => {
            const trip = {
                ...r,
                id: r.id || crypto.randomUUID(),
                batchId,
                status: r.status || 'Completed',
            } as Trip;

            // Track week coverage for ledger summary
            if (trip.date) {
                const d = new Date(trip.date);
                const weekStart = new Date(d);
                weekStart.setDate(d.getDate() - d.getDay()); // Sunday start
                weeksCovered.add(weekStart.toISOString().split('T')[0]);
            }

            return trip;
        });

        // Create the import batch record
        try {
            await api.createBatch({
                id: batchId,
                fileName: `Trip Re-Import (${prepared.length} trips)`,
                uploadDate: new Date().toISOString(),
                status: 'completed',
                recordCount: prepared.length,
                type: 'trip_reimport',
            });
        } catch (err) {
            console.warn('Failed to create batch record (non-fatal):', err);
        }

        // Save in batches
        const totalBatches = Math.ceil(prepared.length / BATCH_SIZE);
        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
            const start = batchIdx * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, prepared.length);
            const chunk = prepared.slice(start, end);

            try {
                await api.saveTrips(chunk);
                result.successCount += chunk.length;
            } catch (err: any) {
                console.error(`Trip batch ${batchIdx + 1}/${totalBatches} failed:`, err);
                // Mark each trip in the failed chunk as an error
                chunk.forEach((trip, i) => {
                    result.failureCount++;
                    result.errors.push({
                        row: start + i + 1,
                        error: err.message || 'Batch save failed',
                        data: trip
                    });
                });
                // Adjust successCount (we already added them, so subtract)
                // Actually we haven't added them — only add on success above
            }

            const pct = Math.round(((batchIdx + 1) / totalBatches) * 100);
            onProgress(pct);
        }

        // Match merged import: ensure legacy `ledger:*` fare rows exist (same as ImportsPage).
        if (prepared.length > 0) {
            try {
                await api.ensureLedgerFromTripIds(prepared.map((t) => t.id).filter(Boolean) as string[]);
            } catch (e) {
                console.warn('[processTripBatch] ensureLedgerFromTripIds failed (trips saved):', e);
            }
        }

        return { ...result, batchId, weeksCovered };
    },

    /**
     * Restores a Driver record.
     */
    async restoreDriver(data: any): Promise<void> {
        const driver = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveDriver(driver);
    },

    /**
     * Restores a Vehicle record.
     */
    async restoreVehicle(data: any): Promise<void> {
        const vehicle = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveVehicle(vehicle);
    },

    /**
     * Restores a Transaction record.
     */
    async restoreTransaction(data: any): Promise<void> {
        const transaction = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Completed',
        };
        await api.saveTransaction(transaction);
    },

    /**
     * Restores an Equipment record.
     */
    async restoreEquipment(data: any): Promise<void> {
        const equipment = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await equipmentService.saveEquipment(equipment);
    },

    /**
     * Restores an Inventory record.
     */
    async restoreInventory(data: any): Promise<void> {
        const inventory = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await inventoryService.saveStock(inventory);
    },

    /**
     * Restores a Toll Tag record.
     */
    async restoreTollTag(data: any): Promise<void> {
        const tollTag = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveTollTag(tollTag);
    },

    /**
     * Restores a Toll Plaza record.
     */
    async restoreTollPlaza(data: any): Promise<void> {
        const tollPlaza = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveTollPlaza(tollPlaza);
    },

    /**
     * Restores a Station record.
     */
    async restoreStation(data: any): Promise<void> {
        const station = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveStation(station);
    },

    /**
     * Restores a Claim record.
     */
    async restoreClaim(data: any): Promise<void> {
        const claim = {
            ...data,
            id: data.id || crypto.randomUUID(),
            status: data.status || 'Active',
        };
        await api.saveClaim(claim);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7: Full System Restore from ZIP
// ═══════════════════════════════════════════════════════════════════════════

/** Maps backup CSV filenames to their import type for the validator + executor */
const RESTORE_FILE_MAP: { filename: string; importType: ImportType; label: string; stage: number }[] = [
    // Stage A: No dependencies
    { filename: 'drivers.csv',        importType: 'driver',      label: 'Drivers',              stage: 1 },
    { filename: 'vehicles.csv',       importType: 'vehicle',     label: 'Vehicles',             stage: 1 },
    // Stage B: Depend on driver/vehicle IDs
    { filename: 'trips.csv',          importType: 'trip',        label: 'Trips',                stage: 2 },
    { filename: 'transactions.csv',   importType: 'transaction', label: 'Transactions',         stage: 2 },
    { filename: 'claims.csv',         importType: 'claim',       label: 'Claims',               stage: 2 },
    // Stage C: Depend on vehicle IDs
    { filename: 'fuel.csv',           importType: 'fuel',        label: 'Fuel Logs',            stage: 3 },
    { filename: 'service.csv',        importType: 'service',     label: 'Service Logs',         stage: 3 },
    { filename: 'odometer.csv',       importType: 'odometer',    label: 'Odometer',             stage: 3 },
    { filename: 'checkins.csv',       importType: 'checkin',     label: 'Check-ins',            stage: 3 },
    // Stage D: Infrastructure
    { filename: 'equipment.csv',      importType: 'equipment',   label: 'Equipment',            stage: 4 },
    { filename: 'inventory.csv',      importType: 'inventory',   label: 'Inventory',            stage: 4 },
    { filename: 'toll_tags.csv',      importType: 'tollTag',     label: 'Toll Tags',            stage: 4 },
    { filename: 'toll_plazas.csv',    importType: 'tollPlaza',   label: 'Toll Plazas',          stage: 4 },
    { filename: 'stations.csv',       importType: 'station',     label: 'Gas Stations',         stage: 4 },
];

export interface FullRestoreResult {
    totalSuccess: number;
    totalFailed: number;
    categories: Record<string, { success: number; failed: number; errors: string[] }>;
    skipped: string[];
}

/**
 * Restores all data from a backup ZIP.
 * Processes in staged order (A → B → C → D) to respect entity dependencies.
 * Does NOT roll back on partial failure — partial restore is better than no restore.
 */
export async function restoreFullBackup(
    zip: JSZip,
    onProgress: (stage: string, pct: number) => void,
): Promise<FullRestoreResult> {
    const result: FullRestoreResult = {
        totalSuccess: 0,
        totalFailed: 0,
        categories: {},
        skipped: [],
    };

    // Fetch fleet timezone once for all CSV validations
    const fleetTimezone = await fetchFleetTimezone();

    // Sort by stage to ensure dependency order
    const sortedFiles = [...RESTORE_FILE_MAP].sort((a, b) => a.stage - b.stage);
    const totalFiles = sortedFiles.length;

    for (let i = 0; i < sortedFiles.length; i++) {
        const entry = sortedFiles[i];
        const overallPct = Math.round(((i) / totalFiles) * 100);
        onProgress(`Stage ${entry.stage}: ${entry.label}`, overallPct);

        const zipFile = zip.file(entry.filename);
        if (!zipFile) {
            result.skipped.push(entry.label);
            result.categories[entry.label] = { success: 0, failed: 0, errors: [`File "${entry.filename}" not found in ZIP`] };
            continue;
        }

        try {
            const csvText = await zipFile.async('text');

            // Skip empty files (header only)
            const lines = csvText.trim().split('\n');
            if (lines.length <= 1) {
                result.skipped.push(entry.label);
                result.categories[entry.label] = { success: 0, failed: 0, errors: [] };
                continue;
            }

            // Special handling for trips — use processTripBatch
            if (entry.importType === 'trip') {
                const validated = validateImportFile(csvText, 'trip', fleetTimezone);
                if (validated.validRecords.length > 0) {
                    const tripResult = await importExecutor.processTripBatch(
                        validated.validRecords,
                        (pct) => onProgress(`Stage ${entry.stage}: ${entry.label}`, overallPct + Math.round(pct / totalFiles)),
                    );
                    result.totalSuccess += tripResult.successCount;
                    result.totalFailed += tripResult.failureCount;
                    result.categories[entry.label] = {
                        success: tripResult.successCount,
                        failed: tripResult.failureCount,
                        errors: tripResult.errors.map(e => `Row ${e.row}: ${e.error}`),
                    };
                } else {
                    result.categories[entry.label] = {
                        success: 0,
                        failed: validated.errors.length,
                        errors: validated.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`),
                    };
                    result.totalFailed += validated.errors.length;
                }
                continue;
            }

            // General path: validate then import
            const validated = validateImportFile(csvText, entry.importType, fleetTimezone);

            if (validated.validRecords.length === 0) {
                result.categories[entry.label] = {
                    success: 0,
                    failed: validated.errors.length,
                    errors: validated.errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`),
                };
                result.totalFailed += validated.errors.length;
                continue;
            }

            const batchResult = await importExecutor.processBatch(
                validated.validRecords,
                entry.importType,
                (pct) => onProgress(`Stage ${entry.stage}: ${entry.label}`, overallPct + Math.round(pct / totalFiles)),
            );

            result.totalSuccess += batchResult.successCount;
            result.totalFailed += batchResult.failureCount;
            result.categories[entry.label] = {
                success: batchResult.successCount,
                failed: batchResult.failureCount + validated.errors.length,
                errors: [
                    ...validated.errors.slice(0, 3).map(e => `Validation row ${e.row}: ${e.message}`),
                    ...batchResult.errors.slice(0, 3).map(e => `Import row ${e.row}: ${e.error}`),
                ],
            };
            result.totalFailed += validated.errors.length;

        } catch (err: any) {
            console.error(`Full restore failed for ${entry.label}:`, err);
            result.categories[entry.label] = {
                success: 0,
                failed: 0,
                errors: [err.message || 'Unknown error'],
            };
        }
    }

    onProgress('Complete', 100);
    return result;
}