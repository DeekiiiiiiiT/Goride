import { CsvColumn, formatDateJM } from "../utils/csv-helper";
import { FuelEntry } from "./fuel";
import { ServiceRequest, Trip } from "./data";
import { OdometerReading } from "./vehicle";
import type { VehicleCatalogRecord } from "./vehicleCatalog";
import { formatCatalogMonthEnglish } from "./vehicleCatalog";

export const FUEL_CSV_COLUMNS: CsvColumn<FuelEntry>[] = [
    { key: 'date', label: 'date', formatter: formatDateJM },
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
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'type', label: 'type' },
    { key: 'description', label: 'description' },
    { key: 'odometer', label: 'odometer' },
    { key: 'priority', label: 'priority' },
    { key: 'status', label: 'status' }
];

export const ODOMETER_CSV_COLUMNS: CsvColumn<OdometerReading>[] = [
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'value', label: 'value' },
    { key: 'source', label: 'source' },
    { key: 'isVerified', label: 'isVerified' }
];

export const CHECKIN_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'value', label: 'value' },
    { key: 'source', label: 'source' }
];

/**
 * Trip CSV Schema — used for trip data export & re-import.
 * Raw numeric values (no $ signs, no commas) for clean re-import.
 */
export const TRIP_CSV_COLUMNS: CsvColumn<Trip>[] = [
    { key: 'id', label: 'id' },
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'requestTime', label: 'requestTime' },
    { key: 'dropoffTime', label: 'dropoffTime' },
    { key: 'driverId', label: 'driverId' },
    { key: 'driverName', label: 'driverName' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'platform', label: 'platform' },
    { key: 'serviceType', label: 'serviceType' },
    { key: 'status', label: 'status' },
    { key: 'grossEarnings', label: 'grossEarnings' },
    { key: 'amount', label: 'amount' },
    { key: 'netToDriver', label: 'netToDriver' },
    { key: 'cashCollected', label: 'cashCollected' },
    { key: 'tollCharges', label: 'tollCharges' },
    { key: 'distance', label: 'distance' },
    { key: 'duration', label: 'duration' },
    { key: 'pickupLocation', label: 'pickupLocation' },
    { key: 'dropoffLocation', label: 'dropoffLocation' },
    { key: 'pickupArea', label: 'pickupArea' },
    { key: 'dropoffArea', label: 'dropoffArea' },
    // Fare breakdown — flattened via formatter
    { key: 'fareBreakdown', label: 'baseFare', formatter: (v: any) => v?.baseFare != null ? String(v.baseFare) : '' },
    { key: 'fareBreakdown', label: 'tips', formatter: (v: any) => v?.tips != null ? String(v.tips) : '' },
    { key: 'fareBreakdown', label: 'surge', formatter: (v: any) => v?.surge != null ? String(v.surge) : '' },
    { key: 'fareBreakdown', label: 'waitTime', formatter: (v: any) => v?.waitTime != null ? String(v.waitTime) : '' },
    { key: 'fareBreakdown', label: 'airportFees', formatter: (v: any) => v?.airportFees != null ? String(v.airportFees) : '' },
    { key: 'fareBreakdown', label: 'taxes', formatter: (v: any) => v?.taxes != null ? String(v.taxes) : '' },
    { key: 'batchId', label: 'batchId' },
    { key: 'paymentMethod', label: 'paymentMethod' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: All remaining export schemas (using CsvColumn<any> for flexibility)
// ═══════════════════════════════════════════════════════════════════════════

/** Driver roster — profile-level fields from getDrivers() */
export const DRIVER_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'name' },
    { key: 'email', label: 'email' },
    { key: 'phone', label: 'phone' },
    { key: 'licenseNumber', label: 'licenseNumber' },
    { key: 'licenseExpiry', label: 'licenseExpiry', formatter: formatDateJM },
    { key: 'status', label: 'status' },
    { key: 'assignedVehicleId', label: 'assignedVehicleId' },
    { key: 'hireDate', label: 'hireDate', formatter: formatDateJM },
    { key: 'emergencyContact', label: 'emergencyContact' },
];

