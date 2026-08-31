import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle as DialogTitle2,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Vehicle, VehicleDocument } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { api } from '../../services/api';
import { odometerService } from '../../services/odometerService';
import { dateWeekKey } from '../../utils/fleetMondayWeekKey';
import { format, subDays, isSameDay, getHours, differenceInDays, addDays, startOfDay, endOfDay, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";
import { useAuth } from '../auth/AuthContext';
import { getFleetVehicleCatalog } from '../../services/pendingVehicleCatalogService';
import { useMyPendingCatalogRequests } from '../../hooks/useMyPendingCatalogRequests';
import type { VehicleCatalogRecord } from '../../types/vehicleCatalog';
import {
  isVehicleParked,
  isVehicleCatalogMatched,
  deriveCatalogStatus,
} from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { type CatalogVariantPickerSource } from './CatalogVariantPicker';
import { useCatalogCandidates } from '../../hooks/useCatalogCandidates';
import { useVehicleCatalogAnchorFacets } from '../../hooks/useVehicleCatalogAnchorFacets';
import { FixedExpensesManager } from './expenses/FixedExpensesManager';
import { MaintenanceLog } from './MaintenanceManager';
import type {
  CatalogMaintenanceTaskOption,
  VehicleMaintenanceScheduleRowApi,
} from '../../types/maintenance';
import { catalogOptionsFromScheduleRows } from '../../utils/maintenanceCatalogOptions';
import { VehicleDetailCatalogGate } from './detail/VehicleDetailCatalogGate';
import { VehicleDetailHeader } from './detail/VehicleDetailHeader';
import { VehicleDetailPerformanceTab } from './detail/VehicleDetailPerformanceTab';
import { VehicleDetailOdometerTab } from './detail/VehicleDetailOdometerTab';
import { VehicleDetailKmTrackingTab } from './detail/VehicleDetailKmTrackingTab';
import { VehicleDetailProfileTab } from './detail/VehicleDetailProfileTab';

interface VehicleDetailProps {
  vehicle: Vehicle;
  trips: Trip[];
  onBack: () => void;
  onAssignDriver?: () => void;
  onUpdate?: (vehicle: Vehicle) => void;
  /** Expense Hub deep link — opens BF Expenses register filtered to this vehicle. */
  onNavigateToExpenseHub?: (vehicleId: string) => void;
}

export function VehicleDetail({ vehicle, trips, onBack, onAssignDriver, onUpdate, onNavigateToExpenseHub }: VehicleDetailProps) {

  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  // Centralised hook handles window-focus refetch + conditional polling.
  const { data: myPendingCatalog } = useMyPendingCatalogRequests();

  const {
    data: linkedCatalog,
    isSuccess: linkedCatalogSuccess,
    isError: linkedCatalogIsError,
  } = useQuery({
    queryKey: ['fleet-vehicle-catalog', vehicle.vehicle_catalog_id, token],
    queryFn: () => getFleetVehicleCatalog(token!, vehicle.vehicle_catalog_id!),
    enabled: Boolean(token && vehicle.vehicle_catalog_id),
    retry: false,
  });

  const showCatalogVerifiedBadge =
    isVehicleCatalogMatched(vehicle) && linkedCatalogSuccess && Boolean(linkedCatalog);
  const showCatalogLinkBrokenBadge =
    isVehicleCatalogMatched(vehicle) &&
    Boolean(vehicle.vehicle_catalog_id?.trim()) &&
    linkedCatalogIsError;

  /** Profile → General Info: fleet identity + catalog fuel/specs when linked. */
  const generalInfoFields = useMemo(() => {
    const dash = '—';
    const make =
      linkedCatalog?.make?.trim() || vehicle.make?.trim() || dash;
    const model =
      linkedCatalog?.model?.trim() || vehicle.model?.trim() || dash;
    const year = vehicle.year?.toString().trim() || dash;
    const fuelType =
      linkedCatalog?.fuel_type?.trim() ||
      vehicle.vehicle_catalog_fuel_type_hint?.trim() ||
      dash;
    const fuelGrade =
      linkedCatalog?.fuel_grade?.trim() ||
      vehicle.vehicle_catalog_fuel_grade_hint?.trim() ||
      dash;

    let fuelTank = dash;
    const catCap = linkedCatalog?.fuel_tank_capacity;
    if (
      linkedCatalog &&
      catCap != null &&
      Number.isFinite(Number(catCap))
    ) {
      const u = linkedCatalog.fuel_tank_unit?.trim() || 'L';
      fuelTank = `${catCap} ${u}`;
    } else {
      const tc =
        vehicle.specifications?.tankCapacity ?? vehicle.fuelSettings?.tankCapacity;
      if (tc != null && tc !== '' && Number(tc) !== 0) {
        fuelTank = `${tc} L`;
      }
    }

    const vin = vehicle.vin?.trim() || dash;

    return {
      make,
      model,
      year,
      fuelType,
      fuelGrade,
      fuelTank,
      vin,
    };
  }, [linkedCatalog, vehicle]);

  const fleetKey = vehicle.id || vehicle.licensePlate;
  const catalogPendingRow = useMemo(() => {
    return (myPendingCatalog?.items ?? []).find((r) => r.fleet_vehicle_id === fleetKey) ?? null;
  }, [myPendingCatalog, fleetKey]);

  const showCatalogAlignmentBanner =
    Boolean(catalogPendingRow) &&
    (catalogPendingRow?.status === 'pending' || catalogPendingRow?.status === 'needs_info');

  /** True when operational writes (driver assignment, fuel, trips) are blocked. */
  const parked = isVehicleParked(vehicle);
  const effectiveCatalogStatus = deriveCatalogStatus(vehicle);

  // Polling + window-focus refetch is now handled centrally by
  // useMyPendingCatalogRequests; the hook re-fetches every 12s while any
  // pending row exists, and on every tab focus. We still want to refresh the
  // local 'vehicles' cache when the pending row count drops to zero so the
  // page can re-render the unparked state without a manual reload.
  useEffect(() => {
    if (!parked) return;
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  }, [parked, myPendingCatalog, queryClient]);

  // Success toast: detect the parked -> matched transition for THIS vehicle so
  // the operator gets a clear "approved" signal without watching the banner.
  // Uses a ref so the first render (when we don't know the previous state
  // yet) never fires the toast and we don't depend on toast in deps.
  const previousParkedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = previousParkedRef.current;
    if (prev === true && parked === false) {
      toast.success('Motor type approved', {
        description: 'This vehicle is ready to operate.',
      });
    }
    previousParkedRef.current = parked;
  }, [parked]);

  // Drawer state for the read-only pending-requests queue. Triggered from
  // both the parked banner and the "review in progress" banner.
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);

  const [alignModalOpen, setAlignModalOpen] = useState(false);
  /** Local form state for picker disambiguator inputs (seeded from vehicle hints on open). */
  const [alignSearchMake, setAlignSearchMake] = useState('');
  const [alignSearchModel, setAlignSearchModel] = useState('');
  const [alignSearchYear, setAlignSearchYear] = useState('');
  const [alignSearchChassis, setAlignSearchChassis] = useState('');
  const [alignSearchDrivetrain, setAlignSearchDrivetrain] = useState('');
  const [alignSearchTransmission, setAlignSearchTransmission] = useState('');
  /** The catalog row the picker has decided on (auto-match or explicit pick). */
  const [alignSelectedRow, setAlignSelectedRow] = useState<VehicleCatalogRecord | null>(null);
  const [alignPickerSource, setAlignPickerSource] = useState<CatalogVariantPickerSource | null>(null);
  const [alignSaving, setAlignSaving] = useState(false);

  // MMY-only fetch: distinct chassis codes for the mandatory chassis dropdown.
  const { facets: alignMmyFacets, loading: alignMmyLoading } = useCatalogCandidates({
    make: alignSearchMake,
    model: alignSearchModel,
    year: alignSearchYear,
    skipChassisFilter: true,
  });
  // After chassis is chosen: drivetrain / transmission facets + picker narrowing.
  const { facets: alignFacets, loading: alignFacetsLoading } = useCatalogCandidates({
    make: alignSearchMake,
    model: alignSearchModel,
    year: alignSearchYear,
    chassis: alignSearchChassis,
  });

  const {
    makes: alignMakeOptions,
    models: alignModelOptions,
    years: alignYearOptions,
    loadingMakes: alignMakesLoading,
    loadingModels: alignModelsLoading,
    loadingYears: alignYearsLoading,
  } = useVehicleCatalogAnchorFacets(alignSearchMake, alignSearchModel);

  const onAlignMakeChange = useCallback((v: string) => {
    const next = v.trim();
    const prev = alignSearchMake.trim();
    if (prev.length > 0 && next.length > 0 && next.toLowerCase() === prev.toLowerCase()) {
      setAlignSearchMake(v);
      return;
    }
    setAlignSearchMake(v);
    setAlignSearchModel('');
    setAlignSearchYear('');
    setAlignSearchChassis('');
    setAlignSearchDrivetrain('');
    setAlignSearchTransmission('');
  }, [alignSearchMake]);

  const onAlignModelChange = useCallback((v: string) => {
    const next = v.trim();
    const prev = alignSearchModel.trim();
    if (prev.length > 0 && next.length > 0 && next.toLowerCase() === prev.toLowerCase()) {
      setAlignSearchModel(v);
      return;
    }
    setAlignSearchModel(v);
    setAlignSearchYear('');
    setAlignSearchChassis('');
    setAlignSearchDrivetrain('');
    setAlignSearchTransmission('');
  }, [alignSearchModel]);

  const onAlignYearChange = useCallback((v: string) => {
    const next = v.trim();
    const prev = alignSearchYear.trim();
    if (prev.length > 0 && next.length > 0 && next.toLowerCase() === prev.toLowerCase()) {
      setAlignSearchYear(v);
      return;
    }
    setAlignSearchYear(v);
    setAlignSearchChassis('');
    setAlignSearchDrivetrain('');
    setAlignSearchTransmission('');
  }, [alignSearchYear]);

  useEffect(() => {
    if (!alignModalOpen) return;
    setAlignSearchMake(vehicle.make || '');
    setAlignSearchModel(vehicle.model || '');
    setAlignSearchYear(vehicle.year || '');
    setAlignSearchChassis(
      vehicle.vehicle_catalog_chassis_hint?.trim() || vehicle.vehicle_catalog_generation_hint?.trim() || '',
    );
    setAlignSearchDrivetrain(vehicle.vehicle_catalog_drivetrain_hint?.trim() || '');
    setAlignSearchTransmission(vehicle.vehicle_catalog_transmission_hint?.trim() || '');
    setAlignSelectedRow(null);
    setAlignPickerSource(null);
  }, [
    alignModalOpen,
    vehicle.make,
    vehicle.model,
    vehicle.year,
    vehicle.vehicle_catalog_chassis_hint,
    vehicle.vehicle_catalog_generation_hint,
    vehicle.vehicle_catalog_drivetrain_hint,
    vehicle.vehicle_catalog_transmission_hint,
  ]);

  const handleAlignPickerChange = useCallback(
    (row: VehicleCatalogRecord | null, source: CatalogVariantPickerSource) => {
      setAlignSelectedRow(row);
      setAlignPickerSource(source);
    },
    [],
  );

  useEffect(() => {
    if (!alignModalOpen) return;
    setAlignSelectedRow(null);
    setAlignPickerSource(null);
  }, [alignSearchMake, alignSearchModel, alignSearchYear, alignSearchChassis, alignModalOpen]);

  const handleAlignSave = async () => {
    if (!fleetKey) return;
    if (!alignSelectedRow) return;
    setAlignSaving(true);
    try {
      const row = alignSelectedRow;
      const updatedVehicle = {
        ...vehicle,
        make: alignSearchMake.trim() || vehicle.make,
        model: alignSearchModel.trim() || vehicle.model,
        year: /^\d{4}$/.test(alignSearchYear.trim()) ? alignSearchYear.trim() : vehicle.year,
        vehicle_catalog_id: row.id,
        vehicle_catalog_trim_hint: row.trim_series ?? undefined,
        vehicle_catalog_generation_hint: row.generation?.trim() || undefined,
        vehicle_catalog_chassis_hint: row.chassis_code ?? undefined,
        vehicle_catalog_drivetrain_hint: row.drivetrain ?? undefined,
        vehicle_catalog_fuel_type_hint: row.fuel_type ?? undefined,
        vehicle_catalog_transmission_hint: row.transmission ?? undefined,
        vehicle_catalog_engine_code_hint: row.engine_code ?? undefined,
        vehicle_catalog_engine_type_hint: row.engine_type ?? undefined,
        vehicle_catalog_full_model_code_hint: row.full_model_code ?? undefined,
        vehicle_catalog_catalog_trim_hint: row.catalog_trim ?? undefined,
        vehicle_catalog_emissions_prefix_hint: row.emissions_prefix ?? undefined,
        vehicle_catalog_trim_suffix_hint: row.trim_suffix_code ?? undefined,
        vehicle_catalog_fuel_category_hint: row.fuel_category ?? undefined,
        vehicle_catalog_fuel_grade_hint: row.fuel_grade ?? undefined,
      };
      await api.saveVehicle(updatedVehicle);
      await queryClient.invalidateQueries({ queryKey: ['vehicle-catalog-pending-my'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicle-catalog'] });
      onUpdate?.(updatedVehicle);
      setAlignModalOpen(false);
      toast.success('Vehicle aligned with motor catalog');
    } catch (err) {
      const handled = showCatalogGateToastIfApplicable(err);
      if (!handled) toast.error('Could not save catalog alignment');
    } finally {
      setAlignSaving(false);
    }
  };

  const [isUpdateOdometerOpen, setIsUpdateOdometerOpen] = useState(false);
  const [odometerRefreshTrigger, setOdometerRefreshTrigger] = useState(0);
  
  // Odometer Update Form
  const [newOdometerValue, setNewOdometerValue] = useState('');
  const [newOdometerDate, setNewOdometerDate] = useState(new Date().toISOString().split('T')[0]);
  const [newOdometerTime, setNewOdometerTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  const [newOdometerNotes, setNewOdometerNotes] = useState('');
  const [odometerEntryKind, setOdometerEntryKind] = useState<'manual' | 'checkin'>('manual');
  const [isUpdatingOdometer, setIsUpdatingOdometer] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{url: string, name: string, type: string} | null>(null);
  
  // State for document management
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [extraDocuments, setExtraDocuments] = useState<VehicleDocument[]>([]);
  const [deletedDocIds, setDeletedDocIds] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Service Log State
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [maintenanceScheduleRows, setMaintenanceScheduleRows] = useState<
    VehicleMaintenanceScheduleRowApi[]
  >([]);

  const catalogMaintenanceOptions = useMemo((): CatalogMaintenanceTaskOption[] => {
    return catalogOptionsFromScheduleRows(maintenanceScheduleRows);
  }, [maintenanceScheduleRows]);

  const [maintenanceStatus, setMaintenanceStatus] = useState({
    status: "Healthy",
    nextTypeLabel: "Service",
    daysToService: 0,
    nextOdo: 0,
    remainingKm: 0,
  });
  const [odometerHistory, setOdometerHistory] = useState<any[]>([]);
  const [ledgerCurrentKm, setLedgerCurrentKm] = useState<number | null>(null);
  /** Start true when a vehicle is shown so maintenance bootstrap waits for unified odometer fetch. */
  const [isOdometerLoading, setIsOdometerLoading] = useState(() => Boolean(vehicle.id || vehicle.licensePlate));

  const fetchOdometerHistory = useCallback(async () => {
    if (!vehicle.id && !vehicle.licensePlate) return;
    const vId = vehicle.id || vehicle.licensePlate;
    setIsOdometerLoading(true);
    try {
      const [ledger, current] = await Promise.all([
        odometerService.getLedger(vId, { limit: 5000 }),
        odometerService.getCurrent(vId).catch(() => null),
      ]);
      setOdometerHistory(ledger.data || []);
      setLedgerCurrentKm(current && current.km > 0 ? current.km : null);
    } catch (error) {
      console.error("Failed to load odometer history", error);
    } finally {
      setIsOdometerLoading(false);
    }
  }, [vehicle.id, vehicle.licensePlate]);

  useEffect(() => {
    fetchOdometerHistory();
  }, [fetchOdometerHistory, odometerRefreshTrigger]);

  const latestReading = ledgerCurrentKm ?? odometerHistory[0]?.value ?? vehicle.metrics?.odometer ?? 0;
  const digits = latestReading.toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: false }).split('').slice(-6);
  const lastVerifiedDate = odometerHistory.find(r => r.type === 'Hard')?.date || '';

  const handleExportMasterLog = async () => {
    try {
        const vId = vehicle.id || vehicle.licensePlate;
        const data = await odometerService.getUnifiedHistory(vId);
        if (!data || data.length === 0) {
            toast.error("No data to export");
            return;
        }
        const { formatMasterLogExport } = await import('../../utils/odometerUtils');
        const { downloadCSV } = await import('../../utils/export');
        const exportRows = formatMasterLogExport(data as any[]);
        const filename = `master_odometer_log_${vId}_${new Date().toISOString().split('T')[0]}`;
        await downloadCSV(exportRows, filename, { checksum: true });
        toast.success(`Exported ${exportRows.length} records successfully.`);
    } catch (error) {
        toast.error("Failed to export master log");
    }
  };

  const handleExportCheckins = async () => {
    try {
        const vId = vehicle.id || vehicle.licensePlate;
        const data = await odometerService.getUnifiedHistory(vId);
        if (!data || data.length === 0) {
            toast.error("No data to export");
            return;
        }
        const { formatCheckInExport } = await import('../../utils/odometerUtils');
        const { downloadCSV } = await import('../../utils/export');
        const checkinsOnly = data.filter(d => d.source === 'checkin');
        const exportRows = formatCheckInExport(checkinsOnly as any[]);
        const filename = `checkin_export_${vId}_${new Date().toISOString().split('T')[0]}`;
        await downloadCSV(exportRows, filename, { checksum: true });
        toast.success(`Exported ${exportRows.length} check-in records.`);
    } catch (error) {
        toast.error("Failed to export check-ins");
    }
  };

  const getDriveTypeDescription = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('4wd') || t.includes('awd') || t.includes('4x4')) 
          return "Provides better traction in off-road or slippery conditions, often with higher fuel consumption.";
      if (t.includes('fwd')) 
          return "Common in passenger cars; efficient and compact, placing weight over driven wheels for good traction.";
      if (t.includes('rwd')) 
          return "Often used in performance or utility vehicles for better weight balance and handling.";
      if (t.includes('2wd')) 
          return "Power is sent to two wheels, generally offering better fuel efficiency than 4WD systems.";
      return "The drivetrain configuration determines which wheels receive power, affecting traction and efficiency.";
  };

  const getTransmissionDescription = (type: string) => {
      const t = type.toLowerCase();
      if (t.includes('cvt')) 
          return "Continuously Variable Transmission provides smooth power delivery and optimal engine efficiency.";
      if (t.includes('manual')) 
          return "Allows the driver to manually select gears, offering greater control over power delivery.";
      if (t.includes('automatic')) 
          return "Automatically changes gears as the vehicle moves, freeing the driver from shifting manually.";
      return "The transmission system transfers power from the engine to the wheels.";
  };

  // Date Range State
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
      from: subDays(new Date(), 29),
      to: new Date(),
  });
  // Period preset driving the header date range; switches to 'custom' on manual calendar edits
  type DetailPeriodPreset = 'today' | 'this_week' | 'last_week' | 'this_month' | '30d' | 'custom';
  const [periodPreset, setPeriodPreset] = useState<DetailPeriodPreset>('30d');
  const applyPeriodPreset = (preset: DetailPeriodPreset) => {
      setPeriodPreset(preset);
      const now = new Date();
      switch (preset) {
          case 'today':
              setDateRange({ from: startOfDay(now), to: now });
              break;
          case 'this_week':
              setDateRange({ from: startOfWeek(now, { weekStartsOn: 1 }), to: now });
              break;
          case 'last_week': {
              const lastWeek = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
              setDateRange({ from: lastWeek, to: endOfWeek(lastWeek, { weekStartsOn: 1 }) });
              break;
          }
          case 'this_month':
              setDateRange({ from: startOfMonth(now), to: now });
              break;
          case '30d':
              setDateRange({ from: subDays(now, 29), to: now });
              break;
          default:
              break;
      }
  };
  const handleManualDateChange = (range: DateRange | undefined) => {
      setPeriodPreset('custom');
      setDateRange(range);
  };

  const [uploadForm, setUploadForm] = useState({
    type: 'Registration',
    name: '',
    expiryDate: '',
    valuationDate: '',
    marketValue: '',
    forcedSaleValue: '',
    modelYear: '',
    chassisNumber: '',
    engineNumber: '',
    color: '',
    odometer: '',
    idv: '',
    policyPremium: '',
    excessDeductible: '',
    depreciationRate: '',
    authorizedDrivers: '',
    limitationsUse: '',
    policyNumber: '',
    make: '',
    model: '',
    bodyType: '',
    ccRating: '',
    issueDate: '',
    laNumber: '',
    plateNumber: '',
    mvid: '',
    controlNumber: '',
  });

  // Fetch Maintenance Logs
  useEffect(() => {
      if (vehicle.id || vehicle.licensePlate) {
          const vId = vehicle.id || vehicle.licensePlate;
          api.getMaintenanceLogs(vId).then(setMaintenanceLogs).catch(console.error);
      }
  }, [vehicle.id, vehicle.licensePlate]);

  useEffect(() => {
    const vId = vehicle.id || vehicle.licensePlate;
    if (!vId) return;
    if (isOdometerLoading) return;
    const baselineOdo =
      odometerHistory[0]?.value != null && Number.isFinite(Number(odometerHistory[0].value))
        ? Number(odometerHistory[0].value)
        : vehicle.metrics.odometer ?? 0;
    let cancelled = false;
    (async () => {
      try {
        let sch = await api.getMaintenanceSchedule(vId);
        if (!cancelled && sch.catalogMatched && (!sch.schedule || sch.schedule.length === 0)) {
          await api.bootstrapMaintenanceSchedule(vId, baselineOdo);
          sch = await api.getMaintenanceSchedule(vId);
        }
        if (!cancelled) {
          setMaintenanceScheduleRows(
            Array.isArray(sch.schedule) ? (sch.schedule as VehicleMaintenanceScheduleRowApi[]) : [],
          );
        }
        if (!cancelled && sch.maintenanceStatus) {
          setMaintenanceStatus({
            status: sch.maintenanceStatus.status,
            nextTypeLabel: sch.maintenanceStatus.nextTypeLabel,
            daysToService: sch.maintenanceStatus.daysToService,
            nextOdo: sch.maintenanceStatus.nextOdo,
            remainingKm: sch.maintenanceStatus.remainingKm,
          });
        }
      } catch (e) {
        console.error("[maintenance schedule]", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    vehicle.id,
    vehicle.licensePlate,
    vehicle.metrics.odometer,
    isOdometerLoading,
    odometerHistory,
  ]);

  // Analytics Logic — Performance + Km Tracking only (no estimated costs/idle)
  const analytics = useMemo(() => {
    const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id || t.vehicleId === vehicle.licensePlate);
    
    // Calculate date range
    const daysDiff = (dateRange?.from && dateRange?.to) ? Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1) : 30;
    const startDate = dateRange?.from ? startOfDay(dateRange.from) : subDays(new Date(), 29);

    const trendData = Array.from({ length: daysDiff }, (_, i) => {
        const d = addDays(startDate, i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            earnings: 0,
            trips: 0
        };
    });

    const kmTrackingData = Array.from({ length: daysDiff }, (_, i) => {
        const d = addDays(startDate, i);
        return {
            date: format(d, 'MMM dd'),
            fullDate: d,
            uber: 0,
            indrive: 0,
            roam: 0,
            other: 0
        };
    });

    const activityByHour = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        name: `${i}:00`,
        trips: 0,
        earnings: 0
    }));

    let totalDurationMinutes = 0;
    let totalDistance = 0;
    let sumVisibleEarnings = 0;
    let periodTripCount = 0;

    vehicleTrips.forEach(t => {
        const tDate = new Date(t.date);
        
        // Filter out trips outside of date range
        if (dateRange?.from && dateRange?.to) {
             if (!isWithinInterval(tDate, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) })) {
                 return;
             }
        } else {
             // Default 30 days logic if no range selected (though state initializes it)
             const cutoff = subDays(new Date(), 30);
             if (tDate < cutoff) return;
        }

        periodTripCount += 1;

        const dayStat = trendData.find(d => isSameDay(d.fullDate, tDate));
        if (dayStat) {
            dayStat.earnings += t.amount;
            dayStat.trips += 1;
        }
        
        const kmStat = kmTrackingData.find(d => isSameDay(d.fullDate, tDate));
        if (kmStat) {
            const p = (t.platform || 'other').toLowerCase();
            const dist = t.distance || 0;
            if (p.includes('uber')) kmStat.uber += dist;
            else if (p.includes('indrive')) kmStat.indrive += dist;
            else if (p.includes('goride') || p.includes('roam')) kmStat.roam += dist;
            else kmStat.other += dist;
        }

        const hourIndex = getHours(tDate);
        activityByHour[hourIndex].trips += 1;
        activityByHour[hourIndex].earnings += t.amount;

        totalDurationMinutes += (t.duration || 0);
        totalDistance += (t.distance || 0);
        sumVisibleEarnings += t.amount;
    });

    const activeHours = totalDurationMinutes / 60;
    const earningsPerTrip = periodTripCount > 0 ? sumVisibleEarnings / periodTripCount : 0;
    const earningsPerKm = totalDistance > 0 ? sumVisibleEarnings / totalDistance : 0;
    const earningsPerHour = activeHours > 0 ? sumVisibleEarnings / activeHours : 0;

    return {
        trendData,
        kmTrackingData,
        activityByHour,
        metrics: {
            earningsPerTrip,
            earningsPerKm,
            earningsPerHour,
            totalDistance,
            periodTripCount,
        },
    };
  }, [vehicle, trips, dateRange]);

  // Documents Logic
  const documents = useMemo(() => {
     const docs: VehicleDocument[] = [];
     const savedDocs = vehicle.documents || [];

     // Derived Docs
     if (vehicle.registrationExpiry || vehicle.registrationCertificateUrl) {
         if (!savedDocs.some(d => d.type === 'Registration')) {
             docs.push({
                 id: 'reg-cert',
                 name: 'Vehicle Registration',
                 type: 'Registration',
                 status: vehicle.registrationCertificateUrl ? 'Verified' : 'Pending',
                 expiryDate: vehicle.registrationExpiry || '',
                 uploadDate: vehicle.registrationIssueDate || new Date().toISOString(),
                 url: vehicle.registrationCertificateUrl,
                 metadata: {
                     laNumber: vehicle.laNumber,
                     plateNumber: vehicle.licensePlate,
                     mvid: vehicle.mvid,
                     chassisNumber: vehicle.vin,
                     controlNumber: vehicle.controlNumber
                 }
             });
         }
     }

     if (vehicle.fitnessExpiry || vehicle.fitnessCertificateUrl) {
         if (!savedDocs.some(d => d.type === 'Fitness')) {
             docs.push({
                 id: 'fitness-cert',
                 name: 'Certificate of Fitness',
                 type: 'Fitness',
                 status: vehicle.fitnessCertificateUrl ? 'Verified' : 'Pending',
                 expiryDate: vehicle.fitnessExpiry || '',
                 uploadDate: vehicle.fitnessIssueDate || new Date().toISOString(),
                 url: vehicle.fitnessCertificateUrl,
                 metadata: {
                     make: vehicle.make,
                     model: vehicle.model,
                     year: vehicle.year,
                     bodyType: vehicle.bodyType,
                     engineNumber: vehicle.engineNumber,
                     ccRating: vehicle.ccRating
                 }
             });
         }
     }

     if (vehicle.insuranceExpiry) {
         if (!savedDocs.some(d => d.type === 'Insurance')) {
             docs.push({
                 id: 'insurance-policy',
                 name: 'Insurance Policy',
                 type: 'Insurance',
                 status: 'Verified',
                 expiryDate: vehicle.insuranceExpiry,
                 uploadDate: new Date().toISOString()
             });
         }
     }
     
     const allDocs = [...docs, ...savedDocs, ...extraDocuments];
     const uniqueDocs = Array.from(new Map(allDocs.map(item => [item.id, item])).values());
     
     return uniqueDocs.filter(d => !deletedDocIds.includes(String(d.id)));
  }, [vehicle, extraDocuments, deletedDocIds]);

  const handleRefreshMaintenance = () => {
      const vId = vehicle.id || vehicle.licensePlate;
      api.getMaintenanceLogs(vId).then(setMaintenanceLogs).catch(console.error);
      api
        .getMaintenanceSchedule(vId)
        .then((sch) => {
          setMaintenanceScheduleRows(
            Array.isArray(sch.schedule) ? (sch.schedule as VehicleMaintenanceScheduleRowApi[]) : [],
          );
          if (sch.maintenanceStatus) {
            setMaintenanceStatus({
              status: sch.maintenanceStatus.status,
              nextTypeLabel: sch.maintenanceStatus.nextTypeLabel,
              daysToService: sch.maintenanceStatus.daysToService,
              nextOdo: sch.maintenanceStatus.nextOdo,
              remainingKm: sch.maintenanceStatus.remainingKm,
            });
          }
        })
        .catch(console.error);
  };

  const handleUnassignTag = async () => {
    if (!window.confirm("Are you sure you want to unlink this toll tag?")) return;
    try {
        const updatedVehicle = {
            ...vehicle,
            tollTagId: undefined,
            tollTagUuid: undefined,
            tollTagProvider: undefined
        };
        await api.saveVehicle(updatedVehicle);
        if (vehicle.tollTagUuid) {
             const tags = await api.getTollTags();
             const tag = tags.find((t: any) => t.id === vehicle.tollTagUuid);
             if (tag) {
                 await api.saveTollTag({
                     ...tag,
                     assignedVehicleId: undefined,
                     assignedVehicleName: undefined,
                      assignmentHistory: (tag.assignmentHistory || []).map((e: any) => e.vehicleId === vehicle.id && !e.unassignedAt ? { ...e, unassignedAt: new Date().toISOString() } : e),
                      updatedAt: new Date().toISOString()
                 });
             }
        }
        toast.success("Toll tag unlinked");
        if (onUpdate) onUpdate(updatedVehicle);
    } catch (error) {
        toast.error("Failed to unlink tag");
    }
  };

  const handleUpdateOdometer = async () => {
      if (!newOdometerValue || !newOdometerDate) {
          toast.error("Please enter a valid reading and date");
          return;
      }
      const km = parseFloat(newOdometerValue);
      if (!Number.isFinite(km) || km <= 0) {
          toast.error("Enter a valid odometer reading");
          return;
      }

      if (odometerEntryKind === 'checkin') {
          if (!vehicle.currentDriverId) {
              toast.error("Assign a driver to this vehicle before logging a check-in");
              return;
          }
          if (!newOdometerNotes.trim()) {
              toast.error("Add a note — required for a manager check-in");
              return;
          }
      }

      const recordedAt = (() => {
          const [y, mo, d] = newOdometerDate.split('-').map(Number);
          const [hh, mm] = (newOdometerTime || '12:00').split(':').map(Number);
          return new Date(y, mo - 1, d, hh || 0, mm || 0, 0).toISOString();
      })();

      setIsUpdatingOdometer(true);
      try {
          if (odometerEntryKind === 'checkin') {
              const weekStart = dateWeekKey(newOdometerDate, 'America/Jamaica');
              if (!weekStart) {
                  toast.error("Pick a valid date");
                  return;
              }
              const reason = newOdometerNotes.trim();
              await api.saveCheckIn({
                  id: crypto.randomUUID(),
                  driverId: vehicle.currentDriverId as string,
                  vehicleId: vehicle.id || vehicle.licensePlate,
                  timestamp: recordedAt,
                  odometer: km,
                  weekStart,
                  method: 'manual_override',
                  reviewStatus: 'approved',
                  verified: true,
                  isVerified: true,
                  manualReadingReason: reason,
                  managerNotes: reason,
                  source: 'Weekly Check-in',
              });
              toast.success("Check-in logged");
          } else {
              await odometerService.addReading({
                  vehicleId: vehicle.id || vehicle.licensePlate,
                  value: km,
                  date: recordedAt,
                  source: 'Manual Update',
                  type: 'Hard',
                  isVerified: true,
                  isAnchorPoint: true,
                  notes: newOdometerNotes
              });
              toast.success("Odometer updated successfully");
          }

          setOdometerRefreshTrigger(prev => prev + 1);
          setIsUpdateOdometerOpen(false);
          setNewOdometerValue('');
          setNewOdometerNotes('');
          setOdometerEntryKind('manual');
      } catch (error) {
          console.error(error);
          toast.error(error instanceof Error ? error.message : "Failed to update odometer");
      } finally {
          setIsUpdatingOdometer(false);
      }
  };

  const handleSaveDocument = async () => {
    let docId = editingDocId;
    if (!docId) {
        if (uploadForm.type === 'Registration') docId = 'reg-cert';
        else if (uploadForm.type === 'Fitness') docId = 'fitness-cert';
        else if (uploadForm.type === 'Insurance') docId = 'insurance-policy';
        else if (uploadForm.type === 'Valuation') docId = 'valuation-report';
        else docId = `doc-${Date.now()}`;
    }
    
    const newDoc: VehicleDocument = {
        id: docId,
        name: uploadForm.name || `${uploadForm.type} Document`,
        type: uploadForm.type,
        status: 'Verified',
        expiryDate: uploadForm.expiryDate,
        uploadDate: new Date().toISOString(),
        metadata: { ...uploadForm }
    };
    
    if (editingDocId) {
        setExtraDocuments(prev => prev.map(d => d.id === editingDocId ? newDoc : d));
    } else {
        setExtraDocuments([...extraDocuments, newDoc]);
    }
    
    setIsUploadOpen(false);
    
    try {
        const updatedVehicle = { ...vehicle };
        if (newDoc.type === 'Registration' && (editingDocId === 'reg-cert' || !editingDocId)) {
             updatedVehicle.registrationExpiry = newDoc.expiryDate;
        }
        if (newDoc.type === 'Fitness' && (editingDocId === 'fitness-cert' || !editingDocId)) {
             updatedVehicle.fitnessExpiry = newDoc.expiryDate;
        }
        if (newDoc.type === 'Insurance' && (editingDocId === 'insurance-policy' || !editingDocId)) {
             updatedVehicle.insuranceExpiry = newDoc.expiryDate;
        }

        if (updatedVehicle.documents) {
            if (editingDocId) {
                const index = updatedVehicle.documents.findIndex(d => d.id === editingDocId);
                if (index >= 0) updatedVehicle.documents[index] = newDoc;
                else updatedVehicle.documents.push(newDoc);
            } else {
                updatedVehicle.documents.push(newDoc);
            }
        } else {
            updatedVehicle.documents = [newDoc];
        }
        
        await api.saveVehicle(updatedVehicle);
        toast.success("Document saved successfully");
    } catch (error) {
        toast.error("Failed to save document");
    }
    setEditingDocId(null);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      
      {/* --- Top Navigation --- */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="pl-0 hover:bg-transparent hover:text-indigo-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Fleet
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This week' },
            { id: 'last_week', label: 'Last week' },
            { id: 'this_month', label: 'This month' },
            { id: '30d', label: '30 days' },
          ] as Array<{ id: DetailPeriodPreset; label: string }>).map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={periodPreset === p.id ? 'default' : 'outline'}
              className={periodPreset === p.id ? 'min-h-11 px-3 bg-indigo-600 hover:bg-indigo-600' : 'min-h-11 px-3'}
              onClick={() => applyPeriodPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <DatePickerWithRange date={dateRange} setDate={handleManualDateChange} />
        </div>
      </div>

      <VehicleDetailCatalogGate
        parked={parked}
        vehicle={vehicle}
        catalogPendingRow={catalogPendingRow}
        effectiveCatalogStatus={effectiveCatalogStatus}
        showCatalogAlignmentBanner={showCatalogAlignmentBanner}
        setAlignModalOpen={setAlignModalOpen}
        setPendingDrawerOpen={setPendingDrawerOpen}
        alignModalOpen={alignModalOpen}
        alignSearchMake={alignSearchMake}
        onAlignMakeChange={onAlignMakeChange}
        alignMakeOptions={alignMakeOptions}
        alignMakesLoading={alignMakesLoading}
        alignSearchModel={alignSearchModel}
        onAlignModelChange={onAlignModelChange}
        alignModelOptions={alignModelOptions}
        alignModelsLoading={alignModelsLoading}
        alignSearchYear={alignSearchYear}
        onAlignYearChange={onAlignYearChange}
        alignYearOptions={alignYearOptions}
        alignYearsLoading={alignYearsLoading}
        alignSearchChassis={alignSearchChassis}
        setAlignSearchChassis={setAlignSearchChassis}
        alignMmyChassisOptions={alignMmyFacets.chassis_code}
        alignMmyLoading={alignMmyLoading}
        alignSearchDrivetrain={alignSearchDrivetrain}
        setAlignSearchDrivetrain={setAlignSearchDrivetrain}
        alignDrivetrainOptions={alignFacets.drivetrain}
        alignFacetsLoading={alignFacetsLoading}
        alignSearchTransmission={alignSearchTransmission}
        setAlignSearchTransmission={setAlignSearchTransmission}
        alignTransmissionOptions={alignFacets.transmission}
        alignSelectedRow={alignSelectedRow}
        handleAlignPickerChange={handleAlignPickerChange}
        alignSaving={alignSaving}
        handleAlignSave={handleAlignSave}
        alignPickerSource={alignPickerSource}
        pendingDrawerOpen={pendingDrawerOpen}
      />

      <VehicleDetailHeader
        vehicle={vehicle}
        showCatalogVerifiedBadge={showCatalogVerifiedBadge}
        showCatalogLinkBrokenBadge={showCatalogLinkBrokenBadge}
        linkedCatalog={linkedCatalog}
        setAlignModalOpen={setAlignModalOpen}
        onAssignDriver={onAssignDriver}
        handleUnassignTag={handleUnassignTag}
        onUpdate={onUpdate}
      />

      <Tabs defaultValue="performance" className="w-full">
          <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="expenses">Vehicle Expenses</TabsTrigger>
              <TabsTrigger value="odometer">Odometer</TabsTrigger>
              <TabsTrigger value="km-tracking">Km Tracking</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <VehicleDetailPerformanceTab analytics={analytics} />

          <TabsContent value="expenses" className="space-y-6 mt-6">
              <FixedExpensesManager
                vehicleId={vehicle.id || vehicle.licensePlate}
                onNavigateToExpenseHub={onNavigateToExpenseHub}
              />
          </TabsContent>

          <VehicleDetailOdometerTab
            digits={digits}
            lastVerifiedDate={lastVerifiedDate}
            odometerHistory={odometerHistory}
            setIsUpdateOdometerOpen={setIsUpdateOdometerOpen}
            fetchOdometerHistory={fetchOdometerHistory}
            vehicle={vehicle}
            handleExportMasterLog={handleExportMasterLog}
            handleExportCheckins={handleExportCheckins}
            odometerRefreshTrigger={odometerRefreshTrigger}
          />

          <VehicleDetailKmTrackingTab analytics={analytics} vehicle={vehicle} />

          <VehicleDetailProfileTab
            generalInfoFields={generalInfoFields}
            setIsUploadOpen={setIsUploadOpen}
            documents={documents}
            vehicle={vehicle}
            maintenanceLogs={maintenanceLogs}
            maintenanceStatus={maintenanceStatus}
            catalogMaintenanceOptions={catalogMaintenanceOptions}
            handleRefreshMaintenance={handleRefreshMaintenance}
          />
      </Tabs>

      {/* --- Dialogs --- */}
      <Dialog open={isUpdateOdometerOpen} onOpenChange={setIsUpdateOdometerOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle2>{odometerEntryKind === 'checkin' ? 'Log check-in' : 'Update Odometer'}</DialogTitle2>
                  <DialogDescription>
                    {odometerEntryKind === 'checkin'
                      ? 'Record a weekly check-in for the driver assigned to this vehicle.'
                      : 'Record a new odometer reading for this vehicle.'}
                  </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={odometerEntryKind}
                        onValueChange={(v) => setOdometerEntryKind(v as 'manual' | 'checkin')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual reading</SelectItem>
                          <SelectItem value="checkin">Weekly check-in</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label>New Reading (km)</Label>
                      <Input 
                          type="number" 
                          placeholder="e.g. 45050" 
                          value={newOdometerValue}
                          onChange={(e) => setNewOdometerValue(e.target.value)}
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Date</Label>
                          <Input 
                              type="date" 
                              value={newOdometerDate}
                              onChange={(e) => setNewOdometerDate(e.target.value)}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Time</Label>
                          <Input 
                              type="time" 
                              value={newOdometerTime}
                              onChange={(e) => setNewOdometerTime(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="space-y-2">
                      <Label>{odometerEntryKind === 'checkin' ? 'Notes (required)' : 'Notes (Optional)'}</Label>
                      <Textarea 
                          placeholder={odometerEntryKind === 'checkin' ? 'Why this check-in is being logged' : 'Routine check, service, etc.'}
                          value={newOdometerNotes}
                          onChange={(e) => setNewOdometerNotes(e.target.value)}
                      />
                  </div>
              </div>
              <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsUpdateOdometerOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpdateOdometer} disabled={isUpdatingOdometer}>
                      {isUpdatingOdometer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {odometerEntryKind === 'checkin' ? 'Save check-in' : 'Update Reading'}
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-md">
              <DialogHeader>
                  <DialogTitle2>{editingDocId ? 'Edit Document' : 'Upload Document'}</DialogTitle2>
                  <DialogDescription>Add or update vehicle documentation.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>Document Type</Label>
                      <Select 
                          value={uploadForm.type} 
                          onValueChange={(val) => setUploadForm({...uploadForm, type: val})}
                      >
                          <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="Registration">Registration</SelectItem>
                              <SelectItem value="Insurance">Insurance</SelectItem>
                              <SelectItem value="Fitness">Fitness</SelectItem>
                              <SelectItem value="Valuation">Valuation</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Expiry Date</Label>
                          <Input 
                              type="date" 
                              value={uploadForm.expiryDate}
                              onChange={(e) => setUploadForm({...uploadForm, expiryDate: e.target.value})}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Issue Date</Label>
                          <Input 
                              type="date" 
                              value={uploadForm.issueDate || ''}
                              onChange={(e) => setUploadForm({...uploadForm, issueDate: e.target.value})}
                          />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <Label>File</Label>
                      <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                          <Upload className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-sm font-medium text-slate-600">{selectedFile ? selectedFile.name : "Click to upload"}</p>
                          <p className="text-xs text-slate-400">PDF, JPG, PNG up to 5MB</p>
                          <input 
                              id="file-upload" 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          />
                      </div>
                  </div>
              </div>
              <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                  <Button onClick={handleSaveDocument}>Save Document</Button>
              </div>
          </DialogContent>
      </Dialog>

    </div>
  );
}
