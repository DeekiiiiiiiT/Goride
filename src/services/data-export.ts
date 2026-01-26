import { api, fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { jsonToCsv, downloadBlob } from '../utils/csv-helper';
import { VehicleMetrics } from '../types/data';
import { FUEL_CSV_COLUMNS, SERVICE_CSV_COLUMNS, ODOMETER_CSV_COLUMNS, CHECKIN_CSV_COLUMNS } from '../types/csv-schemas';

export type ExportType = 'fuel' | 'service' | 'odometer' | 'checkin';

interface ExportState {
    fuel: boolean;
    service: boolean;
    odometer: boolean;
    checkin: boolean;
}

/**
 * Fetches all fuel entries from the backend.
 * Filters for Anchors if requested, but generally we want the raw data.
 * In the context of "Disaster Recovery", we probably want EVERYTHING,
 * but specifically identified anchors are critical.
 */
async function fetchAllFuelLogs(): Promise<FuelEntry[]> {
    try {
        const response = await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
            headers: { 'Authorization': `Bearer ${publicAnonKey}` }
        });
        if (!response.ok) throw new Error("Failed to fetch fuel entries");
        const data: FuelEntry[] = await response.json();
        
        // Sort by date ascending
        return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        console.error("Error fetching fuel logs:", error);
        return [];
    }
}

/**
 * Fetches all service/maintenance logs for all vehicles.
 */
async function fetchAllServiceLogs(): Promise<ServiceRequest[]> {
    try {
        // 1. Get all vehicles
        const vehicles = await api.getVehicles();
        
        // 2. Fetch logs for each vehicle in parallel
        const promises = vehicles.map((v: any) => api.getMaintenanceLogs(v.id));
        const results = await Promise.all(promises);
        
        // 3. Flatten and sort
        const flatLogs: ServiceRequest[] = results.flat();
        return flatLogs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        console.error("Error fetching service logs:", error);
        return [];
    }
}

/**
 * Normalizes Fuel Entries into Odometer Readings
 */
function normalizeFuelReadings(fuelEntries: FuelEntry[]): OdometerReading[] {
    return fuelEntries
        .filter(entry => entry.odometer && entry.odometer > 0)
        .map(entry => ({
            id: entry.id,
            vehicleId: entry.vehicleId,
            date: entry.date,
            value: entry.odometer,
            type: 'Hard',
            source: 'Fuel Log',
            createdAt: entry.createdAt || new Date().toISOString(),
            isVerified: true,
            referenceId: entry.id
        } as OdometerReading));
}

/**
 * Normalizes Service Logs into Odometer Readings
 */
function normalizeServiceReadings(serviceLogs: ServiceRequest[]): OdometerReading[] {
    return serviceLogs
        .filter(log => log.odometer && log.odometer > 0)
        .map(log => ({
            id: log.id,
            vehicleId: log.vehicleId,
            date: log.date,
            value: log.odometer!,
            type: 'Hard',
            source: 'Service Log',
            createdAt: log.createdAt || new Date().toISOString(),
            isVerified: true,
            referenceId: log.id
        } as OdometerReading));
}

/**
 * Normalizes Check-ins into Odometer Readings
 */
function normalizeCheckInReadings(checkIns: any[], vehicleId: string): OdometerReading[] {
    return checkIns.map(c => ({
        id: c.id || `checkin-${c.timestamp || c.date}-${vehicleId}`,
        vehicleId: c.vehicleId || vehicleId,
        date: c.timestamp || c.date,
        value: c.odometer,
        type: 'Calculated',
        source: 'Weekly Check-in',
        createdAt: c.createdAt || new Date().toISOString(),
        isVerified: false,
        referenceId: c.id
    } as OdometerReading));
}

/**
 * Normalizes Manual History into Odometer Readings with consistent source
 */
function normalizeManualReadings(history: OdometerReading[]): OdometerReading[] {
    return history.map(h => ({
        ...h,
        source: 'Manual' as any // Force 'Manual' for CSV consistency
    }));
}

/**
 * Fetches all odometer readings for all vehicles.
 */