/** Driver performance metrics — from getDriverMetrics() */
export const DRIVER_METRICS_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'driverId', label: 'driverId' },
    { key: 'driverName', label: 'driverName' },
    { key: 'periodStart', label: 'periodStart', formatter: formatDateJM },
    { key: 'periodEnd', label: 'periodEnd', formatter: formatDateJM },
    { key: 'tripsCompleted', label: 'tripsCompleted' },
    { key: 'totalEarnings', label: 'totalEarnings' },
    { key: 'onlineHours', label: 'onlineHours' },
    { key: 'onTripHours', label: 'onTripHours' },
    { key: 'acceptanceRate', label: 'acceptanceRate' },
    { key: 'cancellationRate', label: 'cancellationRate' },
    { key: 'completionRate', label: 'completionRate' },
    { key: 'ratingLast500', label: 'ratingLast500' },
    { key: 'score', label: 'score' },
    { key: 'tier', label: 'tier' },
];

/** Vehicle fleet — profile-level fields from getVehicles() */
export const VEHICLE_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'licensePlate', label: 'licensePlate' },
    { key: 'make', label: 'make' },
    { key: 'model', label: 'model' },
    { key: 'year', label: 'year' },
    { key: 'color', label: 'color' },
    { key: 'vin', label: 'vin' },
    { key: 'status', label: 'status' },
    { key: 'currentDriverId', label: 'currentDriverId' },
    { key: 'currentDriverName', label: 'currentDriverName' },
    { key: 'insuranceExpiry', label: 'insuranceExpiry', formatter: formatDateJM },
    { key: 'fitnessExpiry', label: 'fitnessExpiry', formatter: formatDateJM },
    { key: 'registrationExpiry', label: 'registrationExpiry', formatter: formatDateJM },
    { key: 'tollTagId', label: 'tollTagId' },
    { key: 'tollTagProvider', label: 'tollTagProvider' },
];

/** Vehicle performance metrics — from getVehicleMetrics() */
export const VEHICLE_METRICS_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'plateNumber', label: 'plateNumber' },
    { key: 'vehicleName', label: 'vehicleName' },
    { key: 'periodStart', label: 'periodStart', formatter: formatDateJM },
    { key: 'periodEnd', label: 'periodEnd', formatter: formatDateJM },
    { key: 'totalEarnings', label: 'totalEarnings' },
    { key: 'totalTrips', label: 'totalTrips' },
    { key: 'onlineHours', label: 'onlineHours' },
    { key: 'onTripHours', label: 'onTripHours' },
    { key: 'earningsPerHour', label: 'earningsPerHour' },
    { key: 'tripsPerHour', label: 'tripsPerHour' },
];

/** Financial transactions — from getTransactions() */
export const TRANSACTION_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'type', label: 'type' },
    { key: 'category', label: 'category' },
    { key: 'amount', label: 'amount' },
    { key: 'description', label: 'description' },
    { key: 'driverId', label: 'driverId' },
    { key: 'driverName', label: 'driverName' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'vehiclePlate', label: 'vehiclePlate' },
    { key: 'paymentMethod', label: 'paymentMethod' },
    { key: 'status', label: 'status' },
    { key: 'isReconciled', label: 'isReconciled' },
    { key: 'tripId', label: 'tripId' },
    { key: 'receiptUrl', label: 'receiptUrl' },
];

/** Toll tags — from getTollTags() */
export const TOLL_TAG_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'tagNumber', label: 'tagNumber' },
    { key: 'provider', label: 'provider' },
    { key: 'status', label: 'status' },
    { key: 'assignedVehicleId', label: 'assignedVehicleId' },
    { key: 'assignedVehicleName', label: 'assignedVehicleName' },
    { key: 'createdAt', label: 'createdAt', formatter: formatDateJM },
];

/** Toll plazas — from getTollPlazas() */
export const TOLL_PLAZA_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'name' },
    { key: 'highway', label: 'highway' },
    { key: 'direction', label: 'direction' },
    { key: 'operator', label: 'operator' },
    { key: 'location', label: 'lat', formatter: (v: any) => v?.lat != null ? String(v.lat) : '' },
    { key: 'location', label: 'lng', formatter: (v: any) => v?.lng != null ? String(v.lng) : '' },
    { key: 'plusCode', label: 'plusCode' },
    { key: 'address', label: 'address' },
    { key: 'parish', label: 'parish' },
    { key: 'status', label: 'status' },
    { key: 'dataSource', label: 'dataSource' },
];

