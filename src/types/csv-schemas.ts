import { CsvColumn } from "../utils/csv-helper";
import { FuelEntry } from "./fuel";
import { ServiceRequest } from "./data";
import { OdometerReading } from "./vehicle";

export const FUEL_CSV_COLUMNS: CsvColumn<FuelEntry>[] = [
    { key: 'date', label: 'date' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'driverId', label: 'driverId' },
    { key: 'odometer', label: 'odometer' },
    { key: 'liters', label: 'liters' },
    { key: 'amount', label: 'amount' },
    { key: 'type', label: 'type' },
    { key: 'location', label: 'location' },
    { key: 'entryMode', label: 'entryMode' },
    { key: 'paymentSource', label: 'paymentSource' }
];

export const SERVICE_CSV_COLUMNS: CsvColumn<ServiceRequest>[] = [
    { key: 'date', label: 'date' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'type', label: 'type' },
    { key: 'description', label: 'description' },
    { key: 'odometer', label: 'odometer' },
    { key: 'priority', label: 'priority' },
    { key: 'status', label: 'status' }
];

export const ODOMETER_CSV_COLUMNS: CsvColumn<OdometerReading>[] = [
    { key: 'date', label: 'date' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'value', label: 'value' },
    { key: 'source', label: 'source' },
    { key: 'isVerified', label: 'isVerified' }
];

export const CHECKIN_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'date', label: 'date' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'value', label: 'value' },
    { key: 'source', label: 'source' }
];
