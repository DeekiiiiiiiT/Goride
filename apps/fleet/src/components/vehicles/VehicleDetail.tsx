import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Clock, 
  MapPin, 
  TrendingUp, 
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Loader2,
  Scan,
  Activity,
  Tag,
  Unlink,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  MoreVertical,
  Wind,
  Zap,
  Settings,
  Scale,
  Move,
  Info,
  Car,
  Gauge,
  ShieldCheck,
  ChevronDown,
  ListChecks,
  FileUp,
  History,
  RotateCw,
  BookMarked
} from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTitle as DialogTitle2,
} from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Vehicle, VehicleDocument } from '../../types/vehicle';
import { Trip } from '../../types/data';
import { api } from '../../services/api';
import { odometerService } from '../../services/odometerService';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { format, subDays, isSameDay, getHours, differenceInDays, addDays, startOfDay, endOfDay, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "../ui/date-range-picker";
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useAuth } from '../auth/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { getFleetVehicleCatalog } from '../../services/pendingVehicleCatalogService';
import { useMyPendingCatalogRequests } from '../../hooks/useMyPendingCatalogRequests';
import type { VehicleCatalogRecord } from '../../types/vehicleCatalog';
import {
  isVehicleParked,
  isVehicleCatalogMatched,
  catalogStatusLabel,
  deriveCatalogStatus,
} from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { CatalogVariantPicker, type CatalogVariantPickerSource } from './CatalogVariantPicker';
import { CatalogFacetSelect } from './CatalogFacetSelect';
import { useCatalogCandidates } from '../../hooks/useCatalogCandidates';
import { useVehicleCatalogAnchorFacets } from '../../hooks/useVehicleCatalogAnchorFacets';
import { PendingCatalogRequestsDrawer } from './PendingCatalogRequestsDrawer';
import { TollClassPicker } from './TollClassPicker';