/** Gas stations — from getStations() */
export const STATION_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'name' },
    { key: 'brand', label: 'brand' },
    { key: 'address', label: 'address' },
    { key: 'parish', label: 'parish' },
    { key: 'location', label: 'lat', formatter: (v: any) => v?.lat != null ? String(v.lat) : '' },
    { key: 'location', label: 'lng', formatter: (v: any) => v?.lng != null ? String(v.lng) : '' },
    { key: 'plusCode', label: 'plusCode' },
    { key: 'status', label: 'status' },
    { key: 'dataSource', label: 'dataSource' },
];

/** Claims & disputes — from getClaims() */
export const CLAIM_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'type', label: 'type' },
    { key: 'status', label: 'status' },
    { key: 'driverId', label: 'driverId' },
    { key: 'tripId', label: 'tripId' },
    { key: 'amount', label: 'amount' },
    { key: 'expectedAmount', label: 'expectedAmount' },
    { key: 'paidAmount', label: 'paidAmount' },
    { key: 'subject', label: 'subject' },
    { key: 'createdAt', label: 'createdAt', formatter: formatDateJM },
    { key: 'updatedAt', label: 'updatedAt', formatter: formatDateJM },
    { key: 'resolutionReason', label: 'resolutionReason' },
];

/** Equipment — from getAllEquipment() */
export const EQUIPMENT_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'name', label: 'name' },
    { key: 'category', label: 'category' },
    { key: 'description', label: 'description' },
    { key: 'price', label: 'price' },
    { key: 'status', label: 'status' },
    { key: 'purchaseDate', label: 'purchaseDate', formatter: formatDateJM },
    { key: 'notes', label: 'notes' },
    { key: 'createdAt', label: 'createdAt', formatter: formatDateJM },
];

/** Inventory stock — from getInventory() */
export const INVENTORY_CSV_COLUMNS: CsvColumn<any>[] = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'name' },
    { key: 'category', label: 'category' },
    { key: 'quantity', label: 'quantity' },
    { key: 'minQuantity', label: 'minQuantity' },
    { key: 'costPerUnit', label: 'costPerUnit' },
    { key: 'location', label: 'location' },
    { key: 'description', label: 'description' },
    { key: 'lastRestockDate', label: 'lastRestockDate', formatter: formatDateJM },
];

/** Toll transactions — all scanned receipts with reconciliation data from /toll-reconciliation/export */
export const TOLL_TRANSACTION_CSV_COLUMNS: CsvColumn<any>[] = [
    // Transaction basics
    { key: 'id', label: 'id' },
    { key: 'date', label: 'date', formatter: formatDateJM },
    { key: 'time', label: 'time' },
    { key: 'vehicleId', label: 'vehicleId' },
    { key: 'vehiclePlate', label: 'vehiclePlate' },
    { key: 'driverId', label: 'driverId' },
    { key: 'driverName', label: 'driverName' },
    { key: 'plaza', label: 'plaza' },
    { key: 'type', label: 'type' },
    { key: 'paymentMethod', label: 'paymentMethod' },
    { key: 'amount', label: 'amount' },
    { key: 'absAmount', label: 'absAmount' },
    { key: 'status', label: 'status' },
    { key: 'description', label: 'description' },
    { key: 'referenceTagId', label: 'referenceTagId' },
    { key: 'batchId', label: 'batchId' },
    // Reconciliation status
    { key: 'reconciliationStatus', label: 'reconciliationStatus' },
    { key: 'resolution', label: 'resolution' },
    // Match details (populated for "Matched" status)
    { key: 'matchedTripId', label: 'matchedTripId' },
    { key: 'matchedTripDate', label: 'matchedTripDate', formatter: formatDateJM },
    { key: 'matchedTripPlatform', label: 'matchedTripPlatform' },
    { key: 'matchedTripPickup', label: 'matchedTripPickup' },
    { key: 'matchedTripDropoff', label: 'matchedTripDropoff' },
    { key: 'reconciledAt', label: 'reconciledAt' },
    { key: 'reconciledBy', label: 'reconciledBy' },
    // Financial (populated for "Matched" status)
    { key: 'tripTollCharges', label: 'tripTollCharges' },
    { key: 'refundAmount', label: 'refundAmount' },
    { key: 'lossAmount', label: 'lossAmount' },
    // Suggestion status (populated for "Unmatched" status)
    { key: 'hasSuggestions', label: 'hasSuggestions' },
    { key: 'isAmbiguous', label: 'isAmbiguous' },
    { key: 'topSuggestionScore', label: 'topSuggestionScore' },
    { key: 'topSuggestionTripId', label: 'topSuggestionTripId' },
    { key: 'suggestionCount', label: 'suggestionCount' },
];

