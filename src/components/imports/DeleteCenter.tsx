import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { DeleteCategoryCard } from './DeleteCategoryCard';
import { DeleteFlowModal, DeleteConfig, DeletePreviewColumn } from './DeleteFlowModal';
import { CategoryGroupCard, CategoryGroup } from './CategoryGroupCard';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ImportBatch } from '../../types/data';
import { BatchDeleteModal } from './BatchDeleteModal';
import { api } from '../../services/api';
import {
  MapPin, Car, Users, DollarSign, Fuel, Wrench, Gauge,
  ClipboardCheck, CreditCard, Building2, Tag, Package,
  HardDrive, Search, ArrowLeft, X, AlertTriangle, Trash2,
  FileText, Calendar, Loader2, RefreshCw, CheckSquare, Square, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Progress } from '../ui/progress';

// ═══════════════════════════════════════════════════════════════════════════
// Record count interface
// ═══════════════════════════════════════════════════════════════════════════

interface RecordCounts {
  trips: number | null;
  drivers: number | null;
  driverMetrics: number | null;
  vehicles: number | null;
  vehicleMetrics: number | null;
  fuel: number | null;
  fuelCards: number | null;
  stations: number | null;
  learntLocations: number | null;
  tollTags: number | null;
  tollPlazas: number | null;
  tollTransactions: number | null;
  transactions: number | null;
  claims: number | null;
  equipment: number | null;
  inventory: number | null;
  service: number | null;
  odometer: number | null;
  checkins: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Search keywords per category
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  trips: "trip data earnings rides distances durations fare breakdowns revenue mileage delete remove purge",
  tripsUber: "uber trips earnings rides platform uber delete remove purge",
  tripsInDrive: "indrive trips earnings rides platform indrive delete remove purge",
  tripsRoam: "roam trips earnings rides platform roam goride delete remove purge",
  drivers: "driver roster profiles contact license hire dates employees staff delete remove purge",
  driverMetrics: "driver metrics performance scorecards trips earnings ratings acceptance tier rankings delete remove purge",
  vehicles: "vehicle fleet cars plates vin registration insurance assignments delete remove purge",
  vehicleMetrics: "vehicle metrics performance earnings trips online hours efficiency delete remove purge",
  fuel: "fuel logs gas diesel purchase volumes costs locations card stations delete remove purge",
  fuelCards: "fuel cards provider vehicle assignments delete remove purge",
  stations: "gas stations fuel brands coordinates plus codes locations database verified delete remove purge",
  learntLocations: "learnt locations unverified stations addresses source delete remove purge",
  tollTags: "toll tags inventory numbers providers statuses vehicle assignments ezpass delete remove purge",
  tollPlazas: "toll plazas highways gps coordinates rates locations database delete remove purge",
  tollTransactions: "toll transactions usage charges deductions delete remove purge",
  transactions: "financial transactions money fare payouts fuel charges tolls adjustments payments billing delete remove purge",
  claims: "claims disputes losses resolution history claimable deductions delete remove purge",
  equipment: "equipment phones mounts cameras accessories assignments devices delete remove purge",
  inventory: "inventory stock levels reorder points supplier information parts supplies delete remove purge",
  service: "service maintenance logs oil change tire rotation repairs mechanic delete remove purge",
  odometer: "odometer history readings mileage fuel service check-in manual delete remove purge",
  checkins: "weekly check-ins checkins submissions odometer vehicle condition inspection delete remove purge",
  factoryReset: "factory reset wipe all data nuclear dangerous everything delete remove purge erase",
  importHistory: "import batch history upload csv file delete remove purge undo rollback",
};

// ═══════════════════════════════════════════════════════════════════════════
// Delete group membership
// ═══════════════════════════════════════════════════════════════════════════

