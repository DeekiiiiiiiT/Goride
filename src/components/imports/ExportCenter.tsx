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
  HardDrive, Download, Loader2, Search, ArrowLeft, X as XIcon,
} from 'lucide-react';
import { Input } from '../ui/input';
import { CategoryGroupCard, CategoryGroup } from './CategoryGroupCard';

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
// Search keywords per category (used for filtering + empty state)
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  trips: "trip data earnings rides distances durations fare breakdowns revenue mileage",
  tripsUber: "uber trips earnings rides platform uber csv api sync",
  tripsInDrive: "indrive trips earnings rides platform indrive",
  tripsRoam: "roam trips earnings rides platform roam goride",
  drivers: "driver roster profiles contact license hire dates employees staff",
  driverMetrics: "driver metrics performance scorecards trips earnings ratings acceptance tier rankings",
  vehicles: "vehicle fleet cars plates vin registration insurance assignments",
  vehicleMetrics: "vehicle metrics performance earnings trips online hours efficiency",
  transactions: "financial transactions money fare payouts fuel charges tolls adjustments payments billing",
  fuel: "fuel logs gas diesel purchase volumes costs locations card stations",
  service: "service maintenance logs oil change tire rotation repairs mechanic",
  odometer: "odometer history readings mileage fuel service check-in manual",
  checkins: "weekly check-ins checkins submissions odometer vehicle condition inspection",
  tollTags: "toll tags inventory numbers providers statuses vehicle assignments ezpass",
  tollPlazas: "toll plazas highways gps coordinates rates locations database",
  stations: "gas stations fuel brands coordinates plus codes locations database verified",
  claims: "claims disputes losses resolution history claimable deductions",
  equipment: "equipment phones mounts cameras accessories assignments devices",
  inventory: "inventory stock levels reorder points supplier information parts supplies",
  backup: "full system backup zip archive download all complete",
};

// ═══════════════════════════════════════════════════════════════════════════
// Export group membership: which card keys belong to which group
// ═══════════════════════════════════════════════════════════════════════════

const EXPORT_GROUP_CARDS: Record<string, string[]> = {
  'trips': ['trips', 'tripsUber', 'tripsInDrive', 'tripsRoam'],
  'drivers': ['drivers', 'driverMetrics'],
  'vehicles': ['vehicles', 'vehicleMetrics'],
  'fuel': ['fuel', 'stations'],
  'toll': ['tollTags', 'tollPlazas'],
  'finance': ['transactions', 'claims', 'equipment', 'inventory'],
  'maintenance': ['service', 'odometer', 'checkins'],
  'system': ['backup'],
};

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Generic CSV export handler
// ═══════════════════════════════════════════════════════════════════════════

