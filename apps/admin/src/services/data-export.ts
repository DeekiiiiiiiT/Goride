import { api, fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';
import { FuelEntry } from '../types/fuel';
import { ServiceRequest, Trip } from '../types/data';
import { OdometerReading } from '../types/vehicle';
import { jsonToCsv, downloadBlob } from '../utils/csv-helper';
import { VehicleMetrics } from '../types/data';
import { equipmentService } from './equipmentService';
import { inventoryService } from './inventoryService';
import JSZip from 'jszip';
import {
    FUEL_CSV_COLUMNS, SERVICE_CSV_COLUMNS, ODOMETER_CSV_COLUMNS, CHECKIN_CSV_COLUMNS,
    TRIP_CSV_COLUMNS, DRIVER_CSV_COLUMNS, DRIVER_METRICS_CSV_COLUMNS,
    VEHICLE_CSV_COLUMNS, VEHICLE_METRICS_CSV_COLUMNS, TRANSACTION_CSV_COLUMNS,
    TOLL_TAG_CSV_COLUMNS, TOLL_PLAZA_CSV_COLUMNS, STATION_CSV_COLUMNS,
    CLAIM_CSV_COLUMNS, EQUIPMENT_CSV_COLUMNS, INVENTORY_CSV_COLUMNS,
    TOLL_TRANSACTION_CSV_COLUMNS,
} from '../types/csv-schemas';
import { ImportType } from './import-validator';

export type ExportType = 'fuel' | 'service' | 'odometer' | 'checkin' | 'trip'
    | 'drivers' | 'driverMetrics' | 'vehicles' | 'vehicleMetrics'
    | 'transactions' | 'tollTags' | 'tollPlazas' | 'stations'
    | 'claims' | 'equipment' | 'inventory' | 'tollTransactions';

interface ExportState {
    fuel: boolean;
    service: boolean;
    odometer: boolean;
    checkin: boolean;
    trip: boolean;
    drivers: boolean;
    driverMetrics: boolean;
    vehicles: boolean;
    vehicleMetrics: boolean;
    transactions: boolean;
    tollTags: boolean;
    tollPlazas: boolean;
    stations: boolean;
    claims: boolean;
    equipment: boolean;
    inventory: boolean;
    tollTransactions: boolean;
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
 * Fetches all trip data with optional date range and platform filtering.
 * Uses paginated API to handle large datasets safely.
 * Exported for use by ExportCenter.
 */
export async function fetchAllTrips(startDate?: string, endDate?: string, platform?: string): Promise<Trip[]> {
    const PAGE_SIZE = 500;
    const allTrips: Trip[] = [];

    try {
        if (startDate || endDate) {
            // Use the filtered search endpoint with pagination
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                const response = await api.getTripsFiltered({
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                    limit: PAGE_SIZE,
                    offset,
                });

                const trips = response.data || [];
                allTrips.push(...trips);

                // Check if there are more pages
                hasMore = trips.length === PAGE_SIZE && allTrips.length < (response.total || Infinity);
                offset += PAGE_SIZE;
            }
        } else {
            // No filter — fetch all trips with pagination
            let offset = 0;
            let hasMore = true;

            while (hasMore) {
                const trips = await api.getTrips({ limit: PAGE_SIZE, offset });
                allTrips.push(...trips);

                hasMore = trips.length === PAGE_SIZE;
                offset += PAGE_SIZE;
            }
        }

        // Sort by date ascending
        const sorted = allTrips.sort((a, b) => {
            const dateA = new Date(a.date || a.requestTime || 0).getTime();
            const dateB = new Date(b.date || b.requestTime || 0).getTime();
            return dateA - dateB;
        });

        // Apply platform filter client-side if specified
        if (platform) {
            const p = platform.toLowerCase();
            return sorted.filter((t: any) => (t.platform || '').toLowerCase() === p);
        }

        return sorted;
    } catch (error) {
        console.error("Error fetching trips for export:", error);
        throw error; // Re-throw so ExportCenter can show the error
    }
}

/**
 * Normalizes Fuel Entries into Odometer Readings
 */
function normalizeFuelReadings(fuelEntries: FuelEntry[], verifiedIds: Set<string> = new Set()): OdometerReading[] {
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
            isVerified: verifiedIds.has(entry.id) || entry.metadata?.isVerified === true,
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
 * Fetches all driver profiles.
 */
export async function fetchAllDrivers(): Promise<any[]> {
    try {
        const drivers = await api.getDrivers();
        return (drivers || []).sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
        console.error("Error fetching drivers for export:", error);
        throw error;
    }
}

/**
 * Fetches all driver performance metrics.
 */
export async function fetchAllDriverMetrics(): Promise<any[]> {
    try {
        const metrics = await api.getDriverMetrics();
        return (metrics || []).sort((a: any, b: any) =>
            (a.driverName || '').localeCompare(b.driverName || ''));
    } catch (error) {
        console.error("Error fetching driver metrics for export:", error);
        throw error;
    }
}

/**
 * Fetches all vehicle profiles.
 */
export async function fetchAllVehicles(): Promise<any[]> {
    try {
        const vehicles = await api.getVehicles();
        return (vehicles || []).sort((a: any, b: any) =>
            (a.licensePlate || '').localeCompare(b.licensePlate || ''));
    } catch (error) {
        console.error("Error fetching vehicles for export:", error);
        throw error;
    }
}

/**
 * Fetches all vehicle performance metrics.
 */
export async function fetchAllVehicleMetrics(): Promise<any[]> {
    try {
        const metrics = await api.getVehicleMetrics();
        return (metrics || []).sort((a: any, b: any) =>
            (a.plateNumber || '').localeCompare(b.plateNumber || ''));
    } catch (error) {
        console.error("Error fetching vehicle metrics for export:", error);
        throw error;
    }
}

/**
 * Fetches all financial transactions with optional client-side date filter.
 */
export async function fetchAllTransactions(startDate?: string, endDate?: string): Promise<any[]> {
    try {
        const transactions = await api.getTransactions();
        let filtered = transactions || [];

        // Client-side date filter
        if (startDate) {
            const start = new Date(startDate).getTime();
            filtered = filtered.filter((t: any) => new Date(t.date).getTime() >= start);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter((t: any) => new Date(t.date).getTime() <= end.getTime());
        }

        return filtered.sort((a: any, b: any) =>
            new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        console.error("Error fetching transactions for export:", error);
        throw error;
    }
}

/**
 * Fetches all toll tags.
 */
export async function fetchAllTollTags(): Promise<any[]> {
    try {
        const tags = await api.getTollTags();
        return tags || [];
    } catch (error) {
        console.error("Error fetching toll tags for export:", error);
        throw error;
    }
}

/**
 * Fetches all toll plazas.
 */
export async function fetchAllTollPlazas(): Promise<any[]> {
    try {
        const plazas = await api.getTollPlazas();
        return (plazas || []).sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
        console.error("Error fetching toll plazas for export:", error);
        throw error;
    }
}

/**
 * Fetches all gas stations.
 */
export async function fetchAllStations(): Promise<any[]> {
    try {
        const stations = await api.getStations();
        return (stations || []).sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
        console.error("Error fetching stations for export:", error);
        throw error;
    }
}

/**
 * Fetches all claims/disputes with optional client-side date filter.
 */
export async function fetchAllClaims(startDate?: string, endDate?: string): Promise<any[]> {
    try {
        const claims = await api.getClaims();
        let filtered = claims || [];

        if (startDate) {
            const start = new Date(startDate).getTime();
            filtered = filtered.filter((c: any) => new Date(c.createdAt).getTime() >= start);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter((c: any) => new Date(c.createdAt).getTime() <= end.getTime());
        }

        return filtered.sort((a: any, b: any) =>
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    } catch (error) {
        console.error("Error fetching claims for export:", error);
        throw error;
    }
}

/**
 * Fetches all equipment items across all vehicles.
 */
export async function fetchAllEquipment(): Promise<any[]> {
    try {
        const items = await equipmentService.getAllEquipment();
        return items || [];
    } catch (error) {
        console.error("Error fetching equipment for export:", error);
        throw error;
    }
}

/**
 * Fetches all inventory stock items.
 */
export async function fetchAllInventory(): Promise<any[]> {
    try {
        const items = await inventoryService.getInventory();
        return items || [];
    } catch (error) {
        console.error("Error fetching inventory for export:", error);
        throw error;
    }
}

/**
 * Fetches all toll transactions (flattened with reconciliation data) via the server export endpoint.
 * Data is already sorted by date descending from the server.
 */
export async function fetchAllTollTransactions(): Promise<any[]> {
    try {
        const data = await api.getTollTransactionsExport();
        return data || [];
    } catch (error) {
        console.error("Error fetching toll transactions for export:", error);
        throw error;
    }
}

/**
 * Re-exports for ExportCenter.
 */
export { fetchAllFuelLogs as exportFetchAllFuelLogs };
export { fetchAllServiceLogs as exportFetchAllServiceLogs };
export { fetchAllOdometerReadings as exportFetchAllOdometerReadings };
export { fetchAllCheckIns as exportFetchAllCheckIns };

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

    if (selections.trip) {
        const data = await fetchAllTrips();
        const content = jsonToCsv(data, TRIP_CSV_COLUMNS);
        files.push({ filename: 'trip_backup.csv', content });
    }

    if (selections.drivers) {
        const data = await fetchAllDrivers();
        const content = jsonToCsv(data, DRIVER_CSV_COLUMNS);
        files.push({ filename: 'drivers_backup.csv', content });
    }

    if (selections.driverMetrics) {
        const data = await fetchAllDriverMetrics();
        const content = jsonToCsv(data, DRIVER_METRICS_CSV_COLUMNS);
        files.push({ filename: 'driver_metrics_backup.csv', content });
    }

    if (selections.vehicles) {
        const data = await fetchAllVehicles();
        const content = jsonToCsv(data, VEHICLE_CSV_COLUMNS);
        files.push({ filename: 'vehicles_backup.csv', content });
    }

    if (selections.vehicleMetrics) {
        const data = await fetchAllVehicleMetrics();
        const content = jsonToCsv(data, VEHICLE_METRICS_CSV_COLUMNS);
        files.push({ filename: 'vehicle_metrics_backup.csv', content });
    }

    if (selections.transactions) {
        const data = await fetchAllTransactions();
        const content = jsonToCsv(data, TRANSACTION_CSV_COLUMNS);
        files.push({ filename: 'transactions_backup.csv', content });
    }

    if (selections.tollTags) {
        const data = await fetchAllTollTags();
        const content = jsonToCsv(data, TOLL_TAG_CSV_COLUMNS);
        files.push({ filename: 'toll_tags_backup.csv', content });
    }

    if (selections.tollPlazas) {
        const data = await fetchAllTollPlazas();
        const content = jsonToCsv(data, TOLL_PLAZA_CSV_COLUMNS);
        files.push({ filename: 'toll_plazas_backup.csv', content });
    }

    if (selections.stations) {
        const data = await fetchAllStations();
        const content = jsonToCsv(data, STATION_CSV_COLUMNS);
        files.push({ filename: 'stations_backup.csv', content });
    }

    if (selections.claims) {
        const data = await fetchAllClaims();
        const content = jsonToCsv(data, CLAIM_CSV_COLUMNS);
        files.push({ filename: 'claims_backup.csv', content });
    }

    if (selections.equipment) {
        const data = await fetchAllEquipment();
        const content = jsonToCsv(data, EQUIPMENT_CSV_COLUMNS);
        files.push({ filename: 'equipment_backup.csv', content });
    }

    if (selections.inventory) {
        const data = await fetchAllInventory();
        const content = jsonToCsv(data, INVENTORY_CSV_COLUMNS);
        files.push({ filename: 'inventory_backup.csv', content });
    }

    if (selections.tollTransactions) {
        const data = await fetchAllTollTransactions();
        const content = jsonToCsv(data, TOLL_TRANSACTION_CSV_COLUMNS);
        files.push({ filename: 'toll_transactions_backup.csv', content });
    }

    return files;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5: Import Template Download
// ═══════════════════════════════════════════════════════════════════════════

/** Example rows for each importable entity type */
const TEMPLATE_EXAMPLES: Record<string, Record<string, string>> = {
    driver: {
        id: '', name: 'John Smith', email: 'john@email.com', phone: '876-555-0100',
        licenseNumber: 'DL12345', licenseExpiry: '15/03/2027', status: 'Active',
        assignedVehicleId: '', hireDate: '01/01/2024', emergencyContact: 'Jane Smith (876-555-0200)',
    },
    vehicle: {
        id: '', licensePlate: 'AB1234', make: 'Toyota', model: 'Corolla',
        year: '2022', color: 'White', vin: '1HGCM82633A004352', status: 'Active',
        currentDriverId: '', currentDriverName: '', insuranceExpiry: '30/06/2026',
        fitnessExpiry: '15/12/2025', registrationExpiry: '01/03/2026',
        tollTagId: '', tollTagProvider: '',
    },
    transaction: {
        id: '', date: '08/03/2026', type: 'Expense', category: 'Fuel',
        amount: '5200.00', description: 'Fuel purchase — Shell HWT',
        driverId: '', driverName: 'John Smith', vehicleId: '', vehiclePlate: 'AB1234',
        paymentMethod: 'Gas Card', status: 'Completed', isReconciled: 'false',
        tripId: '', receiptUrl: '',
    },
    trip: {
        id: '', date: '08/03/2026', requestTime: '', dropoffTime: '',
        driverId: '', driverName: 'John Smith', vehicleId: '', platform: 'Uber',
        serviceType: 'UberX', status: 'Completed', grossEarnings: '1800.00',
        amount: '1500.00', netToDriver: '1200.00', cashCollected: '0',
        tollCharges: '400', distance: '12.5', duration: '25',
        pickupLocation: 'Kingston', dropoffLocation: 'Portmore',
        pickupArea: 'New Kingston', dropoffArea: 'Portmore Mall',
        baseFare: '800', tips: '200', surge: '0', waitTime: '100',
        airportFees: '0', taxes: '0', batchId: '', paymentMethod: 'Card',
    },
    tollTag: {
        id: '', tagNumber: 'TT-00123', provider: 'TransJamaica', status: 'Active',
        assignedVehicleId: '', assignedVehicleName: 'AB1234 — Toyota Corolla',
        createdAt: '',
    },
    tollPlaza: {
        id: '', name: 'Portmore Toll Plaza', highway: 'T1 (Portmore Causeway)',
        direction: 'Eastbound', operator: 'TransJamaica',
        lat: '17.9714', lng: '-76.8674',
        standardRate: '350', status: 'Active', dataSource: 'import',
    },
    station: {
        id: '', name: 'Texaco Half Way Tree', brand: 'Texaco',
        address: '12 Half Way Tree Rd, Kingston', parish: 'Kingston',
        lat: '18.0106', lng: '-76.7841', status: 'Active', dataSource: 'import',
    },
    equipment: {
        id: '', vehicleId: '', name: 'Dashcam Viofo A129', category: 'Electronics',
        description: 'Front-facing dashcam', condition: 'Good',
        serialNumber: 'VIOFO-2024-001', purchaseDate: '01/06/2024',
        notes: '', createdAt: '',
    },
    inventory: {
        id: '', name: 'Engine Oil 5W-30', category: 'Fluids',
        quantity: '24', minQuantity: '6', unitCost: '1200',
        supplier: 'AutoZone Kingston', lastRestocked: '01/03/2026',
        notes: '', createdAt: '',
    },
    claim: {
        id: '', type: 'Damage', status: 'Open', driverId: '',
        tripId: '', amount: '15000', description: 'Passenger damaged rear seat',
        platform: 'Uber', createdAt: '08/03/2026', updatedAt: '',
        resolutionReason: '',
    },
};

/** Column headers for each importable type */
const TEMPLATE_COLUMNS: Record<string, string[]> = {
    driver: DRIVER_CSV_COLUMNS.map(c => c.label),
    vehicle: VEHICLE_CSV_COLUMNS.map(c => c.label),
    transaction: TRANSACTION_CSV_COLUMNS.map(c => c.label),
    trip: TRIP_CSV_COLUMNS.map(c => c.label),
    tollTag: TOLL_TAG_CSV_COLUMNS.map(c => c.label),
    tollPlaza: TOLL_PLAZA_CSV_COLUMNS.map(c => c.label),
    station: STATION_CSV_COLUMNS.map(c => c.label),
    equipment: EQUIPMENT_CSV_COLUMNS.map(c => c.label),
    inventory: INVENTORY_CSV_COLUMNS.map(c => c.label),
    claim: CLAIM_CSV_COLUMNS.map(c => c.label),
};

/**
 * Downloads a CSV template for the given import type.
 * Includes headers + 1 example row with placeholder values.
 */
export function downloadImportTemplate(type: ImportType): void {
    const headers = TEMPLATE_COLUMNS[type];
    const example = TEMPLATE_EXAMPLES[type];
    if (!headers || !example) {
        console.warn(`No template defined for type: ${type}`);
        return;
    }

    const headerLine = headers.join(',');
    const exampleValues = headers.map(h => {
        const val = example[h] || '';
        // Wrap in quotes if it contains commas
        return val.includes(',') ? `"${val}"` : val;
    });
    const exampleLine = exampleValues.join(',');
    const csv = `${headerLine}\n${exampleLine}\n`;

    downloadBlob(csv, `roam_${type}_template.csv`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7: Full System Backup — ZIP Generation
// ═══════════════════════════════════════════════════════════════════════════

/** Category definition for the full backup pipeline */
interface BackupCategory {
    key: string;
    filename: string;
    fetch: () => Promise<any[]>;
    columns: any[];
}

const BACKUP_CATEGORIES: BackupCategory[] = [
    { key: 'drivers',        filename: 'drivers.csv',        fetch: fetchAllDrivers,          columns: DRIVER_CSV_COLUMNS },
    { key: 'driverMetrics',  filename: 'driver_metrics.csv', fetch: fetchAllDriverMetrics,     columns: DRIVER_METRICS_CSV_COLUMNS },
    { key: 'vehicles',       filename: 'vehicles.csv',       fetch: fetchAllVehicles,          columns: VEHICLE_CSV_COLUMNS },
    { key: 'vehicleMetrics', filename: 'vehicle_metrics.csv',fetch: fetchAllVehicleMetrics,    columns: VEHICLE_METRICS_CSV_COLUMNS },
    { key: 'trips',          filename: 'trips.csv',          fetch: () => fetchAllTrips(),     columns: TRIP_CSV_COLUMNS },
    { key: 'transactions',   filename: 'transactions.csv',   fetch: () => fetchAllTransactions(), columns: TRANSACTION_CSV_COLUMNS },
    { key: 'fuel',           filename: 'fuel.csv',           fetch: fetchAllFuelLogs,          columns: FUEL_CSV_COLUMNS },
    { key: 'service',        filename: 'service.csv',        fetch: fetchAllServiceLogs,       columns: SERVICE_CSV_COLUMNS },
    { key: 'odometer',       filename: 'odometer.csv',       fetch: fetchAllOdometerReadings,  columns: ODOMETER_CSV_COLUMNS },
    { key: 'checkins',       filename: 'checkins.csv',       fetch: fetchAllCheckIns,          columns: CHECKIN_CSV_COLUMNS },
    { key: 'tollTags',       filename: 'toll_tags.csv',      fetch: fetchAllTollTags,          columns: TOLL_TAG_CSV_COLUMNS },
    { key: 'tollPlazas',     filename: 'toll_plazas.csv',    fetch: fetchAllTollPlazas,        columns: TOLL_PLAZA_CSV_COLUMNS },
    { key: 'stations',       filename: 'stations.csv',       fetch: fetchAllStations,          columns: STATION_CSV_COLUMNS },
    { key: 'claims',         filename: 'claims.csv',         fetch: () => fetchAllClaims(),    columns: CLAIM_CSV_COLUMNS },
    { key: 'equipment',      filename: 'equipment.csv',      fetch: fetchAllEquipment,         columns: EQUIPMENT_CSV_COLUMNS },
    { key: 'inventory',      filename: 'inventory.csv',      fetch: fetchAllInventory,         columns: INVENTORY_CSV_COLUMNS },
    { key: 'tollTransactions', filename: 'toll_transactions.csv', fetch: fetchAllTollTransactions, columns: TOLL_TRANSACTION_CSV_COLUMNS },
];

export { BACKUP_CATEGORIES };

export interface BackupManifest {
    version: string;
    generatedAt: string;
    roamFleetVersion: string;
    categories: Record<string, { filename: string; recordCount: number; status: 'ok' | 'error'; error?: string }>;
    totalRecords: number;
}

/**
 * Generates a full system backup as a ZIP blob.
 * Fetches all 17 data categories in parallel, converts to CSV, bundles with manifest.json.
 * @param onProgress — callback with (completedSteps, totalSteps, currentLabel)
 */
export async function generateFullBackup(
    onProgress?: (completed: number, total: number, label: string) => void,
): Promise<{ blob: Blob; manifest: BackupManifest }> {
    const zip = new JSZip();
    const total = BACKUP_CATEGORIES.length;
    const manifest: BackupManifest = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        roamFleetVersion: 'Roam Fleet v2.0',
        categories: {},
        totalRecords: 0,
    };

    // Process categories sequentially to avoid overwhelming the server
    for (let i = 0; i < BACKUP_CATEGORIES.length; i++) {
        const cat = BACKUP_CATEGORIES[i];
        onProgress?.(i, total, cat.key);

        try {
            const data = await cat.fetch();
            const csv = jsonToCsv(data, cat.columns);
            zip.file(cat.filename, csv);
            manifest.categories[cat.key] = {
                filename: cat.filename,
                recordCount: data.length,
                status: 'ok',
            };
            manifest.totalRecords += data.length;
        } catch (err: any) {
            console.error(`Backup fetch error for ${cat.key}:`, err);
            // Write empty CSV with headers only
            const headerLine = cat.columns.map((c: any) => c.label).join(',') + '\n';
            zip.file(cat.filename, headerLine);
            manifest.categories[cat.key] = {
                filename: cat.filename,
                recordCount: 0,
                status: 'error',
                error: err.message || 'Unknown error',
            };
        }
    }

    onProgress?.(total, total, 'Packaging ZIP...');

    // Add manifest
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob, manifest };
}

/**
 * Parses a backup ZIP and returns the manifest + file listing without importing.
 */
export async function parseBackupZip(file: File): Promise<{
    manifest: BackupManifest | null;
    files: { name: string; size: number }[];
    zip: JSZip;
}> {
    const zip = await JSZip.loadAsync(file);
    const files = Object.values(zip.files)
        .filter(f => !f.dir)
        .map(f => ({ name: f.name, size: 0 })); // size not easily available pre-extraction

    let manifest: BackupManifest | null = null;
    const manifestFile = zip.file('manifest.json');
    if (manifestFile) {
        try {
            const text = await manifestFile.async('text');
            manifest = JSON.parse(text);
        } catch (e) {
            console.warn('Failed to parse manifest.json from backup ZIP:', e);
        }
    }

    return { manifest, files, zip };
}