const DELETE_GROUP_CARDS: Record<string, string[]> = {
  'trips': ['trips', 'tripsUber', 'tripsInDrive', 'tripsRoam'],
  'drivers': ['drivers', 'driverMetrics'],
  'vehicles': ['vehicles', 'vehicleMetrics'],
  'fuel': ['fuel', 'fuelCards', 'stations', 'learntLocations'],
  'toll': ['tollTags', 'tollPlazas', 'tollTransactions'],
  'finance': ['transactions', 'claims', 'equipment', 'inventory'],
  'maintenance': ['service', 'odometer', 'checkins'],
  'importHistory': ['importHistory'],
  'dangerZone': ['factoryReset'],
};

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Trips (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const TRIP_PREVIEW_COLUMNS: DeletePreviewColumn[] = [
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'platform', label: 'Platform' },
  { key: 'driverName', label: 'Driver' },
  { key: 'amount', label: 'Amount', render: (val: any) => val != null ? `$${Number(val).toFixed(2)}` : '—' },
  {
    key: 'pickupLocation', label: 'Route',
    render: (_val: any, item: any) => {
      const pickup = item.pickupLocation || '';
      const dropoff = item.dropoffLocation || '';
      if (!pickup && !dropoff) return '—';
      const short = (s: string) => s.length > 20 ? s.slice(0, 20) + '…' : s;
      return `${short(pickup)} → ${short(dropoff)}`;
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Drivers (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

const DRIVER_PREVIEW_COLUMNS: DeletePreviewColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', render: (v: any) => v || '—' },
  { key: 'phone', label: 'Phone', render: (v: any) => v || '—' },
  { key: 'licenseNumber', label: 'License #', render: (v: any) => v || '—' },
  { key: 'createdAt', label: 'Created', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
];

const DRIVER_METRICS_COLUMNS: DeletePreviewColumn[] = [
  { key: 'driverName', label: 'Driver' },
  { key: 'totalTrips', label: 'Total Trips', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'totalEarnings', label: 'Total Earnings', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'ratingLast500', label: 'Rating', render: (v: any) => v != null ? Number(v).toFixed(2) : '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Vehicles (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

const VEHICLE_PREVIEW_COLUMNS: DeletePreviewColumn[] = [
  {
    key: 'make', label: 'Make / Model / Year',
    render: (_v: any, item: any) => {
      const parts = [item.make, item.model, item.year].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : '—';
    },
  },
  { key: 'plateNumber', label: 'Plate #', render: (v: any) => v || '—' },
  { key: 'vin', label: 'VIN', render: (v: any) => v || '—' },
  { key: 'assignedDriverName', label: 'Assigned Driver', render: (v: any) => v || '—' },
];

const VEHICLE_METRICS_COLUMNS: DeletePreviewColumn[] = [
  { key: 'vehicleName', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'totalTrips', label: 'Total Trips', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'totalEarnings', label: 'Earnings', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'totalMiles', label: 'Miles', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Fuel & Stations (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

const FUEL_LOG_COLUMNS: DeletePreviewColumn[] = [
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'amount', label: 'Amount', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'stationName', label: 'Station', render: (v: any) => v || '—' },
  { key: 'driverName', label: 'Driver', render: (v: any) => v || '—' },
  { key: 'category', label: 'Category', render: (v: any) => v || '—' },
];

const FUEL_CARD_COLUMNS: DeletePreviewColumn[] = [
  { key: 'cardNumber', label: 'Card Number', render: (v: any) => v || '—' },
  { key: 'provider', label: 'Provider', render: (v: any) => v || '—' },
  { key: 'assignedVehicle', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'status', label: 'Status', render: (v: any) => v || '—' },
];

const STATION_COLUMNS: DeletePreviewColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'brand', label: 'Brand', render: (v: any) => v || '—' },
  { key: 'address', label: 'Address', render: (v: any) => v || '—' },
  { key: 'plusCode', label: 'Plus Code', render: (v: any) => v || '—' },
];

const LEARNT_LOCATION_COLUMNS: DeletePreviewColumn[] = [
  { key: 'name', label: 'Name', render: (v: any) => v || '(unnamed)' },
  { key: 'address', label: 'Address', render: (v: any) => v || '—' },
  { key: 'source', label: 'Source', render: (v: any) => v || '—' },
  { key: 'createdAt', label: 'Created', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Toll Management (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

const TOLL_TAG_COLUMNS: DeletePreviewColumn[] = [
  { key: 'tagNumber', label: 'Tag Number', render: (v: any) => v || '—' },
  { key: 'provider', label: 'Provider', render: (v: any) => v || '—' },
  { key: 'vehiclePlate', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'status', label: 'Status', render: (v: any) => v || '—' },
];

const TOLL_PLAZA_COLUMNS: DeletePreviewColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'highway', label: 'Highway', render: (v: any) => v || '—' },
  {
    key: 'lat', label: 'Coordinates',
    render: (_v: any, item: any) => {
      if (item.lat && item.lng) return `${Number(item.lat).toFixed(4)}, ${Number(item.lng).toFixed(4)}`;
      return '—';
    },
  },
  { key: 'rate', label: 'Rate', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
];

const TOLL_TXN_COLUMNS: DeletePreviewColumn[] = [
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'amount', label: 'Amount', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'description', label: 'Description', render: (v: any) => v || '—' },
  { key: 'driverName', label: 'Driver', render: (v: any) => v || '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Finance & Assets (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

const FINANCIAL_TXN_COLUMNS: DeletePreviewColumn[] = [
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'amount', label: 'Amount', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'category', label: 'Category', render: (v: any) => v || '—' },
  { key: 'description', label: 'Description', render: (v: any) => v || '—' },
  { key: 'driverName', label: 'Driver', render: (v: any) => v || '—' },
];

const CLAIM_COLUMNS: DeletePreviewColumn[] = [
  { key: 'claimNumber', label: 'Claim #', render: (v: any) => v || '—' },
  { key: 'type', label: 'Type', render: (v: any) => v || '—' },
  { key: 'amount', label: 'Amount', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'status', label: 'Status', render: (v: any) => v || '—' },
  { key: 'driverName', label: 'Driver', render: (v: any) => v || '—' },
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
];

const EQUIPMENT_COLUMNS: DeletePreviewColumn[] = [
  { key: 'name', label: 'Name', render: (v: any) => v || '—' },
  { key: 'type', label: 'Type', render: (v: any) => v || '—' },
  { key: 'serialNumber', label: 'Serial #', render: (v: any) => v || '—' },
  { key: 'assignedTo', label: 'Assigned To', render: (v: any) => v || '—' },
  { key: 'status', label: 'Status', render: (v: any) => v || '—' },
];

const INVENTORY_COLUMNS: DeletePreviewColumn[] = [
  { key: 'itemName', label: 'Item', render: (v: any) => v || '—' },
  { key: 'category', label: 'Category', render: (v: any) => v || '—' },
  { key: 'quantity', label: 'Qty', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'reorderPoint', label: 'Reorder Pt', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'supplier', label: 'Supplier', render: (v: any) => v || '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Column definitions — Maintenance & Ops (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_LOG_COLUMNS: DeletePreviewColumn[] = [
  { key: 'vehicleName', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'serviceType', label: 'Service Type', render: (v: any) => v || '—' },
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'cost', label: 'Cost', render: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
  { key: 'provider', label: 'Provider', render: (v: any) => v || '—' },
];

const ODOMETER_COLUMNS: DeletePreviewColumn[] = [
  { key: 'vehicleName', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'reading', label: 'Reading', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'source', label: 'Source', render: (v: any) => v || '—' },
  { key: 'date', label: 'Date', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
];

const CHECKIN_COLUMNS: DeletePreviewColumn[] = [
  { key: 'driverName', label: 'Driver', render: (v: any) => v || '—' },
  { key: 'vehicleName', label: 'Vehicle', render: (v: any) => v || '—' },
  { key: 'weekStart', label: 'Week', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
  { key: 'odometerReading', label: 'Odometer', render: (v: any) => v != null ? Number(v).toLocaleString() : '—' },
  { key: 'submittedAt', label: 'Submitted', render: (val: any) => val ? new Date(val).toLocaleDateString() : '—' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Trips (Phase 4)
// ═══════════════════════════════════════════════════════════════════════════

const TRIP_FIELDS = ['id', 'date', 'platform', 'driverName', 'amount', 'pickupLocation', 'dropoffLocation', 'distance'];

function buildTripFetchItems(platformFilter?: string) {
  return async (config: DeleteConfig) => {
    const { items } = await api.bulkDeletePreview({
      prefix: 'trip:',
      startDate: config.isAllTime ? '1970-01-01' : config.startDate,
      endDate: config.isAllTime ? '2100-01-01' : config.endDate,
      dateField: 'date',
      driverId: config.driverId && config.driverId !== '__all__' ? config.driverId : undefined,
      platform: platformFilter || undefined,
      fields: TRIP_FIELDS,
    });
    return items;
  };
}

async function tripDeleteItems(keys: string[]): Promise<number> {
  // 1. Delete the trip records themselves
  const result = await api.bulkDeleteExecute({ keys, cleanupStorage: false });

  // 2. Clean up associated ledger entries (sourceType === 'trip')
  //    Extract trip IDs from keys like "trip:abc-123" → "abc-123"
  try {
    const { items: ledgerItems } = await api.bulkDeletePreview({
      prefix: 'ledger:',
      startDate: '1970-01-01',
      endDate: '2100-01-01',
      fields: ['id', 'sourceType', 'sourceId'],
    });
    const tripIds = new Set(keys.map(k => k.replace('trip:', '')));
    const orphanedLedgerKeys = ledgerItems
      .filter((item: any) => item.sourceType === 'trip' && tripIds.has(item.sourceId))
      .map((item: any) => item.key || `ledger:${item.id}`);

    if (orphanedLedgerKeys.length > 0) {
      await api.bulkDeleteExecute({ keys: orphanedLedgerKeys, cleanupStorage: false });
      console.log(`[TripDelete] Cleaned up ${orphanedLedgerKeys.length} associated ledger entries`);
    }
  } catch (ledgerErr) {
    // Ledger cleanup failure should not break the trip delete — log and move on
    console.warn('[TripDelete] Ledger cleanup failed (non-fatal):', ledgerErr);
  }

  return result.deletedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Drivers (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchDriverProfiles(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'driver:',
    fields: ['id', 'name', 'email', 'phone', 'licenseNumber', 'createdAt'],
  });
  return items;
}

async function fetchDriverMetrics(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'driver_metric:',
    fields: ['id', 'driverName', 'totalTrips', 'totalEarnings', 'ratingLast500'],
  });
  return items;
}

async function genericBulkDelete(keys: string[], cleanup = false): Promise<number> {
  const result = await api.bulkDeleteExecute({ keys, cleanupStorage: cleanup });
  return result.deletedCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Vehicles (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchVehicleRecords(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'vehicle:',
    fields: ['id', 'make', 'model', 'year', 'plateNumber', 'vin', 'assignedDriverName'],
  });
  return items;
}

async function fetchVehicleMetrics(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'vehicle_metric:',
    fields: ['id', 'vehicleName', 'totalTrips', 'totalEarnings', 'totalMiles'],
  });
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Fuel & Stations (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchFuelLogs(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'fuel_entry:',
    startDate: config.isAllTime ? '1970-01-01' : config.startDate,
    endDate: config.isAllTime ? '2100-01-01' : config.endDate,
    dateField: 'date',
    driverId: config.driverId && config.driverId !== '__all__' ? config.driverId : undefined,
    fields: ['id', 'date', 'amount', 'stationName', 'driverName', 'category', 'receiptUrl'],
  });
  return items;
}

async function fuelLogDeleteItems(keys: string[]): Promise<number> {
  const result = await api.bulkDeleteExecute({ keys, cleanupStorage: true });
  return result.deletedCount;
}

async function fetchFuelCards(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'fuel_card:',
    fields: ['id', 'cardNumber', 'provider', 'assignedVehicle', 'status'],
  });
  return items;
}

async function fetchStations(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'station:',
    fields: ['id', 'name', 'brand', 'address', 'plusCode'],
  });
  return items;
}

async function fetchLearntLocations(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'learnt_location:',
    fields: ['id', 'name', 'address', 'source', 'createdAt'],
  });
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Toll Management (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchTollTags(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'toll_tag:',
    fields: ['id', 'tagNumber', 'provider', 'vehiclePlate', 'status'],
  });
  return items;
}

async function fetchTollPlazas(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'toll_plaza:',
    fields: ['id', 'name', 'highway', 'lat', 'lng', 'rate'],
  });
  return items;
}

async function fetchTollTransactions(config: DeleteConfig) {
  // Toll transactions share the `transaction:` prefix; filter by toll-related categories
  const { items } = await api.bulkDeletePreview({
    prefix: 'transaction:',
    startDate: config.isAllTime ? '1970-01-01' : config.startDate,
    endDate: config.isAllTime ? '2100-01-01' : config.endDate,
    dateField: 'date',
    driverId: config.driverId && config.driverId !== '__all__' ? config.driverId : undefined,
    fields: ['id', 'date', 'amount', 'description', 'driverName', 'category'],
  });
  // Client-side filter for toll-related categories
  return items.filter((item: any) => {
    const cat = (item.category || '').toLowerCase();
    return cat.includes('toll') || cat.includes('top-up') || cat.includes('topup');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Finance & Assets (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchFinancialTransactions(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'transaction:',
    startDate: config.isAllTime ? '1970-01-01' : config.startDate,
    endDate: config.isAllTime ? '2100-01-01' : config.endDate,
    dateField: 'date',
    driverId: config.driverId && config.driverId !== '__all__' ? config.driverId : undefined,
    fields: ['id', 'date', 'amount', 'category', 'description', 'driverName', 'receiptUrl'],
  });
  return items;
}

async function financialTxnDeleteItems(keys: string[]): Promise<number> {
  // cleanupStorage: true because transactions may have receipt/invoice URLs
  const result = await api.bulkDeleteExecute({ keys, cleanupStorage: true });
  return result.deletedCount;
}

async function fetchClaims(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'claim:',
    startDate: config.isAllTime ? undefined : config.startDate,
    endDate: config.isAllTime ? undefined : config.endDate,
    dateField: 'date',
    fields: ['id', 'claimNumber', 'type', 'amount', 'status', 'driverName', 'date'],
  });
  return items;
}

async function fetchEquipment(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'equipment:',
    fields: ['id', 'name', 'type', 'serialNumber', 'assignedTo', 'status'],
  });
  return items;
}

