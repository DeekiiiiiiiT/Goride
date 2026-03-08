import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ExportCategoryCard, ExportFormat } from './ExportCategoryCard';
import { DateRangeExportFilter } from './DateRangeExportFilter';
import { SystemBackupRestore } from './SystemBackupRestore';
import { ImportExportHistory } from './ImportExportHistory';
import { logAuditEntry } from '../../services/audit-log';
import {
  fetchAllTrips, fetchAllDrivers, fetchAllDriverMetrics,
  fetchAllVehicles, fetchAllVehicleMetrics, fetchAllTransactions,
  fetchAllTollTags, fetchAllTollPlazas, fetchAllStations,
  fetchAllClaims, fetchAllEquipment, fetchAllInventory,
  exportFetchAllFuelLogs, exportFetchAllServiceLogs,
  exportFetchAllOdometerReadings, exportFetchAllCheckIns,
} from '../../services/data-export';
import { jsonToCsv, downloadBlob } from '../../utils/csv-helper';
import {
  TRIP_CSV_COLUMNS, DRIVER_CSV_COLUMNS, DRIVER_METRICS_CSV_COLUMNS,
  VEHICLE_CSV_COLUMNS, VEHICLE_METRICS_CSV_COLUMNS, TRANSACTION_CSV_COLUMNS,
  TOLL_TAG_CSV_COLUMNS, TOLL_PLAZA_CSV_COLUMNS, STATION_CSV_COLUMNS,
  CLAIM_CSV_COLUMNS, EQUIPMENT_CSV_COLUMNS, INVENTORY_CSV_COLUMNS,
  FUEL_CSV_COLUMNS, SERVICE_CSV_COLUMNS, ODOMETER_CSV_COLUMNS, CHECKIN_CSV_COLUMNS,
} from '../../types/csv-schemas';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
import {
  MapPin, Car, Users, DollarSign, Fuel, Wrench, Gauge,
  ClipboardCheck, CreditCard, Building2, Scale, Package,
  HardDrive, Download, Loader2, Search,
} from 'lucide-react';
import { Input } from '../ui/input';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface DateRange {
  start: string;
  end: string;
}

