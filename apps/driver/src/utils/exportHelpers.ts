import { api } from '../services/api';
import { FinancialTransaction } from '../types/data';
import { Vehicle, TollTag } from '../types/vehicle';
import { formatDateJM } from './csv-helper';

export interface UniversalTollExportRow {
    Date: string;
    Time: string;
    Amount: number;
    Type: string;
    Category: string;
    Description: string;
    'Payment Method': string;
    Status: string;
    'Vehicle Plate': string;
    'Driver Name': string;
    'Tag ID': string;
    'Lane ID': string;
    'Reference Number': string;
}

export async function fetchFullTollHistory(): Promise<UniversalTollExportRow[]> {
    try {
        // 1. Fetch All Relevant Data in Parallel
        const [transactions, vehicles, drivers, tollTags] = await Promise.all([
            api.getTransactions(), // Fetches all transactions
            api.getVehicles(),     // Fetches all vehicles
            api.getDrivers(),      // Fetches all drivers
            api.getTollTags()      // Fetches all toll tags
        ]);

        // 2. Filter for Toll-related Transactions
        // We want: Usage, Top-ups, and Cash Collections if they are related to tolls
        // "Toll Usage", "Toll Top-up", "Toll", "Tolls"
        const tollTransactions = transactions.filter((tx: FinancialTransaction) => {
            const cat = typeof tx.category === 'string' ? tx.category.toLowerCase() : '';
            return cat.includes('toll') || 
                   (cat === 'cash collection' && tx.metadata?.tollRelated) || // Future proofing
                   tx.description.toLowerCase().includes('toll');
        });

        // 3. Map to Export Format
        const rows: UniversalTollExportRow[] = tollTransactions.map((tx: FinancialTransaction) => {
            const dateObj = new Date(tx.date);
            
            // Resolve Vehicle Plate
            let plate = tx.vehiclePlate || '';
            if (!plate && tx.vehicleId) {
                const vehicle = vehicles.find((v: any) => v.id === tx.vehicleId);
                if (vehicle) plate = vehicle.licensePlate;
            }

            // Resolve Driver Name
            let driverName = tx.driverName || '';
            if (!driverName && tx.driverId) {
                const driver = drivers.find((d: any) => d.id === tx.driverId);
                if (driver) driverName = driver.name || driver.driverName;
            }

            // Flatten Metadata
            const tagId = tx.metadata?.tollTagId || '';
            const laneId = tx.metadata?.laneId || '';
            const refNum = tx.referenceNumber || tx.metadata?.referenceNumber || '';

            // Handle Type/Category mapping for clarity
            // If it's a negative amount, it's likely Usage or Expense
            // If it's positive, it's Top-up or Refund
            let type = tx.type;
            if (type === 'Expense' && (tx.category === 'Toll Usage' || tx.category === 'Tolls')) {
                type = 'Usage';
            }

            return {
                Date: formatDateJM(tx.date), // DD/MM/YYYY — Jamaica standard
                Time: tx.time || dateObj.toLocaleTimeString('en-GB', { hour12: false }), // HH:mm:ss
                Amount: tx.amount,
                Type: type,
                Category: typeof tx.category === 'string' ? tx.category : 'Toll',
                Description: (tx.description || '').replace(/\n/g, ' '), // Remove newlines
                'Payment Method': tx.paymentMethod || 'Tag Balance',
                Status: tx.status,
                'Vehicle Plate': plate,
                'Driver Name': driverName,
                'Tag ID': tagId,
                'Lane ID': laneId,
                'Reference Number': refNum
            };
        });

        return rows;

    } catch (error) {
        console.error("Failed to fetch full toll history", error);
        throw new Error("Failed to prepare export data");
    }
}

export function generateBackupCSV(rows: UniversalTollExportRow[]): string {
    if (rows.length === 0) return '';

    // Define Header
    const headers = [
        'Date',
        'Time',
        'Amount',
        'Type',
        'Category',
        'Description',
        'Payment Method',
        'Status',
        'Vehicle Plate',
        'Driver Name',
        'Tag ID',
        'Lane ID',
        'Reference Number'
    ];

    // Build CSV Content
    const csvRows = [headers.join(',')];

    for (const row of rows) {
        const values = headers.map(header => {
            const val = (row as any)[header];
            if (val === null || val === undefined) return '';
            
            // Escape quotes and wrap in quotes if contains comma
            const stringVal = String(val);
            if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
                return `"${stringVal.replace(/"/g, '""')}"`;
            }
            return stringVal;
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}