/** Motor vehicle catalog export — column order and labels match `Vehicle database - new.csv` (+ system timestamps). */
export const VEHICLE_CATALOG_CSV_COLUMNS: CsvColumn<VehicleCatalogRecord>[] = [
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "production_start_year", label: "Production start year" },
    { key: "production_end_year", label: "Production end year" },
    {
        key: "production_start_month",
        label: "Production start month",
        formatter: (v) => formatCatalogMonthEnglish(v as number | null | undefined),
    },
    {
        key: "production_end_month",
        label: "Production end month",
        formatter: (v) => formatCatalogMonthEnglish(v as number | null | undefined),
    },
    { key: "trim_series", label: "Series / facelift" },
    { key: "generation", label: "Generation" },
    { key: "full_model_code", label: "Full Model Code" },
    { key: "chassis_code", label: "Chassis Code" },
    { key: "catalog_trim", label: "Trim" },
    { key: "emissions_prefix", label: "Emissions Prefix" },
    { key: "trim_suffix_code", label: "Trim Suffix Code" },
    { key: "engine_code", label: "Engine code" },
    { key: "engine_type", label: "Engine type" },
    { key: "body_type", label: "Body type" },
    { key: "doors", label: "Doors" },
    { key: "length_mm", label: "Length mm" },
    { key: "width_mm", label: "Width mm" },
    { key: "height_mm", label: "Height mm" },
    { key: "wheelbase_mm", label: "Wheelbase mm" },
    { key: "ground_clearance_mm", label: "Ground clearance mm" },
    { key: "engine_displacement_l", label: "Engine displacement L" },
    { key: "engine_displacement_cc", label: "Engine displacement cc" },
    { key: "engine_configuration", label: "Engine configuration" },
    { key: "fuel_category", label: "Fuel Category" },
    { key: "fuel_type", label: "Fuel type" },
    { key: "fuel_grade", label: "Fuel Grade" },
    { key: "transmission", label: "Transmission" },
    { key: "drivetrain", label: "Drivetrain" },
    { key: "horsepower", label: "Horsepower" },
    { key: "torque", label: "Torque" },
    { key: "torque_unit", label: "Torque unit" },
    { key: "fuel_tank_capacity", label: "Fuel tank capacity" },
    { key: "fuel_tank_unit", label: "Fuel tank unit" },
    { key: "fuel_economy_km_per_l", label: "fuel economy (km/L)" },
    { key: "estimated_km_per_refuel", label: "Estimated (Km) per re-fuel" },
    { key: "seating_capacity", label: "Seating capacity" },
    { key: "curb_weight_kg", label: "Curb weight kg" },
    { key: "gross_vehicle_weight_kg", label: "Gross vehicle weight kg" },
    { key: "max_payload_kg", label: "Max payload kg" },
    { key: "max_towing_kg", label: "Max towing kg" },
    { key: "front_brake_type", label: "Front brake type" },
    { key: "rear_brake_type", label: "Rear brake type" },
    { key: "brake_size_mm", label: "Brake size mm" },
    { key: "tire_size", label: "Tire size" },
    { key: "bolt_pattern", label: "Bolt pattern" },
    { key: "wheel_offset_mm", label: "Wheel offset mm" },
    { key: "engine_oil_capacity_l", label: "Engine oil capacity L" },
    { key: "coolant_capacity_l", label: "Coolant capacity L" },
    { key: "id", label: "ID" },
    { key: "created_at", label: "Created at", formatter: (v) => (v ? formatDateJM(String(v)) : "") },
    { key: "updated_at", label: "Updated at", formatter: (v) => (v ? formatDateJM(String(v)) : "") },
];