import { OdometerHistory } from './odometer/OdometerHistory';
import { MasterLogTimeline } from './odometer/MasterLogTimeline';
import { ImportOdometerModal } from './odometer/ImportOdometerModal';
import { FixedExpensesManager } from './expenses/FixedExpensesManager';
import { EquipmentManager } from './EquipmentManager';
import { ExteriorManager } from './ExteriorManager';
import { MaintenanceManager, MaintenanceLog } from './MaintenanceManager';
import { KmLTracking } from './KmLTracking';
import type {
  CatalogMaintenanceTaskOption,
  VehicleMaintenanceScheduleRowApi,
} from '../../types/maintenance';
import { catalogOptionsFromScheduleRows } from '../../utils/maintenanceCatalogOptions';

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
  const [newOdometerNotes, setNewOdometerNotes] = useState('');
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
  /** Start true when a vehicle is shown so maintenance bootstrap waits for unified odometer fetch. */
  const [isOdometerLoading, setIsOdometerLoading] = useState(() => Boolean(vehicle.id || vehicle.licensePlate));

  const fetchOdometerHistory = useCallback(async () => {
    if (!vehicle.id && !vehicle.licensePlate) return;
    setIsOdometerLoading(true);
    try {
      const data = await odometerService.getUnifiedHistory(vehicle.id || vehicle.licensePlate);
      setOdometerHistory(data || []);
    } catch (error) {
      console.error("Failed to load odometer history", error);
    } finally {
      setIsOdometerLoading(false);
    }
  }, [vehicle.id, vehicle.licensePlate]);

  useEffect(() => {
    fetchOdometerHistory();
  }, [fetchOdometerHistory, odometerRefreshTrigger]);

  const latestReading = odometerHistory[0]?.value || vehicle.metrics.odometer || 0;
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
      
      setIsUpdatingOdometer(true);
      try {
          await odometerService.addReading({
              vehicleId: vehicle.id || vehicle.licensePlate,
              value: parseFloat(newOdometerValue),
              date: newOdometerDate,
              source: 'Manual Update',
              type: 'Hard',
              isVerified: true,
              isAnchorPoint: true,
              notes: newOdometerNotes
          });
          
          toast.success("Odometer updated successfully");
          setOdometerRefreshTrigger(prev => prev + 1);
          setIsUpdateOdometerOpen(false);
          
          // Reset form
          setNewOdometerValue('');
          setNewOdometerNotes('');
      } catch (error) {
          console.error(error);
          toast.error("Failed to update odometer");
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

      {parked && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-amber-900">
                  {catalogPendingRow?.status === 'needs_info'
                    ? 'Action needed: platform admin requested more information'
                    : 'Vehicle is parked — pending catalog approval'}
                </h3>
                <p className="mt-1 text-sm text-amber-900/95">
                  This vehicle cannot be assigned to a driver, fueled, or have trips recorded against it until the platform
                  admin approves a motor catalog entry for <strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong>.
                  Status is locked to <em>Inactive</em> in the meantime.
                </p>
              </div>
              {catalogPendingRow?.status === 'needs_info' && catalogPendingRow.info_request_message && (
                <div className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">
                  <div className="font-semibold mb-1">Admin message</div>
                  <p className="whitespace-pre-wrap">{catalogPendingRow.info_request_message}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-700 text-white hover:bg-amber-800"
                  onClick={() => setAlignModalOpen(true)}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  Pick from catalog
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                  onClick={() => setPendingDrawerOpen(true)}
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  View pending requests
                </Button>
                <span className="text-xs text-amber-800">
                  Status: <strong>{catalogStatusLabel(effectiveCatalogStatus)}</strong>
                  {catalogPendingRow?.id ? ` \u00B7 Request #${catalogPendingRow.id.slice(0, 8)}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!parked && showCatalogAlignmentBanner && (
        <Alert className="border-amber-200 bg-amber-50/90 text-amber-950">
          <BookMarked className="text-amber-700" />
          <AlertTitle>Motor catalog review in progress</AlertTitle>
          <AlertDescription className="text-amber-900/90">
            <p>
              The current catalog match is being reviewed. Maintenance schedules may update once the platform confirms
              the right variant.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-amber-700 text-white hover:bg-amber-800"
                onClick={() => setAlignModalOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Align with catalog
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                onClick={() => setPendingDrawerOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                View pending requests
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* --- Header Section --- */}
      <div className="grid grid-cols-1 gap-6">
          <Card className="overflow-hidden border-indigo-100 shadow-sm">
             <div className="flex flex-col md:flex-row h-full">
                 <div className="md:w-1/3 relative bg-slate-100 min-h-[200px]">
                     {vehicle.image?.startsWith('figma:') ? (
                        <ImageWithFallback src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     ) : (
                        <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     )}
                     <div className="absolute top-3 left-3">
                         <Badge className={vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-500'}>
                             {vehicle.status}
                         </Badge>
                     </div>
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-between">
                     <div>
                         <div className="flex justify-between items-start">
                             <div>
                                 <div className="flex flex-wrap items-center gap-2">
                                   <h1 className="text-2xl font-bold text-slate-900">
                                     {vehicle.year} {vehicle.model}
                                   </h1>
                                   {showCatalogVerifiedBadge && (
                                     <Badge
                                       className="border-0 bg-emerald-600 text-white hover:bg-emerald-600 gap-1 font-medium shadow-sm"
                                       title="This vehicle is linked to a motor catalog row (verified)."
                                     >
                                       <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                                       Catalog verified
                                     </Badge>
                                   )}
                                   {showCatalogLinkBrokenBadge && (
                                     <>
                                       <Badge
                                         variant="outline"
                                         className="gap-1 border-amber-500 bg-amber-50 text-amber-900 font-medium"
                                         title="The saved catalog id no longer exists (e.g. after a catalog re-import). Use Fix catalog link to pick the current row."
                                       >
                                         <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                         Catalog link issue
                                       </Badge>
                                       <Button
                                         type="button"
                                         size="sm"
                                         className="h-8 gap-1.5 bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                                         onClick={() => setAlignModalOpen(true)}
                                       >
                                         <ListChecks className="h-3.5 w-3.5" aria-hidden />
                                         Fix catalog link
                                       </Button>
                                     </>
                                   )}
                                 </div>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-600">{vehicle.licensePlate}</span>
                                     <span className="text-sm text-slate-400">|</span>
                                     <span className="text-sm text-slate-500">VIN: {vehicle.vin}</span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-sm text-slate-500">Lifetime Earnings</p>
                                 <p className="text-2xl font-bold text-emerald-600">${vehicle.metrics.totalLifetimeEarnings.toLocaleString()}</p>
                             </div>
                         </div>
                         
                             <div className="mt-6 flex items-center gap-4">
                                 <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-lg border border-indigo-100 pr-8">
                                     <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                         <Activity className="h-5 w-5" />
                                     </div>
                                     <div>
                                         <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Current Driver</p>
                                         <p className="font-medium text-slate-900">{vehicle.currentDriverName || 'Unassigned'}</p>
                                     </div>
                                     <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="ml-4 h-8 text-xs bg-white"
                                        onClick={onAssignDriver}
                                     >
                                         Change Driver
                                     </Button>
                                 </div>

                                 <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 pr-8">
                                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                                        <Tag className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Toll Tag</p>
                                        <p className="font-medium text-slate-900">
                                            {vehicle.tollTagId ? `${vehicle.tollTagProvider} ${vehicle.tollTagId}` : 'None Assigned'}
                                        </p>
                                    </div>
                                    {vehicle.tollTagId && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="ml-4 h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                            onClick={handleUnassignTag}
                                            title="Unlink Tag"
                                        >
                                            <Unlink className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                             </div>
                             <div className="mt-3 max-w-md">
                               <TollClassPicker
                                 value={vehicle.tollClassId || 'class1'}
                                 needsReview={!!vehicle.tollClassNeedsReview || !vehicle.tollClassId}
                                 onChange={async (classId) => {
                                   const updatedVehicle = {
                                     ...vehicle,
                                     tollClassId: classId,
                                     tollClassNeedsReview: false,
                                   };
                                   try {
                                     await api.saveVehicle(updatedVehicle);
                                     onUpdate?.(updatedVehicle);
                                     toast.success('Toll class updated');
                                   } catch (e: any) {
                                     toast.error(e?.message || 'Failed to save toll class');
                                   }
                                 }}
                               />
                             </div>
                             <div className="mt-3 max-w-lg rounded-lg border border-slate-200 bg-slate-50 p-3">
                               <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                 Jamaica fitness class
                               </p>
                               <p className="mt-1 text-xs text-slate-500">
                                 Used by Expense Hub Fitness permit rules.
                               </p>
                               <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                 <div className="space-y-1.5">
                                   <Label className="text-xs text-slate-500">Usage category</Label>
                                   <Select
                                     value={vehicle.usageCategory || 'none'}
                                     onValueChange={async (v) => {
                                       const usageCategory =
                                         v === 'none'
                                           ? undefined
                                           : (v as Vehicle['usageCategory']);
                                       const updatedVehicle = {
                                         ...vehicle,
                                         usageCategory,
                                         fitnessFirstRegistration:
                                           usageCategory === 'Commercial'
                                             ? vehicle.fitnessFirstRegistration
                                             : undefined,
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('Usage category updated');
                                       } catch (e: any) {
                                         toast.error(e?.message || 'Failed to update');
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="min-h-10 bg-white">
                                       <SelectValue placeholder="Not set" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="none">Not set</SelectItem>
                                       <SelectItem value="Private">Private / SUV</SelectItem>
                                       <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                                       <SelectItem value="Commercial">Commercial</SelectItem>
                                       <SelectItem value="PPV">Public passenger (PPV)</SelectItem>
                                       <SelectItem value="Trailer">Trailer / heavy tractor</SelectItem>
                                     </SelectContent>
                                   </Select>
                                 </div>
                                 <div className="space-y-1.5">
                                   <Label className="text-xs text-slate-500">Plate class</Label>
                                   <Select
                                     value={vehicle.plateClass || 'none'}
                                     onValueChange={async (v) => {
                                       const updatedVehicle = {
                                         ...vehicle,
                                         plateClass:
                                           v === 'none' ? undefined : (v as Vehicle['plateClass']),
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('Plate class updated');
                                       } catch (e: any) {
                                         toast.error(e?.message || 'Failed to update');
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="min-h-10 bg-white">
                                       <SelectValue placeholder="Not set" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="none">Not set</SelectItem>
                                       <SelectItem value="White">White</SelectItem>
                                       <SelectItem value="Green">Green</SelectItem>
                                       <SelectItem value="Red">Red</SelectItem>
                                     </SelectContent>
                                   </Select>
                                 </div>
                               </div>
                               {vehicle.usageCategory === 'Commercial' && (
                                 <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                                   <input
                                     type="checkbox"
                                     checked={!!vehicle.fitnessFirstRegistration}
                                     onChange={async (e) => {
                                       const updatedVehicle = {
                                         ...vehicle,
                                         fitnessFirstRegistration: e.target.checked,
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('First registration flag updated');
                                       } catch (err: any) {
                                         toast.error(err?.message || 'Failed to update');
                                       }
                                     }}
                                   />
                                   First registration (brand-new commercial fitness)
                                 </label>
                               )}
                             </div>
                     </div>
                 </div>
             </div>
          </Card>

      </div>

      <Tabs defaultValue="performance" className="w-full">
          <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="expenses">Vehicle Expenses</TabsTrigger>
              <TabsTrigger value="odometer">Odometer</TabsTrigger>
              <TabsTrigger value="km-tracking">Km Tracking</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6 mt-6">
              <ErrorBoundary name="PerformanceCharts">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Hour</p>
                              <Clock className="h-4 w-4 text-emerald-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerHour.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              From trip duration in selected period
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Trip</p>
                              <MapPin className="h-4 w-4 text-indigo-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerTrip.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              Based on {analytics.metrics.periodTripCount} trips
                          </p>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-medium text-slate-500">Earnings per Km</p>
                              <Activity className="h-4 w-4 text-amber-500" />
                          </div>
                          <h3 className="text-2xl font-bold text-slate-900">${analytics.metrics.earningsPerKm.toFixed(2)}</h3>
                          <p className="text-xs text-slate-400 mt-1">
                              {Math.round(analytics.metrics.totalDistance).toLocaleString()} km in period
                          </p>
                      </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                      <CardHeader>
                          <CardTitle>Earnings Trend</CardTitle>
                          <CardDescription>Daily revenue for the selected period</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart data={analytics.trendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                  <RechartsTooltip formatter={(value) => [`$${Number(value)}`, 'Earnings']} />
                                  <Bar dataKey="earnings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader>
                          <CardTitle>Hourly Activity</CardTitle>
                          <CardDescription>Peak earning hours</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                              <BarChart data={analytics.activityByHour}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                  <RechartsTooltip />
                                  <Bar dataKey="trips" fill="#10b981" radius={[4, 4, 0, 0]} name="Trips" />
                              </BarChart>
                          </ResponsiveContainer>
                      </CardContent>
                  </Card>
                </div>
              </ErrorBoundary>
          </TabsContent>

          <TabsContent value="expenses" className="space-y-6 mt-6">
              <FixedExpensesManager
                vehicleId={vehicle.id || vehicle.licensePlate}
                onNavigateToExpenseHub={onNavigateToExpenseHub}
              />
          </TabsContent>

          <TabsContent value="odometer" className="space-y-6 mt-6">
              <ErrorBoundary name="OdometerView">
                {/* Live Fleet Status - Unified Header */}
                <div className="bg-slate-950 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none"></div>
                    
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative z-10">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-500/20 p-2 rounded-lg">
                                    <ShieldCheck className="h-5 w-5 text-indigo-300" />
                                </div>
                                <div>
                                    <h3 className="text-indigo-200 font-semibold tracking-wide uppercase text-[10px]">Verified Odometer Anchor</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold tracking-tight">Live Fleet Status</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-end gap-3">
                                <div className="flex gap-1">
                                    {digits.map((digit, i) => (
                                        <div key={i} className="w-11 h-16 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-4xl font-mono font-bold text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                                            {digit}
                                        </div>
                                    ))}
                                </div>
                                <div className="pb-2">
                                    <span className="text-2xl text-slate-500 font-mono">km</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-4 pt-2">
                                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                    <span>Verified Anchor: {lastVerifiedDate ? format(new Date(lastVerifiedDate), 'MMM d, yyyy') : 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                                    <Info className="h-4 w-4 text-indigo-400" />
                                    <span>Source: {odometerHistory[0]?.source || 'None'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto">
                            <Button 
                                onClick={() => setIsUpdateOdometerOpen(true)} 
                                className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 font-bold"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Manual Odometer Entry
                            </Button>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl"
                                    onClick={fetchOdometerHistory}
                                    title="Refresh Data"
                                >
                                    <RotateCw className="w-4 h-4" />
                                </Button>
                                <ImportOdometerModal 
                                    vehicleId={vehicle.id || vehicle.licensePlate} 
                                    onImportComplete={fetchOdometerHistory} 
                                    triggerClassName="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl px-4"
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button 
                                            variant="outline" 
                                            className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl px-4 min-w-[60px]"
                                            title="Export Data"
                                        >
                                            <FileUp className="w-4 h-4 mr-2" />
                                            <ChevronDown className="w-3 h-3 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleExportMasterLog}>
                                            <FileUp className="w-4 h-4 mr-2 text-indigo-500" />
                                            <span>Export Master Log</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleExportCheckins}>
                                            <ListChecks className="w-4 h-4 mr-2 text-emerald-500" />
                                            <span>Export Check-ins</span>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Odometer History</CardTitle>
                        <CardDescription>
                            Track mileage verification and history. Gap audit (anchors → trips → personal km) lives in Consumption Reconciliation → Stop-to-Stop → Explain gap.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="history">
                            <TabsList>
                                <TabsTrigger value="history">History Log</TabsTrigger>
                                <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
                            </TabsList>
                            <TabsContent value="history" className="mt-4">
                                <OdometerHistory 
                                    vehicleId={vehicle.id || vehicle.licensePlate} 
                                    refreshTrigger={odometerRefreshTrigger}
                                />
                            </TabsContent>
                            <TabsContent value="anomalies" className="mt-4">
                                <MasterLogTimeline vehicleId={vehicle.id || vehicle.licensePlate} viewMode="anomalies" />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
              </ErrorBoundary>
          </TabsContent>

          <TabsContent value="km-tracking" className="space-y-6 mt-6">
              <Tabs defaultValue="km-overview" className="w-full">
                  <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none h-auto p-0 mb-6 gap-6">
                      <TabsTrigger 
                          value="km-overview" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Km Overview
                      </TabsTrigger>
                      <TabsTrigger 
                          value="kml-tracking" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Km/L Tracking
                      </TabsTrigger>
                  </TabsList>

                  <TabsContent value="km-overview" className="space-y-6 mt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <Card>
                              <CardHeader>
                                  <CardTitle>Km by Platform</CardTitle>
                                  <CardDescription>Where are the miles coming from?</CardDescription>
                              </CardHeader>
                              <CardContent className="h-[300px]">
                                  <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                      <BarChart data={analytics.kmTrackingData}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                          <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                                          <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                          <RechartsTooltip />
                                          <Bar dataKey="uber" stackId="a" fill="#000000" name="Uber" />
                                          <Bar dataKey="indrive" stackId="a" fill="#10b981" name="InDrive" />
                                          <Bar dataKey="roam" stackId="a" fill="#6366f1" name="Roam" />
                                          <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                  </ResponsiveContainer>
                              </CardContent>
                          </Card>
                          
                          <Card>
                              <CardHeader>
                                  <CardTitle>Projected Annual Mileage</CardTitle>
                                  <CardDescription>Based on current trends</CardDescription>
                              </CardHeader>
                              <CardContent>
                                  <div className="text-center py-10">
                                      <div className="text-5xl font-bold text-slate-900 mb-2">
                                          {((analytics.metrics.totalDistance / 30) * 365).toLocaleString(undefined, {maximumFractionDigits: 0})}
                                      </div>
                                      <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold">Km / Year</p>
                                      <div className="mt-6 flex justify-center gap-8">
                                          <div>
                                              <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.totalDistance / 30).toFixed(1)}</p>
                                              <p className="text-xs text-slate-400">Avg Km / Day</p>
                                          </div>
                                          <div>
                                              <p className="text-2xl font-bold text-slate-700">{(analytics.metrics.earningsPerKm * (analytics.metrics.totalDistance / 30)).toLocaleString(undefined, {style: 'currency', currency: 'USD'})}</p>
                                              <p className="text-xs text-slate-400">Est. Daily Rev</p>
                                          </div>
                                      </div>
                                  </div>
                              </CardContent>
                          </Card>
                      </div>
                  </TabsContent>

                  <TabsContent value="kml-tracking" className="space-y-6 mt-0">
                      <KmLTracking vehicle={vehicle} />
                  </TabsContent>
              </Tabs>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-6">
              <Tabs defaultValue="general" className="w-full">
                  <TabsList className="w-full justify-start bg-transparent border-b border-slate-200 rounded-none h-auto p-0 mb-6 gap-6">
                      <TabsTrigger 
                          value="general" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          General Info
                      </TabsTrigger>
                      <TabsTrigger 
                          value="documents" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Documents
                      </TabsTrigger>
                      <TabsTrigger 
                          value="maintenance" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Maintenance
                      </TabsTrigger>
                      <TabsTrigger 
                          value="equipment" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Equipment
                      </TabsTrigger>
                      <TabsTrigger 
                          value="exterior" 
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 border-b-2 border-transparent rounded-none px-0 py-2"
                      >
                          Exterior Check
                      </TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-6">
                      <Card>
                          <CardHeader>
                              <CardTitle>Vehicle details</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                  <div>
                                      <Label className="text-xs text-slate-500">Make</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.make}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Model</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.model}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Year</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.year}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel type</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelType}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel grade</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelGrade}</p>
                                  </div>
                                  <div>
                                      <Label className="text-xs text-slate-500">Fuel tank capacity</Label>
                                      <p className="font-medium text-slate-900 mt-0.5">{generalInfoFields.fuelTank}</p>
                                  </div>
                                  <div className="sm:col-span-2">
                                      <Label className="text-xs text-slate-500">VIN</Label>
                                      <p className="font-medium text-slate-900 mt-0.5 font-mono text-sm tracking-wide">{generalInfoFields.vin}</p>
                                  </div>
                              </div>
                          </CardContent>
                      </Card>
                  </TabsContent>

                  <TabsContent value="documents" className="space-y-6">
                      <Card>
                          <CardHeader>
                              <div className="flex justify-between items-center">
                                  <CardTitle>Documents</CardTitle>
                                  <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(true)}>
                                      <Upload className="h-4 w-4 mr-2" /> Upload
                                  </Button>
                              </div>
                          </CardHeader>
                          <CardContent>
                              <div className="space-y-2">
                                  {documents.map(doc => (
                                      <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                          <div className="flex items-center gap-3">
                                              <FileText className="h-5 w-5 text-indigo-500" />
                                              <div>
                                                  <p className="font-medium text-sm text-slate-900">{doc.name}</p>
                                                  <p className="text-xs text-slate-500">Expires: {doc.expiryDate || 'N/A'}</p>
                                              </div>
                                          </div>
                                          <Badge variant={doc.status === 'Verified' ? 'default' : 'secondary'}>{doc.status}</Badge>
                                      </div>
                                  ))}
                                  {documents.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No documents uploaded.</p>}
                              </div>
                          </CardContent>
                      </Card>
                  </TabsContent>

                  <TabsContent value="maintenance" className="space-y-6">
                      <MaintenanceManager 
                        vehicleId={vehicle.id || vehicle.licensePlate} 
                        logs={maintenanceLogs}
                        maintenanceStatus={maintenanceStatus}
                        catalogTemplates={catalogMaintenanceOptions}
                        onRefresh={handleRefreshMaintenance}
                        vehicleMeta={{
                          licensePlate: vehicle.licensePlate,
                          make: vehicle.make,
                          model: vehicle.model,
                          year: vehicle.year != null ? String(vehicle.year) : undefined,
                        }}
                      />
                  </TabsContent>

                  <TabsContent value="equipment" className="space-y-6">
                      <EquipmentManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>

                  <TabsContent value="exterior" className="space-y-6">
                      <ExteriorManager vehicleId={vehicle.id || vehicle.licensePlate} />
                  </TabsContent>
              </Tabs>
          </TabsContent>
      </Tabs>

      {/* --- Dialogs --- */}
      <Dialog open={alignModalOpen} onOpenChange={setAlignModalOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle2>Align with motor catalog</DialogTitle2>
            <DialogDescription>
              Choose make, model, and year from the catalog, then a chassis code (required). Optionally narrow with
              drivetrain and transmission. We auto-match when only one catalog row fits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Make"
                  value={alignSearchMake}
                  onChange={onAlignMakeChange}
                  options={alignMakeOptions}
                  loading={alignMakesLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint="Could not load makes from catalog"
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Model"
                  value={alignSearchModel}
                  onChange={onAlignModelChange}
                  options={alignModelOptions}
                  loading={alignModelsLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint={alignSearchMake.trim().length >= 2 ? "No models for this make" : "Select a make first"}
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Year"
                  value={alignSearchYear}
                  onChange={onAlignYearChange}
                  options={alignYearOptions}
                  loading={alignYearsLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint={
                    alignSearchMake.trim().length >= 2 && alignSearchModel.trim().length >= 2
                      ? "No years for this make/model"
                      : "Select make and model first"
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <CatalogFacetSelect
                  label="Chassis code"
                  value={alignSearchChassis}
                  onChange={(v) => setAlignSearchChassis(v.toUpperCase())}
                  options={alignMmyFacets.chassis_code}
                  loading={alignMmyLoading}
                  optional={false}
                  allowAny={false}
                  emptyHint="No chassis codes in the catalog for this make/model/year"
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Drivetrain"
                  value={alignSearchDrivetrain}
                  onChange={setAlignSearchDrivetrain}
                  options={alignFacets.drivetrain}
                  loading={alignFacetsLoading}
                />
              </div>
              <div className="space-y-1.5">
                <CatalogFacetSelect
                  label="Transmission"
                  value={alignSearchTransmission}
                  onChange={setAlignSearchTransmission}
                  options={alignFacets.transmission}
                  loading={alignFacetsLoading}
                />
              </div>
            </div>
            {alignSearchChassis.trim() &&
            /^\d{4}$/.test(alignSearchYear.trim()) &&
            alignSearchMake.trim().length >= 2 &&
            alignSearchModel.trim().length >= 2 ? (
              <CatalogVariantPicker
                make={alignSearchMake}
                model={alignSearchModel}
                year={alignSearchYear}
                drivetrain={alignSearchDrivetrain}
                transmission={alignSearchTransmission}
                chassis_code={alignSearchChassis}
                value={alignSelectedRow?.id ?? null}
                onChange={handleAlignPickerChange}
                disabled={alignSaving}
              />
            ) : (
              <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Select make, model, year, and chassis above to search the motor catalog.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAlignModalOpen(false)} disabled={alignSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleAlignSave()}
              disabled={
                alignSaving ||
                !alignSearchMake.trim() ||
                !alignSearchModel.trim() ||
                !/^\d{4}$/.test(alignSearchYear.trim()) ||
                !alignSearchChassis.trim() ||
                !alignSelectedRow ||
                alignPickerSource === 'pending' ||
                alignPickerSource === 'none'
              }
            >
              {alignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {alignPickerSource === 'auto'
                ? 'Confirm match'
                : alignPickerSource === 'manual'
                  ? 'Save selection'
                  : 'Pick a row to save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingCatalogRequestsDrawer
        open={pendingDrawerOpen}
        onOpenChange={setPendingDrawerOpen}
        // We're already on a vehicle detail page; we don't need to navigate
        // away when the operator picks one. Hiding the per-row "Open vehicle"
        // button keeps the drawer purely informational here.
        onOpenVehicle={undefined}
      />

      <Dialog open={isUpdateOdometerOpen} onOpenChange={setIsUpdateOdometerOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle2>Update Odometer</DialogTitle2>
                  <DialogDescription>Record a new odometer reading for this vehicle.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                  <div className="space-y-2">
                      <Label>New Reading (km)</Label>
                      <Input 
                          type="number" 
                          placeholder="e.g. 45050" 
                          value={newOdometerValue}
                          onChange={(e) => setNewOdometerValue(e.target.value)}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Date</Label>
                      <Input 
                          type="date" 
                          value={newOdometerDate}
                          onChange={(e) => setNewOdometerDate(e.target.value)}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label>Notes (Optional)</Label>
                      <Textarea 
                          placeholder="Routine check, service, etc."
                          value={newOdometerNotes}
                          onChange={(e) => setNewOdometerNotes(e.target.value)}
                      />
                  </div>
              </div>
              <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsUpdateOdometerOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpdateOdometer} disabled={isUpdatingOdometer}>
                      {isUpdatingOdometer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update Reading
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