async function fetchInventory(_config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'inventory:',
    fields: ['id', 'itemName', 'category', 'quantity', 'reorderPoint', 'supplier'],
  });
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Maintenance & Ops (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchServiceLogs(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'maintenance_log:',
    startDate: config.isAllTime ? undefined : config.startDate,
    endDate: config.isAllTime ? undefined : config.endDate,
    dateField: 'date',
    fields: ['id', 'vehicleName', 'serviceType', 'date', 'cost', 'provider'],
  });
  return items;
}

async function fetchOdometerReadings(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'odometer_reading:',
    startDate: config.isAllTime ? undefined : config.startDate,
    endDate: config.isAllTime ? undefined : config.endDate,
    dateField: 'date',
    fields: ['id', 'vehicleName', 'reading', 'source', 'date'],
  });
  return items;
}

async function fetchCheckins(config: DeleteConfig) {
  const { items } = await api.bulkDeletePreview({
    prefix: 'checkin:',
    startDate: config.isAllTime ? undefined : config.startDate,
    endDate: config.isAllTime ? undefined : config.endDate,
    dateField: 'weekStart',
    fields: ['id', 'driverName', 'vehicleName', 'weekStart', 'odometerReading', 'submittedAt'],
  });
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers — Factory Reset (Phase 7)
// ═══════════════════════════════════════════════════════════════════════════

const FACTORY_RESET_PREFIXES = [
  'trip:', 'batch:', 'driver:', 'driver_metric:', 'vehicle:', 'vehicle_metric:',
  'transaction:', 'fuel_entry:', 'fuel_card:', 'station:', 'learnt_location:',
  'toll_tag:', 'toll_plaza:', 'claim:', 'equipment:', 'inventory:',
  'maintenance_log:', 'odometer_reading:', 'checkin:', 'organization_metric:',
];

async function fetchAllForFactoryReset(_config: DeleteConfig) {
  const results = await Promise.all(
    FACTORY_RESET_PREFIXES.map(prefix =>
      api.bulkDeletePreview({ prefix, fields: ['id'] }).catch(() => ({ items: [], totalCount: 0 }))
    )
  );
  return results.flatMap(r => r.items);
}

async function factoryResetDeleteItems(keys: string[]): Promise<number> {
  let total = 0;
  const chunkSize = 1000;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const result = await api.bulkDeleteExecute({ keys: chunk, cleanupStorage: true });
    total += result.deletedCount;
  }
  return total;
}