async function fetchAllOdometerReadings(): Promise<OdometerReading[]> {
    try {
        // 1. Get all vehicles
        const vehicles = await api.getVehicles();

        // 2. Fetch Global Logs (Fuel & Service)
        // We fetch these globally because they have dedicated bulk/aggregator methods or endpoints
        // to avoid N+1 requests where possible (or to reuse existing bulk fetchers).
        const [fuelEntries, serviceLogs] = await Promise.all([
            fetchAllFuelLogs(),
            fetchAllServiceLogs()
        ]);

        const fuelReadings = normalizeFuelReadings(fuelEntries);
        const serviceReadings = normalizeServiceReadings(serviceLogs);
        
        // 3. Fetch Vehicle-Specific Logs (Manual & Check-ins)
        // These endpoints require iterating by vehicle ID
        const vehiclePromises = vehicles.map(async (v: any) => {
            try {
                const [history, checkIns] = await Promise.all([
                    api.getOdometerHistory(v.id).catch(e => {
                        console.warn(`Failed to fetch history for vehicle ${v.id}`, e);
                        return [];
                    }),
                    api.getCheckInsByVehicle(v.id).catch(e => {
                        console.warn(`Failed to fetch check-ins for vehicle ${v.id}`, e);
                        return [];
                    })
                ]);

                const manualReadings = normalizeManualReadings(history);
                const checkInReadings = normalizeCheckInReadings(checkIns, v.id);

                return [...manualReadings, ...checkInReadings];
            } catch (e) {
                console.warn(`Failed to export odometer data for vehicle ${v.id}`, e);
                return [];
            }
        });

        const vehicleSpecificReadings = (await Promise.all(vehiclePromises)).flat();
        
        // 4. Merge and Sort
        const allReadings = [
            ...fuelReadings,
            ...serviceReadings,
            ...vehicleSpecificReadings
        ];

        return allReadings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        console.error("Error fetching odometer readings:", error);
        return [];
    }
}

/**
 * Fetches all check-in entries for all vehicles.
 * Returns them in the format expected by the CSV schema (date, vehicleId, value, source).
 */
async function fetchAllCheckIns(): Promise<any[]> {
    try {
        // 1. Get all vehicles
        const vehicles = await api.getVehicles();
        
        // 2. Fetch check-ins for each vehicle in parallel
        const promises = vehicles.map(async (v: any) => {
            try {
                const checkIns = await api.getCheckInsByVehicle(v.id);
                // Map to CSV format
                return checkIns.map((c: any) => ({
                    date: c.timestamp || c.date,
                    vehicleId: c.vehicleId || v.id,
                    value: c.odometer,
                    source: 'Weekly Check-in'
                }));
            } catch (e) {
                console.warn(`Failed to fetch check-ins for vehicle ${v.id}`, e);
                return [];
            }
        });

        const results = await Promise.all(promises);
        
        // 3. Flatten and sort
        const flatCheckIns: any[] = results.flat();
        return flatCheckIns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        console.error("Error fetching check-ins:", error);
        return [];
    }
}

/**
 * Main Orchestrator for Generating Backups
 */
export async function generateBackupFiles(selections: ExportState) {
    const files: { filename: string; content: string }[] = [];

    if (selections.fuel) {
        const data = await fetchAllFuelLogs();
        // Filter for "Anchor" relevance if needed, but for disaster recovery we usually want full dump.
        // However, the prompt specifically mentioned "Anchors". 
        // We will dump ALL fuel entries but ensure 'entryMode' is captured so we know which are anchors.
        const content = jsonToCsv(data, FUEL_CSV_COLUMNS);
        files.push({ filename: 'fuel_backup.csv', content });
    }

    if (selections.service) {
        const data = await fetchAllServiceLogs();
        const content = jsonToCsv(data, SERVICE_CSV_COLUMNS); 
        // Casting as any for columns to allow flexible key mapping if types are loose
        files.push({ filename: 'service_backup.csv', content });
    }

    if (selections.odometer) {
        const data = await fetchAllOdometerReadings();
        const content = jsonToCsv(data, ODOMETER_CSV_COLUMNS);
        files.push({ filename: 'odometer_backup.csv', content });
    }

    if (selections.checkin) {
        const data = await fetchAllCheckIns();
        const content = jsonToCsv(data, CHECKIN_CSV_COLUMNS);
        files.push({ filename: 'checkin_backup.csv', content });
    }

    return files;
}