async function handleGenericExport<T>(
  label: string,
  fetchFn: () => Promise<T[]>,
  columns: any[],
  filenameBase: string,
  dateRange?: DateRange,
  format: ExportFormat = 'csv',
): Promise<number> {
  const startTime = Date.now();
  const toastId = toast.loading(`Fetching ${label}...`);
  try {
    const data = await fetchFn();
    if (data.length === 0) {
      toast.dismiss(toastId);
      toast.info(`No ${label} found${dateRange?.start ? ' for the selected date range' : ''}.`);
      logAuditEntry({ operation: 'export', category: label, recordCount: 0, status: 'success', format, durationMs: Date.now() - startTime });
      return 0;
    }

    const today = new Date().toISOString().split('T')[0];
    const ext = format === 'json' ? 'json' : 'csv';
    let filename: string;
    if (dateRange?.start && dateRange?.end) {
      filename = `roam_${filenameBase}_${dateRange.start}_to_${dateRange.end}.${ext}`;
    } else if (dateRange?.start) {
      filename = `roam_${filenameBase}_from_${dateRange.start}.${ext}`;
    } else if (dateRange?.end) {
      filename = `roam_${filenameBase}_to_${dateRange.end}.${ext}`;
    } else {
      filename = `roam_${filenameBase}_${today}.${ext}`;
    }

    if (format === 'json') {
      const blob = JSON.stringify(data, null, 2);
      downloadBlob(blob, filename);
    } else {
      const csv = jsonToCsv(data, columns);
      downloadBlob(csv, filename);
    }

    toast.dismiss(toastId);
    toast.success(`Exported ${data.length.toLocaleString()} ${label} as ${ext.toUpperCase()}.`);
    logAuditEntry({ operation: 'export', category: label, recordCount: data.length, status: 'success', fileName: filename, format, durationMs: Date.now() - startTime });
    return data.length;
  } catch (err: any) {
    toast.dismiss(toastId);
    toast.error(`${label} export failed: ${err.message || 'Unknown error'}`);
    console.error(`${label} export error:`, err);
    logAuditEntry({ operation: 'export', category: label, recordCount: 0, status: 'failed', format, errors: [err.message || 'Unknown error'], durationMs: Date.now() - startTime });
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

  // Phase 3: Group drill-in
  const [exportGroup, setExportGroup] = useState<string | null>(null);

  const matchesSearch = useCallback((keywords: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return keywords.toLowerCase().includes(q);
  }, [searchQuery]);

  // Compute whether any category is visible (for empty state) — scoped to active group when drilled in
  const hasVisibleCards = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (exportGroup) {
      const memberKeys = EXPORT_GROUP_CARDS[exportGroup] || [];
      return memberKeys.some(key => CATEGORY_SEARCH_TERMS[key]?.toLowerCase().includes(q));
    }
    return Object.values(CATEGORY_SEARCH_TERMS).some(kw => kw.toLowerCase().includes(q));
  }, [searchQuery, exportGroup]);

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

  const exportTrips = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('trips',
      () => fetchAllTrips(tripDates.start || undefined, tripDates.end || undefined),
      TRIP_CSV_COLUMNS, 'trips',
      (tripDates.start || tripDates.end) ? tripDates : undefined,
      fmt,
    ), [tripDates]);

  // Platform-specific trip export handlers
  const exportTripsUber = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('Uber trips',
      () => fetchAllTrips(tripDates.start || undefined, tripDates.end || undefined, 'Uber'),
      TRIP_CSV_COLUMNS, 'trips_uber',
      (tripDates.start || tripDates.end) ? tripDates : undefined,
      fmt,
    ), [tripDates]);

  const exportTripsInDrive = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('InDrive trips',
      () => fetchAllTrips(tripDates.start || undefined, tripDates.end || undefined, 'InDrive'),
      TRIP_CSV_COLUMNS, 'trips_indrive',
      (tripDates.start || tripDates.end) ? tripDates : undefined,
      fmt,
    ), [tripDates]);

  const exportTripsRoam = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('Roam trips',
      () => fetchAllTrips(tripDates.start || undefined, tripDates.end || undefined, 'Roam'),
      TRIP_CSV_COLUMNS, 'trips_roam',
      (tripDates.start || tripDates.end) ? tripDates : undefined,
      fmt,
    ), [tripDates]);

  const exportDrivers = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('driver profiles', fetchAllDrivers, DRIVER_CSV_COLUMNS, 'drivers', undefined, fmt), []);

  const exportDriverMetrics = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('driver metrics', fetchAllDriverMetrics, DRIVER_METRICS_CSV_COLUMNS, 'driver_metrics', undefined, fmt), []);

  const exportVehicles = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('vehicle profiles', fetchAllVehicles, VEHICLE_CSV_COLUMNS, 'vehicles', undefined, fmt), []);

  const exportVehicleMetrics = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('vehicle metrics', fetchAllVehicleMetrics, VEHICLE_METRICS_CSV_COLUMNS, 'vehicle_metrics', undefined, fmt), []);

  const exportTransactions = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('transactions',
      () => fetchAllTransactions(txnDates.start || undefined, txnDates.end || undefined),
      TRANSACTION_CSV_COLUMNS, 'transactions',
      (txnDates.start || txnDates.end) ? txnDates : undefined,
      fmt,
    ), [txnDates]);

  const exportFuel = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('fuel logs', exportFetchAllFuelLogs, FUEL_CSV_COLUMNS, 'fuel', undefined, fmt), []);

  const exportService = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('service logs', exportFetchAllServiceLogs, SERVICE_CSV_COLUMNS, 'service', undefined, fmt), []);

  const exportOdometer = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('odometer readings', exportFetchAllOdometerReadings, ODOMETER_CSV_COLUMNS, 'odometer', undefined, fmt), []);

  const exportCheckins = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('check-ins', exportFetchAllCheckIns, CHECKIN_CSV_COLUMNS, 'checkins', undefined, fmt), []);

  const exportTollTags = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('toll tags', fetchAllTollTags, TOLL_TAG_CSV_COLUMNS, 'toll_tags', undefined, fmt), []);

  const exportTollPlazas = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('toll plazas', fetchAllTollPlazas, TOLL_PLAZA_CSV_COLUMNS, 'toll_plazas', undefined, fmt), []);

  const exportStations = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('gas stations', fetchAllStations, STATION_CSV_COLUMNS, 'stations', undefined, fmt), []);

  const exportClaims = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('claims',
      () => fetchAllClaims(claimDates.start || undefined, claimDates.end || undefined),
      CLAIM_CSV_COLUMNS, 'claims',
      (claimDates.start || claimDates.end) ? claimDates : undefined,
      fmt,
    ), [claimDates]);

  const exportEquipment = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('equipment', fetchAllEquipment, EQUIPMENT_CSV_COLUMNS, 'equipment', undefined, fmt), []);

  const exportInventory = useCallback((fmt?: ExportFormat) =>
    handleGenericExport('inventory', fetchAllInventory, INVENTORY_CSV_COLUMNS, 'inventory', undefined, fmt), []);

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

  const exportGroups: CategoryGroup[] = [
    { id: 'trips', title: 'Trips & Earnings', description: 'Export trip records with earnings, distances, and fare breakdowns', icon: <MapPin className="h-5 w-5" />, iconColor: 'bg-violet-50 text-violet-600', itemCount: 4 },
    { id: 'drivers', title: 'Drivers & Staff', description: 'Export driver profiles and performance scorecards', icon: <Users className="h-5 w-5" />, iconColor: 'bg-teal-50 text-teal-600', itemCount: 2 },
    { id: 'vehicles', title: 'Fleet & Vehicles', description: 'Export vehicle profiles and performance metrics', icon: <Car className="h-5 w-5" />, iconColor: 'bg-sky-50 text-sky-600', itemCount: 2 },
    { id: 'fuel', title: 'Fuel & Stations', description: 'Export fuel logs and gas station databases', icon: <Fuel className="h-5 w-5" />, iconColor: 'bg-amber-50 text-amber-600', itemCount: 2 },
    { id: 'toll', title: 'Toll Management', description: 'Export toll tag inventory and plaza databases', icon: <CreditCard className="h-5 w-5" />, iconColor: 'bg-emerald-50 text-emerald-600', itemCount: 2 },
    { id: 'finance', title: 'Finance & Assets', description: 'Export transactions, claims, equipment, and inventory', icon: <DollarSign className="h-5 w-5" />, iconColor: 'bg-amber-50 text-amber-700', itemCount: 4 },
    { id: 'maintenance', title: 'Maintenance & Ops', description: 'Export service logs, odometer history, and weekly check-ins', icon: <Wrench className="h-5 w-5" />, iconColor: 'bg-orange-50 text-orange-600', itemCount: 3 },
    { id: 'system', title: 'System & Backup', description: 'Full system backup as a compressed ZIP archive', icon: <HardDrive className="h-5 w-5" />, iconColor: 'bg-slate-100 text-slate-600', itemCount: 1 },
  ];

  const activeExportGroupMeta = exportGroup ? exportGroups.find(g => g.id === exportGroup) : null;
  const isInActiveGroup = (cardKey: string) => exportGroup ? (EXPORT_GROUP_CARDS[exportGroup]?.includes(cardKey) ?? false) : false;

  // Group-level search: show group if its title/description or any member card's search terms match
  const groupMatchesExportSearch = (groupId: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const grp = exportGroups.find(g => g.id === groupId);
    if (grp && (grp.title.toLowerCase().includes(q) || grp.description.toLowerCase().includes(q))) return true;
    const memberKeys = EXPORT_GROUP_CARDS[groupId] || [];
    return memberKeys.some(key => CATEGORY_SEARCH_TERMS[key]?.toLowerCase().includes(q));
  };
  const filteredExportGroups = exportGroups.filter(g => groupMatchesExportSearch(g.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Export Center</h3>
          <p className="text-sm text-slate-500">
            Download your fleet data as CSV files. Click any category to begin.
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

      {/* Search bar — visible at both levels */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { if (searchQuery) setSearchQuery(''); else if (exportGroup) { setExportGroup(null); setSearchQuery(''); } } }}
          placeholder={exportGroup ? `Filter ${activeExportGroupMeta?.title || 'exports'}...` : 'Search all export categories...'}
          className="pl-9 pr-8 h-9 text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Clear search">
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!exportGroup ? (
        <>
          {/* GROUP OVERVIEW */}
          {filteredExportGroups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredExportGroups.map(group => (
                <CategoryGroupCard key={group.id} group={group} onClick={(id) => { setExportGroup(id); setSearchQuery(''); }} />
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
          {/* DRILLED-IN VIEW */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setExportGroup(null); setSearchQuery(''); }} className="text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Export Center &rsaquo; {activeExportGroupMeta?.title}</p>
              <h3 className="text-lg font-medium text-slate-900 leading-tight">{activeExportGroupMeta?.title}</h3>
              <p className="text-sm text-slate-500">{activeExportGroupMeta?.description}</p>
            </div>
          </div>

          {/* Category Grid — filtered to active group */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* ═══ 1. TRIP DATA ═══ */}
            {isInActiveGroup('trips') && matchesSearch(CATEGORY_SEARCH_TERMS.trips) && (
            <ExportCategoryCard
              title="Trip Data & Earnings"
              description="All trip records with earnings, distances, durations, and fare breakdowns."
              icon={<MapPin className="h-5 w-5" />}
              recordCount={counts.trips}
              badge="Critical"
              onExport={exportTrips}
              showFormatToggle
            >
              <DateRangeExportFilter
                startDate={tripDates.start} endDate={tripDates.end}
                onStartDateChange={v => setTripDates(p => ({ ...p, start: v }))}
                onEndDateChange={v => setTripDates(p => ({ ...p, end: v }))}
                onClear={() => setTripDates({ start: '', end: '' })}
              />
            </ExportCategoryCard>
            )}

            {/* ═══ 1b. UBER TRIPS ONLY ═══ */}
            {isInActiveGroup('tripsUber') && matchesSearch(CATEGORY_SEARCH_TERMS.tripsUber) && (
            <ExportCategoryCard
              title="Uber Trips Only"
              description="Export only Uber platform trips with earnings, distances, and fare breakdowns."
              icon={<span className="font-bold text-sm">UB</span>}
              recordCount={null}
              badge="Uber"
              onExport={exportTripsUber}
              showFormatToggle
            >
              <DateRangeExportFilter
                startDate={tripDates.start} endDate={tripDates.end}
                onStartDateChange={v => setTripDates(p => ({ ...p, start: v }))}
                onEndDateChange={v => setTripDates(p => ({ ...p, end: v }))}
                onClear={() => setTripDates({ start: '', end: '' })}
              />
            </ExportCategoryCard>
            )}

            {/* ═══ 1c. INDRIVE TRIPS ONLY ═══ */}
            {isInActiveGroup('tripsInDrive') && matchesSearch(CATEGORY_SEARCH_TERMS.tripsInDrive) && (
            <ExportCategoryCard
              title="InDrive Trips Only"
              description="Export only InDrive platform trips with earnings and trip details."
              icon={<span className="font-bold text-sm">IN</span>}
              recordCount={null}
              badge="InDrive"
              onExport={exportTripsInDrive}
              showFormatToggle
            >
              <DateRangeExportFilter
                startDate={tripDates.start} endDate={tripDates.end}
                onStartDateChange={v => setTripDates(p => ({ ...p, start: v }))}
                onEndDateChange={v => setTripDates(p => ({ ...p, end: v }))}
                onClear={() => setTripDates({ start: '', end: '' })}
              />
            </ExportCategoryCard>
            )}

            {/* ═══ 1d. ROAM TRIPS ONLY ═══ */}
            {isInActiveGroup('tripsRoam') && matchesSearch(CATEGORY_SEARCH_TERMS.tripsRoam) && (
            <ExportCategoryCard
              title="Roam Trips Only"
              description="Export only Roam (formerly GoRide) platform trips with earnings and trip details."
              icon={<span className="font-bold text-sm">RM</span>}
              recordCount={null}
              badge="Roam"
              onExport={exportTripsRoam}
              showFormatToggle
            >
              <DateRangeExportFilter
                startDate={tripDates.start} endDate={tripDates.end}
                onStartDateChange={v => setTripDates(p => ({ ...p, start: v }))}
                onEndDateChange={v => setTripDates(p => ({ ...p, end: v }))}
                onClear={() => setTripDates({ start: '', end: '' })}
              />
            </ExportCategoryCard>
            )}

            {/* ═══ 2. DRIVER ROSTER ═══ */}
            {isInActiveGroup('drivers') && matchesSearch(CATEGORY_SEARCH_TERMS.drivers) && (
            <ExportCategoryCard
              title="Driver Roster"
              description="Driver profiles with contact details, license info, and hire dates."
              icon={<Users className="h-5 w-5" />}
              recordCount={counts.drivers}
              onExport={exportDrivers}
              showFormatToggle
            />
            )}

            {/* ═══ 3. DRIVER METRICS ═══ */}
            {isInActiveGroup('driverMetrics') && matchesSearch(CATEGORY_SEARCH_TERMS.driverMetrics) && (
            <ExportCategoryCard
              title="Driver Metrics"
              description="Performance scorecards: trips, earnings, ratings, acceptance, and tier rankings."
              icon={<Users className="h-5 w-5" />}
              recordCount={counts.driverMetrics}
              badge="Scorecards"
              onExport={exportDriverMetrics}
            />
            )}

            {/* ═══ 4. VEHICLE FLEET ═══ */}
            {isInActiveGroup('vehicles') && matchesSearch(CATEGORY_SEARCH_TERMS.vehicles) && (
            <ExportCategoryCard
              title="Vehicle Fleet"
              description="Vehicle profiles with plate numbers, VIN, registration, insurance, and assignments."
              icon={<Car className="h-5 w-5" />}
              recordCount={counts.vehicles}
              onExport={exportVehicles}
              showFormatToggle
            />
            )}

            {/* ═══ 5. VEHICLE METRICS ═══ */}
            {isInActiveGroup('vehicleMetrics') && matchesSearch(CATEGORY_SEARCH_TERMS.vehicleMetrics) && (
            <ExportCategoryCard
              title="Vehicle Metrics"
              description="Vehicle performance: earnings, trips, online hours, and efficiency metrics."
              icon={<Car className="h-5 w-5" />}
              recordCount={counts.vehicleMetrics}
              badge="Performance"
              onExport={exportVehicleMetrics}
            />
            )}

            {/* ═══ 6. FINANCIAL TRANSACTIONS ═══ */}
            {isInActiveGroup('transactions') && matchesSearch(CATEGORY_SEARCH_TERMS.transactions) && (
            <ExportCategoryCard
              title="Financial Transactions"
              description="All financial transactions: fare payouts, fuel charges, tolls, and adjustments."
              icon={<DollarSign className="h-5 w-5" />}
              recordCount={counts.transactions}
              onExport={exportTransactions}
              showFormatToggle
            >
              <DateRangeExportFilter
                startDate={txnDates.start} endDate={txnDates.end}
                onStartDateChange={v => setTxnDates(p => ({ ...p, start: v }))}
                onEndDateChange={v => setTxnDates(p => ({ ...p, end: v }))}
                onClear={() => setTxnDates({ start: '', end: '' })}
              />
            </ExportCategoryCard>
            )}

            {/* ═══ 7. FUEL LOGS ═══ */}
            {isInActiveGroup('fuel') && matchesSearch(CATEGORY_SEARCH_TERMS.fuel) && (
            <ExportCategoryCard
              title="Fuel Logs"
              description="Fuel purchase records with volumes, costs, locations, and card assignments."
              icon={<Fuel className="h-5 w-5" />}
              recordCount={counts.fuel}
              onExport={exportFuel}
            />
            )}

            {/* ═══ 8. SERVICE LOGS ═══ */}
            {isInActiveGroup('service') && matchesSearch(CATEGORY_SEARCH_TERMS.service) && (
            <ExportCategoryCard
              title="Service / Maintenance Logs"
              description="Vehicle service history including oil changes, tire rotations, and repairs."
              icon={<Wrench className="h-5 w-5" />}
              recordCount={counts.service}
              onExport={exportService}
            />
            )}

            {/* ═══ 9. ODOMETER HISTORY ═══ */}
            {isInActiveGroup('odometer') && matchesSearch(CATEGORY_SEARCH_TERMS.odometer) && (
            <ExportCategoryCard
              title="Odometer History"
              description="All odometer readings from fuel logs, service, check-ins, and manual entries."
              icon={<Gauge className="h-5 w-5" />}
              recordCount={counts.odometer}
              onExport={exportOdometer}
            />
            )}

            {/* ═══ 10. WEEKLY CHECK-INS ═══ */}
            {isInActiveGroup('checkins') && matchesSearch(CATEGORY_SEARCH_TERMS.checkins) && (
            <ExportCategoryCard
              title="Weekly Check-ins"
              description="Driver weekly check-in submissions with odometer and vehicle condition data."
              icon={<ClipboardCheck className="h-5 w-5" />}
              recordCount={counts.checkins}
              onExport={exportCheckins}
            />
            )}

            {/* ═══ 11. TOLL TAGS ═══ */}
            {isInActiveGroup('tollTags') && matchesSearch(CATEGORY_SEARCH_TERMS.tollTags) && (
            <ExportCategoryCard
              title="Toll Tags"
              description="Toll tag inventory with tag numbers, providers, statuses, and vehicle assignments."
              icon={<CreditCard className="h-5 w-5" />}
              recordCount={counts.tollTags}
              onExport={exportTollTags}
            />
            )}

            {/* ═══ 12. TOLL PLAZAS ═══ */}
            {isInActiveGroup('tollPlazas') && matchesSearch(CATEGORY_SEARCH_TERMS.tollPlazas) && (
            <ExportCategoryCard
              title="Toll Plazas"
              description="Verified toll plaza database with highways, GPS coordinates, and rates."
              icon={<CreditCard className="h-5 w-5" />}
              recordCount={counts.tollPlazas}
              badge="Database"
              onExport={exportTollPlazas}
              showFormatToggle
            />
            )}

            {/* ═══ 13. GAS STATIONS ═══ */}
            {isInActiveGroup('stations') && matchesSearch(CATEGORY_SEARCH_TERMS.stations) && (
            <ExportCategoryCard
              title="Gas Stations"
              description="Verified gas station database with brands, coordinates, and Plus Codes."
              icon={<Building2 className="h-5 w-5" />}
              recordCount={counts.stations}
              badge="Database"
              onExport={exportStations}
              showFormatToggle
            />
            )}

            {/* ═══ 14. CLAIMS & DISPUTES ═══ */}
            {isInActiveGroup('claims') && matchesSearch(CATEGORY_SEARCH_TERMS.claims) && (
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
            )}

            {/* ═══ 15. EQUIPMENT ═══ */}
            {isInActiveGroup('equipment') && matchesSearch(CATEGORY_SEARCH_TERMS.equipment) && (
            <ExportCategoryCard
              title="Equipment"
              description="Fleet equipment assignments: phones, mounts, cameras, and accessories."
              icon={<Package className="h-5 w-5" />}
              recordCount={counts.equipment}
              onExport={exportEquipment}
            />
            )}

            {/* ═══ 16. INVENTORY ═══ */}
            {isInActiveGroup('inventory') && matchesSearch(CATEGORY_SEARCH_TERMS.inventory) && (
            <ExportCategoryCard
              title="Inventory"
              description="Stock inventory levels with reorder points and supplier information."
              icon={<Package className="h-5 w-5" />}
              recordCount={counts.inventory}
              onExport={exportInventory}
            />
            )}

            {/* ═══ 17. FULL SYSTEM BACKUP (Phase 7) ═══ */}
            {isInActiveGroup('backup') && matchesSearch(CATEGORY_SEARCH_TERMS.backup) && (
            <ExportCategoryCard
              title="Full System Backup (ZIP)"
              description="Download all 16 categories as a single compressed ZIP archive with manifest."
              icon={<HardDrive className="h-5 w-5" />}
              recordCount={null}
              badge="ZIP"
              onExport={async () => { setShowBackupRestore(true); }}
            />
            )}
          </div>

          {/* No results state */}
          {!hasVisibleCards && (
            <div className="text-center py-10 text-slate-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No categories match "{searchQuery}"</p>
              <p className="text-xs mt-1">Try a different term like "fuel", "driver", or "toll"</p>
            </div>
          )}
        </>
      )}

      {/* Phase 7: Full System Backup & Restore */}
      {showBackupRestore && (
        <SystemBackupRestore onBack={() => setShowBackupRestore(false)} />
      )}

      {/* Phase 8: Activity Log */}
      <ImportExportHistory refreshKey={auditKey} />
    </div>
  );
}