const FACTORY_RESET_CHECKLIST = (
  <div className="space-y-2">
    <span>This operation will permanently erase <strong>ALL</strong> data from the system:</span>
    <ul className="list-none space-y-1 mt-2">
      {[
        'Trip records (all platforms)',
        'Financial transactions & claims',
        'Driver profiles & performance metrics',
        'Vehicle records & performance metrics',
        'Fuel logs, fuel cards & receipts',
        'Gas stations & learnt locations',
        'Toll tags, plazas & transactions',
        'Equipment & inventory records',
        'Service logs & odometer readings',
        'Weekly check-in submissions',
      ].map(item => (
        <li key={item} className="flex items-center gap-2 text-rose-700">
          <span className="inline-block w-3.5 h-3.5 rounded bg-rose-200 text-[9px] text-center leading-[14px] shrink-0">&#10003;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function DeleteCenter() {
  const [deleteGroup, setDeleteGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [counts, setCounts] = useState<RecordCounts>({
    trips: null, drivers: null, driverMetrics: null,
    vehicles: null, vehicleMetrics: null, fuel: null,
    fuelCards: null, stations: null, learntLocations: null,
    tollTags: null, tollPlazas: null, tollTransactions: null,
    transactions: null, claims: null, equipment: null,
    inventory: null, service: null, odometer: null, checkins: null,
  });

  // ─── Import History batch state ───────────────────────────────────────
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDateFrom, setBatchDateFrom] = useState('');
  const [batchDateTo, setBatchDateTo] = useState('');

  // ─── Bulk batch delete state ───────────────────────────────────────────
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{
    current: number;
    total: number;
    currentBatchName: string;
    results: Array<{ batchId: string; fileName: string; success: boolean; trips?: number; error?: string }>;
  } | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // ─── Database Diagnostic counts (orphan detection) ────────────────────
  const [diagCounts, setDiagCounts] = useState<{ trips: number; ledgerEntries: number; transactions: number } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ orphansFound: number; deletedCount: number } | null>(null);

  const fetchDiagCounts = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const result = await api.getLedgerCount();
      setDiagCounts(result);
    } catch (err: any) {
      setDiagError(err.message || 'Failed to fetch counts');
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const handlePurgeOrphans = useCallback(async () => {
    setPurging(true);
    setPurgeResult(null);
    try {
      const result = await api.purgeOrphanedLedgers();
      setPurgeResult({ orphansFound: result.orphansFound, deletedCount: result.deletedCount });
      toast.success(`Purged ${result.deletedCount.toLocaleString()} orphaned ledger entries`);
      // Refresh diagnostic counts
      fetchDiagCounts();
    } catch (err: any) {
      toast.error(`Purge failed: ${err.message}`);
      console.error('[PurgeOrphans] Frontend error:', err);
    } finally {
      setPurging(false);
    }
  }, [fetchDiagCounts]);

  useEffect(() => { fetchDiagCounts(); }, [fetchDiagCounts]);

  // ─── Load record counts on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const safeCount = async (key: keyof RecordCounts, fn: () => Promise<any>) => {
      try {
        const result = await fn();
        if (!cancelled) {
          const count = Array.isArray(result) ? result.length : (result?.total ?? result?.totalTrips ?? result?.totalCount ?? null);
          setCounts(prev => ({ ...prev, [key]: count }));
        }
      } catch {
        // Non-critical — leave as null
      }
    };

    const bulkCount = async (key: keyof RecordCounts, prefix: string) => {
      safeCount(key, async () => {
        const r = await api.bulkDeletePreview({ prefix, fields: ['id'] });
        return { total: r.totalCount };
      });
    };

    // Fire all counts in parallel
    safeCount('trips', () => api.getTripStats({}));
    safeCount('drivers', () => api.getDrivers());
    safeCount('vehicles', () => api.getVehicles());
    safeCount('driverMetrics', () => api.getDriverMetrics());
    safeCount('vehicleMetrics', () => api.getVehicleMetrics());
    safeCount('transactions', () => api.getTransactions());
    safeCount('tollTags', () => api.getTollTags());
    safeCount('tollPlazas', () => api.getTollPlazas());
    safeCount('stations', () => api.getStations());
    safeCount('claims', () => api.getClaims());
    safeCount('equipment', async () => {
      const { equipmentService } = await import('../../services/equipmentService');
      return equipmentService.getAllEquipment();
    });
    safeCount('inventory', async () => {
      const { inventoryService } = await import('../../services/inventoryService');
      return inventoryService.getInventory();
    });

    // Prefix-based counts via bulkDeletePreview
    bulkCount('fuel', 'fuel_entry:');
    bulkCount('fuelCards', 'fuel_card:');
    bulkCount('learntLocations', 'learnt_location:');
    bulkCount('service', 'maintenance_log:');
    bulkCount('odometer', 'odometer_reading:');
    bulkCount('checkins', 'checkin:');

    // Toll transactions: count transaction: items that are toll-category
    safeCount('tollTransactions', async () => {
      const { items } = await api.bulkDeletePreview({ prefix: 'transaction:', fields: ['id', 'category'] });
      const tollItems = items.filter((item: any) => {
        const cat = (item.category || '').toLowerCase();
        return cat.includes('toll') || cat.includes('top-up') || cat.includes('topup');
      });
      return { total: tollItems.length };
    });

    return () => { cancelled = true; };
  }, []);

  // ─── Refresh counts after successful deletion ─────────────────────────
  const handleDeleteSuccess = useCallback((_deletedCount: number) => {
    const refetch = async () => {
      try {
        const [tripStats, drivers, vehicles, driverMetrics, vehicleMetrics, stations, transactions, tollTags, tollPlazas, claims,
          fuelResult, fuelCardsResult, learntResult, serviceResult, odoResult, checkinResult] = await Promise.all([
          api.getTripStats({}).catch(() => null),
          api.getDrivers().catch(() => null),
          api.getVehicles().catch(() => null),
          api.getDriverMetrics().catch(() => null),
          api.getVehicleMetrics().catch(() => null),
          api.getStations().catch(() => null),
          api.getTransactions().catch(() => null),
          api.getTollTags().catch(() => null),
          api.getTollPlazas().catch(() => null),
          api.getClaims().catch(() => null),
          api.bulkDeletePreview({ prefix: 'fuel_entry:', fields: ['id'] }).catch(() => null),
          api.bulkDeletePreview({ prefix: 'fuel_card:', fields: ['id'] }).catch(() => null),
          api.bulkDeletePreview({ prefix: 'learnt_location:', fields: ['id'] }).catch(() => null),
          api.bulkDeletePreview({ prefix: 'maintenance_log:', fields: ['id'] }).catch(() => null),
          api.bulkDeletePreview({ prefix: 'odometer_reading:', fields: ['id'] }).catch(() => null),
          api.bulkDeletePreview({ prefix: 'checkin:', fields: ['id'] }).catch(() => null),
        ]);
        setCounts(prev => ({
          ...prev,
          trips: tripStats ? (tripStats.totalTrips ?? tripStats.total ?? prev.trips) : prev.trips,
          drivers: Array.isArray(drivers) ? drivers.length : prev.drivers,
          vehicles: Array.isArray(vehicles) ? vehicles.length : prev.vehicles,
          driverMetrics: Array.isArray(driverMetrics) ? driverMetrics.length : prev.driverMetrics,
          vehicleMetrics: Array.isArray(vehicleMetrics) ? vehicleMetrics.length : prev.vehicleMetrics,
          stations: Array.isArray(stations) ? stations.length : prev.stations,
          transactions: Array.isArray(transactions) ? transactions.length : prev.transactions,
          tollTags: Array.isArray(tollTags) ? tollTags.length : prev.tollTags,
          tollPlazas: Array.isArray(tollPlazas) ? tollPlazas.length : prev.tollPlazas,
          claims: Array.isArray(claims) ? claims.length : prev.claims,
          fuel: fuelResult ? fuelResult.totalCount : prev.fuel,
          fuelCards: fuelCardsResult ? fuelCardsResult.totalCount : prev.fuelCards,
          learntLocations: learntResult ? learntResult.totalCount : prev.learntLocations,
          service: serviceResult ? serviceResult.totalCount : prev.service,
          odometer: odoResult ? odoResult.totalCount : prev.odometer,
          checkins: checkinResult ? checkinResult.totalCount : prev.checkins,
        }));
      } catch {
        // Ignore
      }
    };
    refetch();
  }, []);

  // ─── Fetch batches when entering Import History group ─────────────────
  useEffect(() => {
    if (deleteGroup !== 'importHistory') return;
    let cancelled = false;
    setBatchesLoading(true);
    setBatchesError(null);
    api.getBatches()
      .then(data => {
        if (cancelled) return;
        // Sort newest first
        const sorted = [...data].sort((a, b) =>
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
        );
        setBatches(sorted);
      })
      .catch(err => {
        if (!cancelled) setBatchesError(err.message || 'Failed to load batches');
      })
      .finally(() => {
        if (!cancelled) setBatchesLoading(false);
      });
    return () => { cancelled = true; };
  }, [deleteGroup]);

  // ─── Bulk batch delete handler ─────────────────────────────────────────
  const handleBulkBatchDelete = async () => {
    const idsToDelete = Array.from(selectedBatchIds);
    const batchesToDelete = batches.filter(b => idsToDelete.includes(b.id));
    if (batchesToDelete.length === 0) return;

    setBulkDeleting(true);
    setBulkDeleteProgress({
      current: 0,
      total: batchesToDelete.length,
      currentBatchName: batchesToDelete[0].fileName,
      results: [],
    });

    const results: Array<{ batchId: string; fileName: string; success: boolean; trips?: number; error?: string }> = [];

    for (let i = 0; i < batchesToDelete.length; i++) {
      const batch = batchesToDelete[i];
      setBulkDeleteProgress(prev => prev ? {
        ...prev,
        current: i,
        currentBatchName: batch.fileName,
      } : prev);

      try {
        const res = await api.deleteBatch(batch.id);
        results.push({
          batchId: batch.id,
          fileName: batch.fileName,
          success: true,
          trips: res.deletedTrips,
        });
      } catch (err: any) {
        console.error(`[Bulk delete] Failed to delete batch ${batch.id}:`, err);
        results.push({
          batchId: batch.id,
          fileName: batch.fileName,
          success: false,
          error: err.message || 'Unknown error',
        });
      }

      setBulkDeleteProgress(prev => prev ? {
        ...prev,
        current: i + 1,
        results: [...results],
      } : prev);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalTrips = results.reduce((sum, r) => sum + (r.trips || 0), 0);

    if (successCount > 0) {
      toast.success(
        `Bulk delete complete: ${successCount} batch${successCount !== 1 ? 'es' : ''} deleted (${totalTrips.toLocaleString()} trips removed)` +
        (failCount > 0 ? ` — ${failCount} failed` : ''),
        { duration: 8000 }
      );
    }
    if (failCount > 0 && successCount === 0) {
      toast.error(`All ${failCount} batch deletes failed`);
    }

    // Clean up: remove deleted batches from list, clear selection
    const deletedIds = new Set(results.filter(r => r.success).map(r => r.batchId));
    setBatches(prev => prev.filter(b => !deletedIds.has(b.id)));
    setSelectedBatchIds(new Set());
    setBulkDeleting(false);
    // Keep modal open to show results — user closes manually
  };

  // ─── Search helpers ────────────────────────────────────────────────────

  const matchesSearch = useCallback((keywords: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return keywords.toLowerCase().includes(q);
  }, [searchQuery]);

  const hasVisibleCards = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (deleteGroup) {
      const memberKeys = DELETE_GROUP_CARDS[deleteGroup] || [];
      return memberKeys.some(key => CATEGORY_SEARCH_TERMS[key]?.toLowerCase().includes(q));
    }
    return Object.values(CATEGORY_SEARCH_TERMS).some(kw => kw.toLowerCase().includes(q));
  }, [searchQuery, deleteGroup]);

  // ─── Group definitions ────────────────────────────────────────────────

  const deleteGroups: CategoryGroup[] = [
    { id: 'trips', title: 'Trips & Earnings', description: 'Delete trip records — all platforms or filter by Uber, InDrive, or Roam', icon: <MapPin className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 4 },
    { id: 'drivers', title: 'Drivers & Staff', description: 'Delete driver profiles and performance scorecards', icon: <Users className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 2 },
    { id: 'vehicles', title: 'Fleet & Vehicles', description: 'Delete vehicle records and performance metrics', icon: <Car className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 2 },
    { id: 'fuel', title: 'Fuel & Stations', description: 'Delete fuel logs, fuel cards, stations, and learnt locations', icon: <Fuel className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 4 },
    { id: 'toll', title: 'Toll Management', description: 'Delete toll tags, plazas, and toll transactions', icon: <CreditCard className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 3 },
    { id: 'finance', title: 'Finance & Assets', description: 'Delete transactions, claims, equipment, and inventory', icon: <DollarSign className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 4 },
    { id: 'maintenance', title: 'Maintenance & Ops', description: 'Delete service logs, odometer readings, and weekly check-ins', icon: <Wrench className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 3 },
    { id: 'importHistory', title: 'Import History', description: 'Delete an entire import batch — removes all trips, transactions, ledger entries, and metrics it created', icon: <HardDrive className="h-5 w-5" />, iconColor: 'bg-rose-50 text-rose-600', itemCount: 1, badge: 'Cascade' },
    { id: 'dangerZone', title: 'Danger Zone', description: 'Factory reset — permanently erase ALL data from the system', icon: <AlertTriangle className="h-5 w-5" />, iconColor: 'bg-red-100 text-red-700', itemCount: 1, badge: 'Destructive' },
  ];

  const activeDeleteGroupMeta = deleteGroup ? deleteGroups.find(g => g.id === deleteGroup) : null;

  // Orphan heuristic: ledger entries vastly exceed what trips + transactions could explain
  // Each trip can produce up to ~4 ledger entries; each transaction ~1 entry
  const hasOrphanedLedgers = diagCounts
    ? diagCounts.ledgerEntries > (diagCounts.trips * 5 + diagCounts.transactions * 2 + 10)
    : false;

  const groupMatchesDeleteSearch = (groupId: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const grp = deleteGroups.find(g => g.id === groupId);
    if (grp && (grp.title.toLowerCase().includes(q) || grp.description.toLowerCase().includes(q))) return true;
    const memberKeys = DELETE_GROUP_CARDS[groupId] || [];
    return memberKeys.some(key => CATEGORY_SEARCH_TERMS[key]?.toLowerCase().includes(q));
  };
  const filteredDeleteGroups = deleteGroups.filter(g => groupMatchesDeleteSearch(g.id));

  // ─── Helper: render a filtered card grid ──────────────────────────────

  const renderCardGrid = (
    cards: { key: string; title: string; description: string; icon: React.ReactNode; recordCount: number | null; badge?: string; modalId: string }[]
  ) => {
    const filtered = cards.filter(c =>
      matchesSearch(CATEGORY_SEARCH_TERMS[c.key] || c.title + ' ' + c.description)
    );

    if (filtered.length === 0) {
      return (
        <div className="text-center py-10 text-slate-400">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">No items match &ldquo;{searchQuery}&rdquo;</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map(card => (
          <DeleteCategoryCard
            key={card.key}
            title={card.title}
            description={card.description}
            icon={card.icon}
            recordCount={card.recordCount}
            badge={card.badge}
            onDelete={() => setActiveModal(card.modalId)}
          />
        ))}
      </div>
    );
  };

  // ─── Render cards for drilled-in group ────────────────────────────────

  const renderGroupCards = () => {
    if (!deleteGroup) return null;

    // ═══ TRIPS (Phase 4) ═══
    if (deleteGroup === 'trips') {
      return renderCardGrid([
        { key: 'trips', title: 'All Trips', description: 'Delete all trip records across all platforms', icon: <MapPin className="h-5 w-5" />, recordCount: counts.trips, modalId: 'deleteAllTrips' },
        { key: 'tripsUber', title: 'Uber Trips Only', description: 'Delete only Uber platform trip records', icon: <span className="font-bold text-sm">UB</span>, badge: 'Platform Filter', recordCount: null, modalId: 'deleteUberTrips' },
        { key: 'tripsInDrive', title: 'InDrive Trips Only', description: 'Delete only InDrive platform trip records', icon: <span className="font-bold text-sm">IN</span>, badge: 'Platform Filter', recordCount: null, modalId: 'deleteInDriveTrips' },
        { key: 'tripsRoam', title: 'Roam Trips Only', description: 'Delete only Roam platform trip records', icon: <span className="font-bold text-sm">RM</span>, badge: 'Platform Filter', recordCount: null, modalId: 'deleteRoamTrips' },
      ]);
    }

    // ═══ DRIVERS (Phase 5) ═══
    if (deleteGroup === 'drivers') {
      return renderCardGrid([
        { key: 'drivers', title: 'Driver Profiles', description: 'Delete driver profile records (does not remove associated trips or transactions)', icon: <Users className="h-5 w-5" />, recordCount: counts.drivers, modalId: 'deleteDriverProfiles' },
        { key: 'driverMetrics', title: 'Driver Metrics', description: 'Delete cached driver performance scorecards (will regenerate from trip data)', icon: <Users className="h-5 w-5" />, badge: 'Regenerable', recordCount: counts.driverMetrics, modalId: 'deleteDriverMetrics' },
      ]);
    }

    // ═══ VEHICLES (Phase 5) ═══
    if (deleteGroup === 'vehicles') {
      return renderCardGrid([
        { key: 'vehicles', title: 'Vehicle Records', description: 'Delete vehicle profiles with plate, VIN, and registration data', icon: <Car className="h-5 w-5" />, recordCount: counts.vehicles, modalId: 'deleteVehicleRecords' },
        { key: 'vehicleMetrics', title: 'Vehicle Metrics', description: 'Delete cached vehicle performance metrics (will regenerate from trip data)', icon: <Car className="h-5 w-5" />, badge: 'Regenerable', recordCount: counts.vehicleMetrics, modalId: 'deleteVehicleMetrics' },
      ]);
    }

    // ═══ FUEL (Phase 5) ═══
    if (deleteGroup === 'fuel') {
      return renderCardGrid([
        { key: 'fuel', title: 'Fuel Logs', description: 'Delete fuel purchase records and receipts', icon: <Fuel className="h-5 w-5" />, recordCount: counts.fuel, modalId: 'deleteFuelLogs' },
        { key: 'fuelCards', title: 'Fuel Cards', description: 'Delete fuel card assignments and provider records', icon: <CreditCard className="h-5 w-5" />, recordCount: counts.fuelCards, modalId: 'deleteFuelCards' },
        { key: 'stations', title: 'Gas Stations', description: 'Delete verified gas station database entries', icon: <Building2 className="h-5 w-5" />, recordCount: counts.stations, modalId: 'deleteStations' },
        { key: 'learntLocations', title: 'Learnt Locations', description: 'Delete unverified/learnt station locations', icon: <MapPin className="h-5 w-5" />, recordCount: counts.learntLocations, modalId: 'deleteLearntLocations' },
      ]);
    }

    // ═══ TOLL (Phase 6) ═══
    if (deleteGroup === 'toll') {
      return renderCardGrid([
        { key: 'tollTags', title: 'Toll Tags', description: 'Delete toll tag inventory and assignments', icon: <Tag className="h-5 w-5" />, recordCount: counts.tollTags, modalId: 'deleteTollTags' },
        { key: 'tollPlazas', title: 'Toll Plazas', description: 'Delete toll plaza database with GPS coordinates and rates', icon: <Building2 className="h-5 w-5" />, recordCount: counts.tollPlazas, modalId: 'deleteTollPlazas' },
        { key: 'tollTransactions', title: 'Toll Transactions', description: 'Delete toll usage, top-up, and deduction records', icon: <CreditCard className="h-5 w-5" />, recordCount: counts.tollTransactions, modalId: 'deleteTollTransactions' },
      ]);
    }

    // ═══ FINANCE (Phase 6) ═══
    if (deleteGroup === 'finance') {
      return renderCardGrid([
        { key: 'transactions', title: 'Financial Transactions', description: 'Delete all financial transaction records (payouts, charges, adjustments)', icon: <DollarSign className="h-5 w-5" />, recordCount: counts.transactions, modalId: 'deleteFinancialTransactions' },
        { key: 'claims', title: 'Claims & Disputes', description: 'Delete claims, disputes, and resolution records', icon: <Package className="h-5 w-5" />, recordCount: counts.claims, modalId: 'deleteClaims' },
        { key: 'equipment', title: 'Equipment', description: 'Delete fleet equipment assignments and device records', icon: <Wrench className="h-5 w-5" />, recordCount: counts.equipment, modalId: 'deleteEquipment' },
        { key: 'inventory', title: 'Inventory', description: 'Delete stock inventory and reorder point records', icon: <Package className="h-5 w-5" />, recordCount: counts.inventory, modalId: 'deleteInventory' },
      ]);
    }

    // ═══ MAINTENANCE (Phase 6) ═══
    if (deleteGroup === 'maintenance') {
      return renderCardGrid([
        { key: 'service', title: 'Service Logs', description: 'Delete vehicle maintenance and service history records', icon: <Wrench className="h-5 w-5" />, recordCount: counts.service, modalId: 'deleteServiceLogs' },
        { key: 'odometer', title: 'Odometer Readings', description: 'Delete odometer reading history', icon: <Gauge className="h-5 w-5" />, recordCount: counts.odometer, modalId: 'deleteOdometerReadings' },
        { key: 'checkins', title: 'Weekly Check-ins', description: 'Delete driver weekly check-in submissions', icon: <ClipboardCheck className="h-5 w-5" />, recordCount: counts.checkins, modalId: 'deleteCheckins' },
      ]);
    }

    // ═══ IMPORT HISTORY (Phase 4 — dynamic batch list) ═══
    if (deleteGroup === 'importHistory') {
      // Loading state
      if (batchesLoading) {
        return (
          <div className="text-center py-10 text-slate-400">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-60" />
            <p className="text-sm font-medium">Loading import batches…</p>
          </div>
        );
      }

      // Error state
      if (batchesError) {
        return (
          <div className="text-center py-10 text-slate-400">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
            <p className="text-sm font-medium text-slate-600">Failed to load batches</p>
            <p className="text-xs mt-1 text-slate-400">{batchesError}</p>
            <Button
              variant="outline" size="sm" className="mt-3"
              onClick={() => {
                setBatchesLoading(true);
                setBatchesError(null);
                api.getBatches()
                  .then(data => setBatches([...data].sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())))
                  .catch(err => setBatchesError(err.message))
                  .finally(() => setBatchesLoading(false));
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        );
      }

      // Empty state
      if (batches.length === 0) {
        return (
          <div className="text-center py-10 text-slate-400">
            <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No import batches found</p>
            <p className="text-xs mt-1">Import data from the Import tab first</p>
          </div>
        );
      }

      // Filter by search + date range
      const filteredBatches = batches.filter(b => {
        // Text search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const haystack = `${b.fileName} ${b.type} ${b.id} ${b.status} ${b.uploadDate} ${(b as any).platform || ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        // Date range filter (on upload date)
        if (batchDateFrom) {
          const from = new Date(batchDateFrom);
          from.setHours(0, 0, 0, 0);
          if (new Date(b.uploadDate) < from) return false;
        }
        if (batchDateTo) {
          const to = new Date(batchDateTo);
          to.setHours(23, 59, 59, 999);
          if (new Date(b.uploadDate) > to) return false;
        }
        return true;
      });

      if (filteredBatches.length === 0) {
        const hasFilters = searchQuery.trim() || batchDateFrom || batchDateTo;
        return (
          <div className="text-center py-10 text-slate-400">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {hasFilters ? 'No batches match your filters' : 'No batches found'}
            </p>
            <p className="text-xs mt-1">
              {searchQuery.trim() ? `Search: "${searchQuery}"` : ''}
              {searchQuery.trim() && (batchDateFrom || batchDateTo) ? ' · ' : ''}
              {batchDateFrom || batchDateTo ? `Date: ${batchDateFrom || '…'} to ${batchDateTo || '…'}` : ''}
              {!hasFilters ? 'Import data from the Import tab first' : ''}
            </p>
            {hasFilters && (
              <Button variant="outline" size="sm" className="mt-3"
                onClick={() => { setSearchQuery(''); setBatchDateFrom(''); setBatchDateTo(''); }}>
                Clear all filters
              </Button>
            )}
          </div>
        );
      }

      // Format the batch type for display
      const formatType = (type: string) => {
        const map: Record<string, string> = {
          uber_trip: 'Uber Trips',
          uber_payment: 'Uber Payments',
          indrive_trip: 'InDrive Trips',
          roam_trip: 'Roam Trips',
          merged: 'Merged',
          fuel: 'Fuel',
          transactions: 'Transactions',
        };
        return map[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      };

      return (
        <div className="space-y-3">
          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Upload date:</label>
            <Input
              type="date"
              value={batchDateFrom}
              onChange={e => setBatchDateFrom(e.target.value)}
              className="h-8 text-xs w-[140px]"
              placeholder="From"
            />
            <span className="text-xs text-slate-400">to</span>
            <Input
              type="date"
              value={batchDateTo}
              onChange={e => setBatchDateTo(e.target.value)}
              className="h-8 text-xs w-[140px]"
              placeholder="To"
            />
            {(batchDateFrom || batchDateTo) && (
              <button
                onClick={() => { setBatchDateFrom(''); setBatchDateTo(''); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-0.5"
              >
                <X className="h-3 w-3" /> Clear dates
              </button>
            )}
          </div>
          {/* Selection toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''} found
              {selectedBatchIds.size > 0 && (
                <span className="ml-1 font-semibold text-rose-600">
                  · {selectedBatchIds.size} selected
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                className="text-xs h-7"
                onClick={() => {
                  const allFilteredIds = new Set(filteredBatches.map(b => b.id));
                  const allSelected = filteredBatches.every(b => selectedBatchIds.has(b.id));
                  if (allSelected) {
                    // Deselect all filtered
                    setSelectedBatchIds(prev => {
                      const next = new Set(prev);
                      allFilteredIds.forEach(id => next.delete(id));
                      return next;
                    });
                  } else {
                    // Select all filtered
                    setSelectedBatchIds(prev => {
                      const next = new Set(prev);
                      allFilteredIds.forEach(id => next.add(id));
                      return next;
                    });
                  }
                }}
              >
                {filteredBatches.every(b => selectedBatchIds.has(b.id)) && filteredBatches.length > 0
                  ? <><CheckSquare className="h-3.5 w-3.5 mr-1" /> Deselect All</>
                  : <><Square className="h-3.5 w-3.5 mr-1" /> Select All</>
                }
              </Button>
              {selectedBatchIds.size > 0 && (
                <Button
                  variant="destructive" size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setBulkDeleteConfirmText('');
                    setBulkDeleteProgress(null);
                    setShowBulkDeleteModal(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete Selected ({selectedBatchIds.size})
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredBatches.map(batch => {
              const isSelected = selectedBatchIds.has(batch.id);
              return (
              <div
                key={batch.id}
                className={`border rounded-lg p-4 bg-white hover:shadow-sm transition-all cursor-pointer ${
                  isSelected
                    ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-200'
                    : 'border-slate-200 hover:border-rose-300'
                }`}
                onClick={() => {
                  setSelectedBatchIds(prev => {
                    const next = new Set(prev);
                    if (next.has(batch.id)) next.delete(batch.id);
                    else next.add(batch.id);
                    return next;
                  });
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 pt-0.5">
                    {isSelected
                      ? <CheckSquare className="h-5 w-5 text-rose-600" />
                      : <Square className="h-5 w-5 text-slate-300" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-slate-900 truncate max-w-[200px]" title={batch.fileName}>
                        {batch.fileName}
                      </h4>
                      <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                        {formatType(batch.type)}
                      </Badge>
                      {(batch as any).platform && (
                        <Badge
                          className={`text-[10px] font-medium px-1.5 py-0 border-0 ${
                            (batch as any).platform === 'Uber'
                              ? 'bg-black text-white'
                              : (batch as any).platform === 'InDrive'
                              ? 'bg-emerald-600 text-white'
                              : (batch as any).platform === 'Roam'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {(batch as any).platform}
                        </Badge>
                      )}
                      {batch.status === 'error' && (
                        <Badge variant="destructive" className="text-[10px] font-normal px-1.5 py-0">
                          Error
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(batch.uploadDate).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {batch.recordCount.toLocaleString()} record{batch.recordCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono truncate" title={batch.id}>
                      ID: {batch.id}
                    </p>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    className="shrink-0 text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBatchId(batch.id);
                      setActiveModal('deleteBatch');
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Batch
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ═══ DANGER ZONE — fully wired (Phase 7) ═══
    if (deleteGroup === 'dangerZone') {
      const visible = matchesSearch(CATEGORY_SEARCH_TERMS['factoryReset'] || 'factory reset');
      if (!visible) {
        return (
          <div className="text-center py-10 text-slate-400">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No items match &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        );
      }
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DeleteCategoryCard
            key="factoryReset"
            title="Factory Reset"
            description="Permanently wipe ALL imported data — trips, transactions, fuel logs, and everything else. This cannot be undone."
            icon={<AlertTriangle className="h-5 w-5" />}
            recordCount={null}
            badge="Irreversible"
            className="border-rose-300 bg-rose-50/30"
            onDelete={() => setActiveModal('factoryReset')}
          />
        </div>
      );
    }

    return null;
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Delete Center</h3>
          <p className="text-sm text-slate-500">
            Permanently remove fleet data. All deletions are irreversible.
          </p>
        </div>
      </div>

      {/* Database Record Counts — Diagnostic */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Database Record Counts
          </h4>
          <Button variant="ghost" size="sm" onClick={() => { fetchDiagCounts(); }} disabled={diagLoading} className="h-7 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100">
            <RefreshCw className={`h-3 w-3 mr-1 ${diagLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {diagError ? (
          <p className="text-xs text-red-600">Error: {diagError}</p>
        ) : diagCounts ? (
          <>
            {/* Top-level KV prefix totals */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{diagCounts.trips.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">Trip Records</p>
                <p className="text-[10px] text-slate-400 font-mono">trip:*</p>
              </div>
              <div className={`text-center ${hasOrphanedLedgers ? 'ring-2 ring-amber-400 rounded-lg bg-amber-50 p-2 -m-2' : ''}`}>
                <p className={`text-2xl font-bold ${hasOrphanedLedgers ? 'text-amber-700' : 'text-slate-900'}`}>{diagCounts.ledgerEntries.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">Ledger Entries</p>
                <p className="text-[10px] text-slate-400 font-mono">ledger:*</p>
                {hasOrphanedLedgers && (
                  <p className="text-[10px] text-amber-600 font-medium mt-1">Likely orphaned entries</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900">{diagCounts.transactions.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-0.5">Transactions</p>
                <p className="text-[10px] text-slate-400 font-mono">transaction:*</p>
              </div>
            </div>

            {/* Per-group breakdown */}
            <div className="border-t border-blue-200 pt-3">
              <p className="text-[11px] font-semibold text-blue-800 mb-2 uppercase tracking-wider">Per-Section Breakdown</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Trips & Earnings */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><MapPin className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Trips & Earnings</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Trips</span><span className="font-mono font-medium text-slate-900">{counts.trips !== null ? counts.trips.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Drivers & Staff */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Users className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Drivers & Staff</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Drivers</span><span className="font-mono font-medium text-slate-900">{counts.drivers !== null ? counts.drivers.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Driver Metrics</span><span className="font-mono font-medium text-slate-900">{counts.driverMetrics !== null ? counts.driverMetrics.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Fleet & Vehicles */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Car className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Fleet & Vehicles</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Vehicles</span><span className="font-mono font-medium text-slate-900">{counts.vehicles !== null ? counts.vehicles.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Vehicle Metrics</span><span className="font-mono font-medium text-slate-900">{counts.vehicleMetrics !== null ? counts.vehicleMetrics.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Fuel & Stations */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Fuel className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Fuel & Stations</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Fuel Logs</span><span className="font-mono font-medium text-slate-900">{counts.fuel !== null ? counts.fuel.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Fuel Cards</span><span className="font-mono font-medium text-slate-900">{counts.fuelCards !== null ? counts.fuelCards.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Stations</span><span className="font-mono font-medium text-slate-900">{counts.stations !== null ? counts.stations.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Learnt Locations</span><span className="font-mono font-medium text-slate-900">{counts.learntLocations !== null ? counts.learntLocations.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Toll Management */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><CreditCard className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Toll Management</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Toll Tags</span><span className="font-mono font-medium text-slate-900">{counts.tollTags !== null ? counts.tollTags.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Toll Plazas</span><span className="font-mono font-medium text-slate-900">{counts.tollPlazas !== null ? counts.tollPlazas.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Toll Transactions</span><span className="font-mono font-medium text-slate-900">{counts.tollTransactions !== null ? counts.tollTransactions.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Finance & Assets */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><DollarSign className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Finance & Assets</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Transactions</span><span className="font-mono font-medium text-slate-900">{counts.transactions !== null ? counts.transactions.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Claims</span><span className="font-mono font-medium text-slate-900">{counts.claims !== null ? counts.claims.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Equipment</span><span className="font-mono font-medium text-slate-900">{counts.equipment !== null ? counts.equipment.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Inventory</span><span className="font-mono font-medium text-slate-900">{counts.inventory !== null ? counts.inventory.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Maintenance & Ops */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><Wrench className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Maintenance & Ops</span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Service Logs</span><span className="font-mono font-medium text-slate-900">{counts.service !== null ? counts.service.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Odometer</span><span className="font-mono font-medium text-slate-900">{counts.odometer !== null ? counts.odometer.toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span>Check-ins</span><span className="font-mono font-medium text-slate-900">{counts.checkins !== null ? counts.checkins.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Import History */}
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-5 w-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center"><HardDrive className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Import History</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-300 text-blue-600">Cascade</Badge>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Batches</span><span className="font-mono font-medium text-slate-900">{batches.length > 0 ? batches.length.toLocaleString() : '—'}</span></div>
                  </div>
                </div>

                {/* Ledger (orphan check) */}
                <div className={`rounded-md border p-2.5 ${hasOrphanedLedgers ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`h-5 w-5 rounded flex items-center justify-center ${hasOrphanedLedgers ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}><FileText className="h-3 w-3" /></div>
                    <span className="text-xs font-semibold text-slate-800">Ledger (Financial)</span>
                    {hasOrphanedLedgers && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-700">Orphaned</Badge>
                    )}
                  </div>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div className="flex justify-between"><span>Ledger Entries</span><span className="font-mono font-medium text-slate-900">{diagCounts.ledgerEntries.toLocaleString()}</span></div>
                  </div>
                  {hasOrphanedLedgers && (
                    <div className="mt-2 space-y-1.5">
                      {purgeResult ? (
                        <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Purged {purgeResult.deletedCount.toLocaleString()} of {purgeResult.orphansFound.toLocaleString()} orphans
                        </div>
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          className="w-full h-7 text-[10px] font-semibold text-amber-700 border-amber-300 hover:bg-amber-100 hover:border-amber-400"
                          disabled={purging}
                          onClick={handlePurgeOrphans}
                        >
                          {purging ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Purging…</>
                          ) : (
                            <><Trash2 className="h-3 w-3 mr-1" /> Purge Orphaned Ledgers</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <span className="text-xs text-blue-500 ml-2">Loading counts...</span>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { if (searchQuery) setSearchQuery(''); else if (deleteGroup) { setDeleteGroup(null); setSearchQuery(''); } } }}
          placeholder={deleteGroup ? `Filter ${activeDeleteGroupMeta?.title || 'deletions'}...` : 'Search all delete categories...'}
          className="pl-9 pr-8 h-9 text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!deleteGroup ? (
        <>
          {filteredDeleteGroups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDeleteGroups.map(group => (
                <CategoryGroupCard key={group.id} group={group} onClick={(id) => { setDeleteGroup(id); setSearchQuery(''); }} />
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No categories match &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-xs mt-1">Try a different term like &ldquo;fuel&rdquo;, &ldquo;driver&rdquo;, or &ldquo;toll&rdquo;</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setDeleteGroup(null); setSearchQuery(''); setBatchDateFrom(''); setBatchDateTo(''); }} className="text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Delete Center &rsaquo; {activeDeleteGroupMeta?.title}</p>
              <h3 className="text-lg font-medium text-slate-900 leading-tight">{activeDeleteGroupMeta?.title}</h3>
              <p className="text-sm text-slate-500">{activeDeleteGroupMeta?.description}</p>
            </div>
          </div>
          {renderGroupCards()}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Trips & Earnings (Phase 4)                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteAllTrips'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete All Trips" entityLabel="trips" fetchItems={buildTripFetchItems()} deleteItems={tripDeleteItems}
        columns={TRIP_PREVIEW_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100} />

      <DeleteFlowModal isOpen={activeModal === 'deleteUberTrips'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Uber Trips" entityLabel="Uber trips" fetchItems={buildTripFetchItems('Uber')} deleteItems={tripDeleteItems}
        columns={TRIP_PREVIEW_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100}
        configNote="Only trips matching the Uber platform will be shown and deleted." />

      <DeleteFlowModal isOpen={activeModal === 'deleteInDriveTrips'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete InDrive Trips" entityLabel="InDrive trips" fetchItems={buildTripFetchItems('InDrive')} deleteItems={tripDeleteItems}
        columns={TRIP_PREVIEW_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100}
        configNote="Only trips matching the InDrive platform will be shown and deleted." />

      <DeleteFlowModal isOpen={activeModal === 'deleteRoamTrips'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Roam Trips" entityLabel="Roam trips" fetchItems={buildTripFetchItems('Roam')} deleteItems={tripDeleteItems}
        columns={TRIP_PREVIEW_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100}
        configNote="Only trips matching the Roam platform will be shown and deleted." />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Drivers & Staff (Phase 5)                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteDriverProfiles'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Driver Profiles" entityLabel="driver profiles" fetchItems={fetchDriverProfiles} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={DRIVER_PREVIEW_COLUMNS} showDateFilter={false} dangerThreshold={10}
        configNote="This deletes driver profile records only. Associated trips and transactions are NOT affected." />

      <DeleteFlowModal isOpen={activeModal === 'deleteDriverMetrics'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Driver Metrics" entityLabel="driver metric records" fetchItems={fetchDriverMetrics} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={DRIVER_METRICS_COLUMNS} showDateFilter={false} dangerThreshold={20}
        configNote="This deletes cached performance scorecards. They will regenerate automatically from trip data." />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Fleet & Vehicles (Phase 5)                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteVehicleRecords'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Vehicle Records" entityLabel="vehicle records" fetchItems={fetchVehicleRecords} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={VEHICLE_PREVIEW_COLUMNS} showDateFilter={false} dangerThreshold={5}
        configNote="Deleting vehicle records may affect fuel, maintenance, and trip associations." />

      <DeleteFlowModal isOpen={activeModal === 'deleteVehicleMetrics'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Vehicle Metrics" entityLabel="vehicle metric records" fetchItems={fetchVehicleMetrics} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={VEHICLE_METRICS_COLUMNS} showDateFilter={false} dangerThreshold={20}
        configNote="Cached metrics will regenerate from trip data." />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Fuel & Stations (Phase 5)                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteFuelLogs'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Fuel Logs" entityLabel="fuel log entries" fetchItems={fetchFuelLogs} deleteItems={fuelLogDeleteItems}
        columns={FUEL_LOG_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100} />

      <DeleteFlowModal isOpen={activeModal === 'deleteFuelCards'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Fuel Cards" entityLabel="fuel cards" fetchItems={fetchFuelCards} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={FUEL_CARD_COLUMNS} showDateFilter={false} dangerThreshold={10} />

      <DeleteFlowModal isOpen={activeModal === 'deleteStations'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Gas Stations" entityLabel="gas stations" fetchItems={fetchStations} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={STATION_COLUMNS} showDateFilter={false} dangerThreshold={20}
        configNote="Deleting verified stations may cause future fuel log entries to fail GPS matching." />

      <DeleteFlowModal isOpen={activeModal === 'deleteLearntLocations'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Learnt Locations" entityLabel="learnt locations" fetchItems={fetchLearntLocations} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={LEARNT_LOCATION_COLUMNS} showDateFilter={false} dangerThreshold={20} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Toll Management (Phase 6)                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteTollTags'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Toll Tags" entityLabel="toll tags" fetchItems={fetchTollTags} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={TOLL_TAG_COLUMNS} showDateFilter={false} dangerThreshold={10} />

      <DeleteFlowModal isOpen={activeModal === 'deleteTollPlazas'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Toll Plazas" entityLabel="toll plazas" fetchItems={fetchTollPlazas} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={TOLL_PLAZA_COLUMNS} showDateFilter={false} dangerThreshold={20}
        configNote="Deleting toll plazas removes the GPS coordinate database used for automatic toll detection." />

      <DeleteFlowModal isOpen={activeModal === 'deleteTollTransactions'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Toll Transactions" entityLabel="toll transactions" fetchItems={fetchTollTransactions} deleteItems={financialTxnDeleteItems}
        columns={TOLL_TXN_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100}
        configNote="Only transactions with toll-related categories (Toll Usage, Tolls, Top-Up) will be shown." />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Finance & Assets (Phase 6)                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteFinancialTransactions'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Financial Transactions" entityLabel="financial transactions" fetchItems={fetchFinancialTransactions} deleteItems={financialTxnDeleteItems}
        columns={FINANCIAL_TXN_COLUMNS} showDateFilter showDriverFilter dangerThreshold={100}
        configNote="This includes ALL transaction types — payouts, toll charges, fuel reimbursements, and adjustments." />

      <DeleteFlowModal isOpen={activeModal === 'deleteClaims'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Claims & Disputes" entityLabel="claims" fetchItems={fetchClaims} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={CLAIM_COLUMNS} showDateFilter dangerThreshold={20} />

      <DeleteFlowModal isOpen={activeModal === 'deleteEquipment'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Equipment" entityLabel="equipment items" fetchItems={fetchEquipment} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={EQUIPMENT_COLUMNS} showDateFilter={false} dangerThreshold={10} />

      <DeleteFlowModal isOpen={activeModal === 'deleteInventory'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Inventory" entityLabel="inventory items" fetchItems={fetchInventory} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={INVENTORY_COLUMNS} showDateFilter={false} dangerThreshold={10} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODALS — Maintenance & Ops (Phase 6)                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'deleteServiceLogs'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Service Logs" entityLabel="service log entries" fetchItems={fetchServiceLogs} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={SERVICE_LOG_COLUMNS} showDateFilter dangerThreshold={50} />

      <DeleteFlowModal isOpen={activeModal === 'deleteOdometerReadings'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Odometer Readings" entityLabel="odometer readings" fetchItems={fetchOdometerReadings} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={ODOMETER_COLUMNS} showDateFilter dangerThreshold={50}
        configNote="Odometer readings are used for mileage tracking, fuel efficiency, and maintenance scheduling." />

      <DeleteFlowModal isOpen={activeModal === 'deleteCheckins'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Delete Weekly Check-ins" entityLabel="check-in submissions" fetchItems={fetchCheckins} deleteItems={(keys) => genericBulkDelete(keys)}
        columns={CHECKIN_COLUMNS} showDateFilter dangerThreshold={50} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE FLOW MODAL — Danger Zone: Factory Reset (Phase 7)          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <DeleteFlowModal isOpen={activeModal === 'factoryReset'} onClose={() => setActiveModal(null)} onSuccess={handleDeleteSuccess}
        title="Factory Reset — Erase All Data" entityLabel="records (all data)" fetchItems={fetchAllForFactoryReset} deleteItems={factoryResetDeleteItems}
        columns={[]} showDateFilter={false} dangerThreshold={0}
        skipPreview confirmWord="FACTORY RESET"
        configNote={FACTORY_RESET_CHECKLIST} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BATCH DELETE MODAL — Import History (Phase 5)                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <BatchDeleteModal
        isOpen={activeModal === 'deleteBatch'}
        batchId={selectedBatchId}
        onClose={() => { setActiveModal(null); setSelectedBatchId(null); }}
        onSuccess={() => {
          // Refresh the batch list
          api.getBatches()
            .then(data => setBatches([...data].sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())))
            .catch(() => {});
          // Refresh record counts
          handleDeleteSuccess(0);
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BULK BATCH DELETE MODAL                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <Dialog open={showBulkDeleteModal} onOpenChange={(open) => {
        if (!bulkDeleting) {
          setShowBulkDeleteModal(open);
          if (!open) setBulkDeleteProgress(null);
        }
      }}>
        <DialogContent className="max-w-2xl w-[90vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="h-5 w-5" />
              Bulk Delete — {selectedBatchIds.size} Batch{selectedBatchIds.size !== 1 ? 'es' : ''}
            </DialogTitle>
            <DialogDescription>
              This will cascade-delete all trips, transactions, ledger entries, and metrics for each selected batch.
            </DialogDescription>
          </DialogHeader>

          {/* Not yet started — show summary + confirm */}
          {!bulkDeleteProgress && !bulkDeleting && (
            <div className="space-y-4">
              {/* List selected batches */}
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {batches.filter(b => selectedBatchIds.has(b.id)).map(b => (
                  <div key={b.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="flex-1 font-medium text-slate-700 break-all">{b.fileName}</span>
                    {(b as any).platform && (
                      <Badge className={`text-[9px] font-medium px-1.5 py-0 border-0 shrink-0 ${
                        (b as any).platform === 'Uber' ? 'bg-black text-white'
                          : (b as any).platform === 'InDrive' ? 'bg-emerald-600 text-white'
                          : (b as any).platform === 'Roam' ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {(b as any).platform}
                      </Badge>
                    )}
                    <span className="text-slate-400 shrink-0 whitespace-nowrap">{b.recordCount.toLocaleString()} records</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">This action is irreversible.</p>
                    <p className="mt-1">
                      Total records across all batches: <strong>
                        {batches.filter(b => selectedBatchIds.has(b.id)).reduce((sum, b) => sum + b.recordCount, 0).toLocaleString()}
                      </strong>
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Type <strong>DELETE</strong> to confirm:
                </label>
                <Input
                  value={bulkDeleteConfirmText}
                  onChange={e => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="h-8 text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowBulkDeleteModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive" size="sm"
                  disabled={bulkDeleteConfirmText !== 'DELETE'}
                  onClick={handleBulkBatchDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete {selectedBatchIds.size} Batch{selectedBatchIds.size !== 1 ? 'es' : ''}
                </Button>
              </div>
            </div>
          )}

          {/* In progress */}
          {bulkDeleting && bulkDeleteProgress && (
            <div className="space-y-4 py-2">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-rose-500 animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  Deleting batch {bulkDeleteProgress.current + 1} of {bulkDeleteProgress.total}…
                </p>
                <p className="text-xs text-slate-500 mt-1 truncate max-w-[300px] mx-auto">
                  {bulkDeleteProgress.currentBatchName}
                </p>
              </div>
              <Progress value={Math.round((bulkDeleteProgress.current / bulkDeleteProgress.total) * 100)} className="h-2" />
              <p className="text-xs text-center text-slate-400">
                {bulkDeleteProgress.current} / {bulkDeleteProgress.total} complete
                {bulkDeleteProgress.results.filter(r => !r.success).length > 0 && (
                  <span className="text-amber-600 ml-2">
                    ({bulkDeleteProgress.results.filter(r => !r.success).length} failed)
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Completed */}
          {!bulkDeleting && bulkDeleteProgress && bulkDeleteProgress.current === bulkDeleteProgress.total && (
            <div className="space-y-4 py-2">
              <div className="text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">Bulk delete complete</p>
              </div>

              {/* Results summary */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <p className="text-lg font-bold text-emerald-700">
                    {bulkDeleteProgress.results.filter(r => r.success).length}
                  </p>
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Deleted</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-lg font-bold text-slate-700">
                    {bulkDeleteProgress.results.reduce((s, r) => s + (r.trips || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">Trips Removed</p>
                </div>
              </div>

              {/* Failed batches */}
              {bulkDeleteProgress.results.filter(r => !r.success).length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">
                    {bulkDeleteProgress.results.filter(r => !r.success).length} batch{bulkDeleteProgress.results.filter(r => !r.success).length !== 1 ? 'es' : ''} failed:
                  </p>
                  {bulkDeleteProgress.results.filter(r => !r.success).map(r => (
                    <p key={r.batchId} className="text-[10px] text-red-600 truncate">
                      • {r.fileName}: {r.error}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => {
                  setShowBulkDeleteModal(false);
                  setBulkDeleteProgress(null);
                }}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