interface RecordCounts {
  trips: number | null;
  drivers: number | null;
  driverMetrics: number | null;
  vehicles: number | null;
  vehicleMetrics: number | null;
  transactions: number | null;
  fuel: number | null;
  service: number | null;
  odometer: number | null;
  checkins: number | null;
  tollTags: number | null;
  tollPlazas: number | null;
  stations: number | null;
  claims: number | null;
  equipment: number | null;
  inventory: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Generic CSV export handler
// ═══════════════════════════════════════════════════════════════════════════

async function handleGenericExport<T>(
  label: string,
  fetchFn: () => Promise<T[]>,
  columns: any[],
  filenameBase: string,
  dateRange?: DateRange,
): Promise<number> {
  const startTime = Date.now();
  const toastId = toast.loading(`Fetching ${label}...`);
  try {
    const data = await fetchFn();
    if (data.length === 0) {
      toast.dismiss(toastId);
      toast.info(`No ${label} found${dateRange?.start ? ' for the selected date range' : ''}.`);
      logAuditEntry({ operation: 'export', category: label, recordCount: 0, status: 'success', format: 'csv', durationMs: Date.now() - startTime });
      return 0;
    }
    const csv = jsonToCsv(data, columns);
    const today = new Date().toISOString().split('T')[0];
    let filename: string;
    if (dateRange?.start && dateRange?.end) {
      filename = `roam_${filenameBase}_${dateRange.start}_to_${dateRange.end}.csv`;
    } else if (dateRange?.start) {
      filename = `roam_${filenameBase}_from_${dateRange.start}.csv`;
    } else if (dateRange?.end) {
      filename = `roam_${filenameBase}_to_${dateRange.end}.csv`;
    } else {
      filename = `roam_${filenameBase}_${today}.csv`;
    }
    downloadBlob(csv, filename);
    toast.dismiss(toastId);
    toast.success(`Exported ${data.length.toLocaleString()} ${label}.`);
    logAuditEntry({ operation: 'export', category: label, recordCount: data.length, status: 'success', fileName: filename, format: 'csv', durationMs: Date.now() - startTime });
    return data.length;
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(`${label} export failed: ${err.message || 'Unknown error'}`);
    console.error(`${label} export error:`, err);
    logAuditEntry({ operation: 'export', category: label, recordCount: 0, status: 'failed', format: 'csv', errors: [err.message || 'Unknown error'], durationMs: Date.now() - startTime });
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function ExportCenter() {
  // Date ranges for date-filterable categories
  const [tripDates, setTripDates] = useState<DateRange>({ start: '', end: '' });
  const [txnDates, setTxnDates] = useState<DateRange>({ start: '', end: '' });
  const [claimDates, setClaimDates] = useState<DateRange>({ start: '', end: '' });

  // Record counts
  const [counts, setCounts] = useState<RecordCounts>({
    trips: null, drivers: null, driverMetrics: null,
    vehicles: null, vehicleMetrics: null, transactions: null,
    fuel: null, service: null, odometer: null, checkins: null,
    tollTags: null, tollPlazas: null, stations: null,
    claims: null, equipment: null, inventory: null,
  });

  // Export All state
  const [isExportingAll, setIsExportingAll] = useState(false);

  // Phase 7: Full system backup/restore
  const [showBackupRestore, setShowBackupRestore] = useState(false);

  // Phase 8: Search filter and audit log
  const [searchQuery, setSearchQuery] = useState('');
  const [auditKey, setAuditKey] = useState(0);

  const matchesSearch = useCallback((keywords: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return keywords.toLowerCase().includes(q);
  }, [searchQuery]);

  // ─── Load record counts on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const safeCount = async (key: keyof RecordCounts, fn: () => Promise<any>) => {
      try {
        const result = await fn();
        if (!cancelled) {
          const count = Array.isArray(result) ? result.length : (result?.total ?? result?.totalTrips ?? null);
          setCounts(prev => ({ ...prev, [key]: count }));
        }
      } catch {
        // Non-critical — leave as null
      }
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

    return () => { cancelled = true; };
  }, []);

  // ─── Individual export handlers ────────────────────────────────────────

  const exportTrips = useCallback(() =>
    handleGenericExport('trips',
      () => fetchAllTrips(tripDates.start || undefined, tripDates.end || undefined),
      TRIP_CSV_COLUMNS, 'trips',
      (tripDates.start || tripDates.end) ? tripDates : undefined
    ), [tripDates]);

  const exportDrivers = useCallback(() =>
    handleGenericExport('driver profiles', fetchAllDrivers, DRIVER_CSV_COLUMNS, 'drivers'), []);

  const exportDriverMetrics = useCallback(() =>
    handleGenericExport('driver metrics', fetchAllDriverMetrics, DRIVER_METRICS_CSV_COLUMNS, 'driver_metrics'), []);

  const exportVehicles = useCallback(() =>
    handleGenericExport('vehicle profiles', fetchAllVehicles, VEHICLE_CSV_COLUMNS, 'vehicles'), []);

  const exportVehicleMetrics = useCallback(() =>
    handleGenericExport('vehicle metrics', fetchAllVehicleMetrics, VEHICLE_METRICS_CSV_COLUMNS, 'vehicle_metrics'), []);

  const exportTransactions = useCallback(() =>
    handleGenericExport('transactions',
      () => fetchAllTransactions(txnDates.start || undefined, txnDates.end || undefined),
      TRANSACTION_CSV_COLUMNS, 'transactions',
      (txnDates.start || txnDates.end) ? txnDates : undefined
    ), [txnDates]);

  const exportFuel = useCallback(() =>
    handleGenericExport('fuel logs', exportFetchAllFuelLogs, FUEL_CSV_COLUMNS, 'fuel'), []);

  const exportService = useCallback(() =>
    handleGenericExport('service logs', exportFetchAllServiceLogs, SERVICE_CSV_COLUMNS, 'service'), []);

  const exportOdometer = useCallback(() =>
    handleGenericExport('odometer readings', exportFetchAllOdometerReadings, ODOMETER_CSV_COLUMNS, 'odometer'), []);

  const exportCheckins = useCallback(() =>
    handleGenericExport('check-ins', exportFetchAllCheckIns, CHECKIN_CSV_COLUMNS, 'checkins'), []);

  const exportTollTags = useCallback(() =>
    handleGenericExport('toll tags', fetchAllTollTags, TOLL_TAG_CSV_COLUMNS, 'toll_tags'), []);

  const exportTollPlazas = useCallback(() =>
    handleGenericExport('toll plazas', fetchAllTollPlazas, TOLL_PLAZA_CSV_COLUMNS, 'toll_plazas'), []);

  const exportStations = useCallback(() =>
    handleGenericExport('gas stations', fetchAllStations, STATION_CSV_COLUMNS, 'stations'), []);

  const exportClaims = useCallback(() =>
    handleGenericExport('claims',
      () => fetchAllClaims(claimDates.start || undefined, claimDates.end || undefined),
      CLAIM_CSV_COLUMNS, 'claims',
      (claimDates.start || claimDates.end) ? claimDates : undefined
    ), [claimDates]);

  const exportEquipment = useCallback(() =>
    handleGenericExport('equipment', fetchAllEquipment, EQUIPMENT_CSV_COLUMNS, 'equipment'), []);

  const exportInventory = useCallback(() =>
    handleGenericExport('inventory', fetchAllInventory, INVENTORY_CSV_COLUMNS, 'inventory'), []);

  // ─── Export All ────────────────────────────────────────────────────────

  const handleExportAll = useCallback(async () => {
    if (isExportingAll) return;
    setIsExportingAll(true);

    const categories = [
      { label: 'trips', fn: () => handleGenericExport('trips', () => fetchAllTrips(), TRIP_CSV_COLUMNS, 'trips') },
      { label: 'drivers', fn: () => handleGenericExport('driver profiles', fetchAllDrivers, DRIVER_CSV_COLUMNS, 'drivers') },
      { label: 'driver metrics', fn: () => handleGenericExport('driver metrics', fetchAllDriverMetrics, DRIVER_METRICS_CSV_COLUMNS, 'driver_metrics') },
      { label: 'vehicles', fn: () => handleGenericExport('vehicle profiles', fetchAllVehicles, VEHICLE_CSV_COLUMNS, 'vehicles') },
      { label: 'vehicle metrics', fn: () => handleGenericExport('vehicle metrics', fetchAllVehicleMetrics, VEHICLE_METRICS_CSV_COLUMNS, 'vehicle_metrics') },
      { label: 'transactions', fn: () => handleGenericExport('transactions', fetchAllTransactions, TRANSACTION_CSV_COLUMNS, 'transactions') },
      { label: 'fuel', fn: () => handleGenericExport('fuel logs', exportFetchAllFuelLogs, FUEL_CSV_COLUMNS, 'fuel') },
      { label: 'service', fn: () => handleGenericExport('service logs', exportFetchAllServiceLogs, SERVICE_CSV_COLUMNS, 'service') },
      { label: 'odometer', fn: () => handleGenericExport('odometer readings', exportFetchAllOdometerReadings, ODOMETER_CSV_COLUMNS, 'odometer') },
      { label: 'check-ins', fn: () => handleGenericExport('check-ins', exportFetchAllCheckIns, CHECKIN_CSV_COLUMNS, 'checkins') },
      { label: 'toll tags', fn: () => handleGenericExport('toll tags', fetchAllTollTags, TOLL_TAG_CSV_COLUMNS, 'toll_tags') },
      { label: 'toll plazas', fn: () => handleGenericExport('toll plazas', fetchAllTollPlazas, TOLL_PLAZA_CSV_COLUMNS, 'toll_plazas') },
      { label: 'stations', fn: () => handleGenericExport('gas stations', fetchAllStations, STATION_CSV_COLUMNS, 'stations') },
      { label: 'claims', fn: () => handleGenericExport('claims', fetchAllClaims, CLAIM_CSV_COLUMNS, 'claims') },
      { label: 'equipment', fn: () => handleGenericExport('equipment', fetchAllEquipment, EQUIPMENT_CSV_COLUMNS, 'equipment') },
      { label: 'inventory', fn: () => handleGenericExport('inventory', fetchAllInventory, INVENTORY_CSV_COLUMNS, 'inventory') },
    ];

    let totalRecords = 0;
    let successCount = 0;

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      toast.loading(`Exporting ${i + 1}/${categories.length}: ${cat.label}...`, { id: 'export-all-progress' });
      try {
        const count = await cat.fn();
        if (count > 0) successCount++;
        totalRecords += count;
      } catch {
        // Individual errors already toasted inside handleGenericExport
      }
    }

    toast.dismiss('export-all-progress');
    toast.success(
      `Export All complete: ${successCount} files, ${totalRecords.toLocaleString()} total records.`,
      { duration: 6000 }
    );
    setIsExportingAll(false);
  }, [isExportingAll]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Export Center</h3>
          <p className="text-sm text-slate-500">
            Download your fleet data as CSV files. Click any card to begin.
          </p>
        </div>
        <Button
          onClick={handleExportAll}
          disabled={isExportingAll}
          className="bg-indigo-600 hover:bg-indigo-700 text-sm"
        >
          {isExportingAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {isExportingAll ? 'Exporting All...' : 'Export All (16 files)'}
        </Button>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter categories... (e.g. fuel, toll, driver)"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ═══ 1. TRIP DATA ═══ */}
        <ExportCategoryCard
          title="Trip Data & Earnings"
          description="All trip records with earnings, distances, durations, and fare breakdowns."
          icon={<MapPin className="h-5 w-5" />}
          recordCount={counts.trips}
          badge="Critical"
          onExport={exportTrips}
        >
          <DateRangeExportFilter
            startDate={tripDates.start} endDate={tripDates.end}
            onStartDateChange={v => setTripDates(p => ({ ...p, start: v }))}
            onEndDateChange={v => setTripDates(p => ({ ...p, end: v }))}
            onClear={() => setTripDates({ start: '', end: '' })}
          />
        </ExportCategoryCard>

        {/* ═══ 2. DRIVER ROSTER ═══ */}
        <ExportCategoryCard
          title="Driver Roster"
          description="Driver profiles with contact details, license info, and hire dates."
          icon={<Users className="h-5 w-5" />}
          recordCount={counts.drivers}
          onExport={exportDrivers}
        />

        {/* ═══ 3. DRIVER METRICS ═══ */}
        <ExportCategoryCard
          title="Driver Metrics"
          description="Performance scorecards: trips, earnings, ratings, acceptance, and tier rankings."
          icon={<Users className="h-5 w-5" />}
          recordCount={counts.driverMetrics}
          badge="Scorecards"
          onExport={exportDriverMetrics}
        />

        {/* ═══ 4. VEHICLE FLEET ═══ */}
        <ExportCategoryCard
          title="Vehicle Fleet"
          description="Vehicle profiles with plate numbers, VIN, registration, insurance, and assignments."
          icon={<Car className="h-5 w-5" />}
          recordCount={counts.vehicles}
          onExport={exportVehicles}
        />

        {/* ═══ 5. VEHICLE METRICS ═══ */}
        <ExportCategoryCard
          title="Vehicle Metrics"
          description="Vehicle performance: earnings, trips, online hours, and efficiency metrics."
          icon={<Car className="h-5 w-5" />}
          recordCount={counts.vehicleMetrics}
          badge="Performance"
          onExport={exportVehicleMetrics}
        />

        {/* ═══ 6. FINANCIAL TRANSACTIONS ═══ */}
        <ExportCategoryCard
          title="Financial Transactions"
          description="All financial transactions: fare payouts, fuel charges, tolls, and adjustments."
          icon={<DollarSign className="h-5 w-5" />}
          recordCount={counts.transactions}
          onExport={exportTransactions}
        >
          <DateRangeExportFilter
            startDate={txnDates.start} endDate={txnDates.end}
            onStartDateChange={v => setTxnDates(p => ({ ...p, start: v }))}
            onEndDateChange={v => setTxnDates(p => ({ ...p, end: v }))}
            onClear={() => setTxnDates({ start: '', end: '' })}
          />
        </ExportCategoryCard>

        {/* ═══ 7. FUEL LOGS ═══ */}
        <ExportCategoryCard
          title="Fuel Logs"
          description="Fuel purchase records with volumes, costs, locations, and card assignments."
          icon={<Fuel className="h-5 w-5" />}
          recordCount={counts.fuel}
          badge="Also in DR"
          onExport={exportFuel}
        />

        {/* ═══ 8. SERVICE LOGS ═══ */}
        <ExportCategoryCard
          title="Service / Maintenance Logs"
          description="Vehicle service history including oil changes, tire rotations, and repairs."
          icon={<Wrench className="h-5 w-5" />}
          recordCount={counts.service}
          badge="Also in DR"
          onExport={exportService}
        />

        {/* ═══ 9. ODOMETER HISTORY ═══ */}
        <ExportCategoryCard
          title="Odometer History"
          description="All odometer readings from fuel logs, service, check-ins, and manual entries."
          icon={<Gauge className="h-5 w-5" />}
          recordCount={counts.odometer}
          badge="Also in DR"
          onExport={exportOdometer}
        />

        {/* ═══ 10. WEEKLY CHECK-INS ═══ */}
        <ExportCategoryCard
          title="Weekly Check-ins"
          description="Driver weekly check-in submissions with odometer and vehicle condition data."
          icon={<ClipboardCheck className="h-5 w-5" />}
          recordCount={counts.checkins}
          badge="Also in DR"
          onExport={exportCheckins}
        />

        {/* ═══ 11. TOLL TAGS ═══ */}
        <ExportCategoryCard
          title="Toll Tags"
          description="Toll tag inventory with tag numbers, providers, statuses, and vehicle assignments."
          icon={<CreditCard className="h-5 w-5" />}
          recordCount={counts.tollTags}
          onExport={exportTollTags}
        />

        {/* ═══ 12. TOLL PLAZAS ═══ */}
        <ExportCategoryCard
          title="Toll Plazas"
          description="Verified toll plaza database with highways, GPS coordinates, and rates."
          icon={<CreditCard className="h-5 w-5" />}
          recordCount={counts.tollPlazas}
          badge="Database"
          onExport={exportTollPlazas}
        />

        {/* ═══ 13. GAS STATIONS ═══ */}
        <ExportCategoryCard
          title="Gas Stations"
          description="Verified gas station database with brands, coordinates, and Plus Codes."
          icon={<Building2 className="h-5 w-5" />}
          recordCount={counts.stations}
          badge="Database"
          onExport={exportStations}
        />

        {/* ═══ 14. CLAIMS & DISPUTES ═══ */}
        <ExportCategoryCard
          title="Claims & Disputes"
          description="Claimable losses, driver disputes, and resolution history."
          icon={<Scale className="h-5 w-5" />}
          recordCount={counts.claims}
          onExport={exportClaims}
        >
          <DateRangeExportFilter
            startDate={claimDates.start} endDate={claimDates.end}
            onStartDateChange={v => setClaimDates(p => ({ ...p, start: v }))}
            onEndDateChange={v => setClaimDates(p => ({ ...p, end: v }))}
            onClear={() => setClaimDates({ start: '', end: '' })}
          />
        </ExportCategoryCard>

        {/* ═══ 15. EQUIPMENT ═══ */}
        <ExportCategoryCard
          title="Equipment"
          description="Fleet equipment assignments: phones, mounts, cameras, and accessories."
          icon={<Package className="h-5 w-5" />}
          recordCount={counts.equipment}
          onExport={exportEquipment}
        />

        {/* ═══ 16. INVENTORY ═══ */}
        <ExportCategoryCard
          title="Inventory"
          description="Stock inventory levels with reorder points and supplier information."
          icon={<Package className="h-5 w-5" />}
          recordCount={counts.inventory}
          onExport={exportInventory}
        />

        {/* ═══ 17. FULL SYSTEM BACKUP (Phase 7) ═══ */}
        <ExportCategoryCard
          title="Full System Backup (ZIP)"
          description="Download all 16 categories as a single compressed ZIP archive with manifest."
          icon={<HardDrive className="h-5 w-5" />}
          recordCount={null}
          badge="ZIP"
          onExport={async () => { setShowBackupRestore(true); }}
        />
      </div>

      {/* Phase 7: Full System Backup & Restore */}
      {showBackupRestore && (
        <SystemBackupRestore onBack={() => setShowBackupRestore(false)} />
      )}

      {/* Phase 8: Activity Log */}
      <ImportExportHistory refreshKey={auditKey} />
    </div>
  );
}