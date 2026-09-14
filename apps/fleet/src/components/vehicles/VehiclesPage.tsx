import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { Vehicle } from '../../types/vehicle'; // New Type
import { applyDriverAssignmentChange } from '../../utils/vehicleDriverAssignmentHistory';
import { VehicleCard } from './VehicleCard'; // New Component
import { VehicleDetail } from './VehicleDetail'; // New Component
import { DriverAssignmentModal } from './DriverAssignmentModal';
import { FuelLogForm } from '../driver-portal/FuelLogForm';
import { LogMaintenanceServiceDialog } from './LogMaintenanceServiceDialog';
import { AddVehicleModal } from './AddVehicleModal';
import type { CatalogMaintenanceTaskOption, VehicleMaintenanceScheduleRowApi } from '../../types/maintenance';
import { catalogOptionsFromScheduleRows } from '../../utils/maintenanceCatalogOptions';
import { Toaster, toast } from 'sonner';
import { 
  Loader2, 
  Search, 
  Plus,
  LayoutGrid,
  List,
  MoreVertical,
  Settings as SettingsIcon,
  Fuel,
  Wrench,
  AlertTriangle,
  UserPlus,
  FileText,
  Trash2
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { isSameDay, subDays } from "date-fns";
import { useVocab } from '../../utils/vocabulary';
import { usePermissions } from '../../hooks/usePermissions';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { vehicleMatchesLine, personMatchesServiceLine, type VehicleServiceLine } from '../../utils/vehicleServiceLines';
import { VehicleAssignmentSelect } from './VehicleAssignmentSelect';
import type { VehicleCatalogPendingRequest } from '../../types/vehicleCatalogPending';
import { isVehicleParked } from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { useMyPendingCatalogRequests } from '../../hooks/useMyPendingCatalogRequests';
import { PendingCatalogRequestsDrawer } from './PendingCatalogRequestsDrawer';
import { ListChecks } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

export function VehiclesPage({
  onNavigateToExpenseHub,
}: {
  /** Expense Hub deep link — parent switches to Business Finance → Expenses for this vehicle. */
  onNavigateToExpenseHub?: (vehicleId: string) => void;
} = {}) {
  const { v } = useVocab();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { rideshareVisible, rushVisible, serviceLines: orgServiceLines } = useServiceLineScope();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  type VehicleLineTab = 'rideshare' | 'delivery';
  const availableLines = useMemo((): VehicleLineTab[] => {
    const lines: VehicleLineTab[] = [];
    if (rideshareVisible) lines.push('rideshare');
    if (rushVisible) lines.push('delivery');
    return lines.length ? lines : ['rideshare'];
  }, [rideshareVisible, rushVisible]);
  const showLineTabs = availableLines.length > 1;

  const readLineFromUrl = (): VehicleLineTab => {
    try {
      const raw = new URLSearchParams(window.location.search).get('line');
      if (raw === 'delivery' && availableLines.includes('delivery')) return 'delivery';
      if (raw === 'rideshare' && availableLines.includes('rideshare')) return 'rideshare';
    } catch {
      /* ignore */
    }
    return availableLines[0] ?? 'rideshare';
  };
  const [activeLineTab, setActiveLineTab] = useState<VehicleLineTab>(() => readLineFromUrl());

  useEffect(() => {
    if (!availableLines.includes(activeLineTab)) {
      setActiveLineTab(availableLines[0] ?? 'rideshare');
    }
  }, [availableLines, activeLineTab]);

  const activeServiceLine: VehicleServiceLine =
    activeLineTab === 'delivery' ? 'rush_delivery' : 'rideshare';

  const setLineTab = (next: VehicleLineTab) => {
    setActiveLineTab(next);
    try {
      const url = new URL(window.location.href);
      if (showLineTabs) url.searchParams.set('line', next);
      else url.searchParams.delete('line');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  };
  
  // Navigation State
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Assignment State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [vehicleToAssign, setVehicleToAssign] = useState<Vehicle | null>(null);
  const [assigningVehicleId, setAssigningVehicleId] = useState<string | null>(null);

  // Action States
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [serviceCatalog, setServiceCatalog] = useState<CatalogMaintenanceTaskOption[]>([]);
  const [serviceOdo, setServiceOdo] = useState<number | undefined>(undefined);
  const [actionVehicleId, setActionVehicleId] = useState<string | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null); // Delete State

  // Filtering & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list'); // Toggle view (Future proofing)

  // Pending-catalog drawer (read-only queue surface). Triggered from the
  // banner, the filter pill, and the per-card warning.
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);

  // Phase 8: React Query for trips data
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => api.getTrips(),
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 8: React Query for vehicles (meta keeps 20k truncation honesty)
  const {
    data: vehiclesMeta,
    isError: vehiclesLoadError,
    refetch: refetchVehiclesMeta,
  } = useQuery({
    queryKey: ['vehicles', 'withMeta'],
    queryFn: () => api.getVehiclesWithMeta(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const manualVehicles = vehiclesMeta?.vehicles ?? [];
  const vehiclesTruncated = Boolean(vehiclesMeta?.truncated);

  // Phase 8: React Query for vehicle metrics
  const { data: vehicleMetrics = [] } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics(),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 8: React Query for drivers
  const { data: allDrivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers().catch(() => []),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Centralised hook: window-focus refetch + conditional 12s polling while
  // any pending requests exist. See useMyPendingCatalogRequests for details.
  const { data: myCatalogPending } = useMyPendingCatalogRequests();

  const catalogPendingByFleetId = useMemo(() => {
    const m = new Map<string, VehicleCatalogPendingRequest>();
    for (const row of myCatalogPending?.items ?? []) {
      m.set(row.fleet_vehicle_id, row);
    }
    return m;
  }, [myCatalogPending]);

  const loading = tripsLoading;

  // Transform Trips into Rich Vehicle Objects
  const vehicles: Vehicle[] = useMemo(() => {
    // 1. Group trips by Vehicle to calculate metrics
    const tripsByVehicle = new Map<string, Trip[]>();
    trips.forEach(t => {
        if (!t.vehicleId || t.vehicleId === 'unknown') return;
        if (!tripsByVehicle.has(t.vehicleId)) tripsByVehicle.set(t.vehicleId, []);
        tripsByVehicle.get(t.vehicleId)?.push(t);
    });

    // 2. Index Metrics by Vehicle ID / Plate
    const metricsMap = new Map<string, import('../../types/data').VehicleMetrics>();
    vehicleMetrics.forEach(m => {
        if (m.vehicleId) metricsMap.set(m.vehicleId, m);
        if (m.plateNumber) metricsMap.set(m.plateNumber, m);
    });

    return manualVehicles.map(vehicle => {
        const vTrips = tripsByVehicle.get(vehicle.id) || [];
        // Sort trips desc
        vTrips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastTrip = vTrips[0];
        
        // Find matching metric
        let metric = metricsMap.get(vehicle.id);
        if (!metric && vehicle.licensePlate) metric = metricsMap.get(vehicle.licensePlate);

        // Metrics Calculation
        let todayEarnings = 0;
        let totalEarnings = 0;
        let activeMinutesToday = 0;
        const today = new Date();

        vTrips.forEach(t => {
            // For InDrive trips with fee data, use true profit instead of full fare
            const effectiveAmount = (t.platform === 'InDrive' && t.indriveNetIncome != null) ? t.indriveNetIncome : t.amount;
            totalEarnings += effectiveAmount;
            const tDate = new Date(t.date);
            
            if (isSameDay(tDate, today)) {
                todayEarnings += effectiveAmount;
                activeMinutesToday += t.duration || 0;
            }
        });

        // Phase 5: Utilization from CSV (Preferred) or Trip Logs (Fallback)
        let utilizationRate = 0;
        if (metric && metric.onlineHours > 0) {
            utilizationRate = (metric.onTripHours / metric.onlineHours) * 100;
        } else {
            // Fallback: Active minutes today / 24h
            utilizationRate = Math.min((activeMinutesToday / (24 * 60)) * 100, 100);
        }
        
        const isInactive = lastTrip ? new Date(lastTrip.date) < subDays(today, 7) : true;
        // Parked vehicles (no catalog match yet) must NEVER be derived to
        // 'Active' client-side, even if recent trips exist (legacy data).
        const parked = isVehicleParked(vehicle);

        // Assignment SSOT = vehicle.currentDriverId only.
        // Never invent an assignee from last trip — that falsely puts one driver on many cars.
        return {
            ...vehicle,
            status: parked ? 'Inactive' : (isInactive ? 'Inactive' : 'Active'),
            currentDriverId: vehicle.currentDriverId || undefined,
            currentDriverName: vehicle.currentDriverName || undefined,
            metrics: {
                ...vehicle.metrics,
                todayEarnings: todayEarnings || vehicle.metrics?.todayEarnings || 0,
                utilizationRate: utilizationRate || vehicle.metrics?.utilizationRate || 0,
                totalLifetimeEarnings: totalEarnings || vehicle.metrics?.totalLifetimeEarnings || 0,
                // Add extended metrics for details view
                onlineHours: metric?.onlineHours,
                onTripHours: metric?.onTripHours,
                roiScore: metric?.roiScore,
                maintenanceStatus: metric?.maintenanceStatus
            }
        };
    });
  }, [trips, manualVehicles, vehicleMetrics]);

  // Apply Filters
  const filteredVehicles = useMemo(() => {
      return vehicles.filter(vehicle => {
          if (showLineTabs || rushVisible || rideshareVisible) {
            if (!vehicleMatchesLine(vehicle, activeServiceLine)) return false;
          }

          const matchesSearch = 
            vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) || 
            vehicle.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (vehicle.vin || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (vehicle.currentDriverName || '').toLowerCase().includes(searchQuery.toLowerCase());

          const matchesStatus =
            statusFilter === 'all'
              ? true
              : statusFilter === 'pending_catalog'
                ? isVehicleParked(vehicle)
                : vehicle.status.toLowerCase() === statusFilter;
          const matchesService = serviceFilter === 'all' || 
             (serviceFilter === 'attention' && vehicle.serviceStatus !== 'OK') ||
             (serviceFilter === 'ok' && vehicle.serviceStatus === 'OK');

          return matchesSearch && matchesStatus && matchesService;
      });
  }, [
    vehicles,
    searchQuery,
    statusFilter,
    serviceFilter,
    activeServiceLine,
    showLineTabs,
    rushVisible,
    rideshareVisible,
  ]);

  const parkedVehicleCount = useMemo(
    () => vehicles.filter(isVehicleParked).length,
    [vehicles],
  );

  // Find Selected Vehicle
  const selectedVehicle = useMemo(() => 
    vehicles.find(v => v.id === selectedVehicleId), 
  [vehicles, selectedVehicleId]);

  const handleOpenAssignModal = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) {
      setVehicleToAssign(vehicle);
      setIsAssignModalOpen(true);
    }
  };

  const assignableDrivers = useMemo(() => {
    const seen = new Set<string>();
    return allDrivers
      .filter((d: any) => personMatchesServiceLine(d, activeServiceLine))
      .map((d: any) => {
        const id = String(d.id || d.driverId || '').trim();
        const name = String(d.name || d.driverName || '').trim() || 'Unknown';
        return { id, name };
      })
      .filter((d) => {
        if (!d.id || seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allDrivers, activeServiceLine]);

  const personLabel = activeLineTab === 'delivery' ? 'Courier' : 'Driver';

  const handleUnassignDriver = async (vehicleId: string) => {
    const vehicleToUpdate = manualVehicles.find((v) => v.id === vehicleId);
    if (!vehicleToUpdate) return;

    if (isVehicleParked(vehicleToUpdate)) {
      toast.warning('Vehicle is parked', {
        description: 'This vehicle is pending catalog approval and cannot change assignment yet.',
      });
      return;
    }

    if (!vehicleToUpdate.currentDriverId) return;

    setAssigningVehicleId(vehicleId);
    try {
      await api.saveVehicle({
        ...vehicleToUpdate,
        currentDriverId: '',
        currentDriverName: '',
        driverAssignmentHistory: applyDriverAssignmentChange(vehicleToUpdate, null, ''),
      });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(`${personLabel} unassigned`);
    } catch (error) {
      console.error('Failed to unassign driver', error);
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Failed to unassign', {
          description: 'The change could not be saved to the server.',
        });
      }
    } finally {
      setAssigningVehicleId(null);
    }
  };

  const handleAssignDriver = async (vehicleId: string, driverId: string) => {
    // 1. Find driver details
    const driver = allDrivers.find(d => (d.id === driverId) || (d.driverId === driverId));
    const driverName = driver ? (driver.name || driver.driverName) : 'Unknown Driver';

    // Step 2.2: Warn if the passed ID differs from the native Roam ID
    if (driver && driver.id !== driverId) {
      console.warn(`[VehiclesPage] handleAssignDriver: Resolved native Roam ID "${driver.id}" from passed ID "${driverId}" — using native ID for currentDriverId`);
    }

    // Find the vehicle to update
    const vehicleToUpdate = manualVehicles.find(v => v.id === vehicleId);
    if (!vehicleToUpdate) {
        console.error("Vehicle not found for assignment");
        return;
    }

    const resolvedDriverId = driver?.id || driverId;

    // Reactivate to Active only if the vehicle has been catalog-matched.
    // Parked vehicles are blocked server-side; we mirror that here for clarity.
    const parked = isVehicleParked(vehicleToUpdate);
    if (parked) {
      toast.warning("Vehicle is parked", {
        description: "This vehicle is pending catalog approval and cannot be assigned a driver yet.",
      });
      return;
    }

    if (String(vehicleToUpdate.currentDriverId || '') === String(resolvedDriverId)) {
      setIsAssignModalOpen(false);
      return;
    }

    // One driver ↔ one vehicle: release them from any other car before saving.
    const previousVehicles = manualVehicles.filter((v) => {
      if (v.id === vehicleId || !v.currentDriverId) return false;
      const assigned = String(v.currentDriverId);
      return (
        assigned === resolvedDriverId ||
        assigned === driverId ||
        (driver?.driverId != null && assigned === String(driver.driverId))
      );
    });

    const updatedVehicle = {
        ...vehicleToUpdate,
        currentDriverId: resolvedDriverId,
        currentDriverName: driverName,
        status: 'Active' as const, // Reactivate vehicle on assignment
        driverAssignmentHistory: applyDriverAssignmentChange(
          vehicleToUpdate,
          resolvedDriverId,
          driverName,
        ),
    };

    setAssigningVehicleId(vehicleId);
    try {
        for (const other of previousVehicles) {
          await api.saveVehicle({
            ...other,
            currentDriverId: '',
            currentDriverName: '',
            driverAssignmentHistory: applyDriverAssignmentChange(other, null, ''),
          });
        }

        // Persist the new exclusive assignment
        await api.saveVehicle(updatedVehicle);
        
        console.log(`Assigned driver ${resolvedDriverId} (${driverName}) to vehicle ${vehicleId} [passed ID: ${driverId}]`);
        
        // Phase 8: Invalidate cache after vehicle update
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        
        toast.success("Driver assigned successfully", {
            description: previousVehicles.length
              ? `${driverName} moved to this vehicle (released from ${previousVehicles.length} other).`
              : `${driverName} is now assigned to the vehicle.`
        });
        
        setIsAssignModalOpen(false);
    } catch (error) {
        console.error("Failed to save driver assignment", error);
        const handled = showCatalogGateToastIfApplicable(error);
        if (!handled) {
          toast.error("Failed to save assignment", {
              description: "The change could not be saved to the server."
          });
        }
    } finally {
        setAssigningVehicleId(null);
    }
  };

  const handleInlineAssignmentChange = async (vehicleId: string, nextDriverId: string | null) => {
    if (!nextDriverId) {
      await handleUnassignDriver(vehicleId);
      return;
    }
    await handleAssignDriver(vehicleId, nextDriverId);
  };

  const handleLogService = async (id: string) => {
    setActionVehicleId(id);
    try {
      const sch = await api.getMaintenanceSchedule(id);
      const rows = Array.isArray(sch.schedule)
        ? (sch.schedule as VehicleMaintenanceScheduleRowApi[])
        : [];
      setServiceCatalog(catalogOptionsFromScheduleRows(rows));
      const v = vehicles.find((x: Vehicle) => x.id === id);
      const odo = Number((v as { odometer?: number } | undefined)?.odometer);
      setServiceOdo(Number.isFinite(odo) ? odo : undefined);
    } catch {
      setServiceCatalog([]);
      setServiceOdo(undefined);
    }
    setIsServiceModalOpen(true);
  };

  const handleAddFuel = (id: string) => {
    setActionVehicleId(id);
    setIsFuelModalOpen(true);
  };

  const handleSendAlert = (id: string) => {
    toast.success("Alert sent to driver", {
        description: `Notification dispatched for vehicle ${id}`
    });
  };

  const onFuelSubmit = (data: any) => {
      console.log("Fuel Logged", data);
      toast.success("Fuel Log Added", {
        description: "Fuel consumption metrics updated."
      });
      setIsFuelModalOpen(false);
  };

  const confirmDelete = async () => {
    if (!vehicleToDelete) return;
    try {
        await api.deleteVehicle(vehicleToDelete);
        
        // Phase 8: Invalidate cache after vehicle deletion
        queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        
        toast.success("Vehicle deleted successfully");
    } catch (error) {
        console.error("Failed to delete vehicle", error);
        toast.error("Failed to delete vehicle");
    } finally {
        setVehicleToDelete(null);
    }
  };

  const handleVehicleAdded = (vehicle: Vehicle) => {
    // Phase 8: Invalidate cache after vehicle addition
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  const handleVehicleUpdate = (updatedVehicle: Vehicle) => {
    queryClient.setQueryData(['vehicles', 'withMeta'], (prev: unknown) => {
      if (!prev || typeof prev !== 'object' || !('vehicles' in prev)) return prev;
      const meta = prev as { vehicles: Vehicle[]; truncated?: boolean };
      return {
        ...meta,
        vehicles: meta.vehicles.map((v) =>
          v.id === updatedVehicle.id ? { ...v, ...updatedVehicle } : v,
        ),
      };
    });
    queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {selectedVehicle ? (
        <VehicleDetail
            vehicle={selectedVehicle}
            trips={trips}
            onBack={() => setSelectedVehicleId(null)}
            onAssignDriver={() => handleOpenAssignModal(selectedVehicle.id)}
            onUpdate={handleVehicleUpdate}
            onNavigateToExpenseHub={onNavigateToExpenseHub}
        />
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          
          {/* --- HEADER --- */}
          <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{v('vehiclesPageTitle')}</h1>
                      <p className="text-slate-500">{v('vehiclesPageSubtitle')}</p>
                  </div>
                  {can('vehicles.create') && (
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsAddModalOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Vehicle
                  </Button>
                  )}
              </div>

              {showLineTabs ? (
                <Tabs
                  value={activeLineTab}
                  onValueChange={(val) => {
                    if (val === 'rideshare' || val === 'delivery') setLineTab(val);
                  }}
                  className="w-full"
                >
                  <TabsList className="h-10 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    {availableLines.includes('rideshare') ? (
                      <TabsTrigger value="rideshare" className="rounded-md px-4">
                        Rideshare
                      </TabsTrigger>
                    ) : null}
                    {availableLines.includes('delivery') ? (
                      <TabsTrigger value="delivery" className="rounded-md px-4">
                        Delivery (Roam Rush)
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </Tabs>
              ) : null}

              {vehiclesLoadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-900 dark:text-red-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>Could not load vehicles — this is not the same as an empty fleet. Retry or check your connection.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-9 shrink-0 border-red-300 bg-white hover:bg-red-100 text-red-900"
                    onClick={() => void refetchVehiclesMeta()}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {vehiclesTruncated && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                  Showing the first 20,000 vehicles — contact support if your fleet exceeds this limit.
                </div>
              )}

              {parkedVehicleCount > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex-1 flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <AlertTriangle className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-amber-900">
                          {parkedVehicleCount} {parkedVehicleCount === 1 ? 'vehicle is' : 'vehicles are'} pending catalog approval
                        </div>
                        <p className="mt-1 text-sm text-amber-900/90">
                          These vehicles are parked until a platform admin approves the motor type.
                          They can't be assigned, fueled, or driven in the meantime.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Can't assign driver
                          </span>
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Can't log fuel
                          </span>
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                            Can't record trips
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2 sm:shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 bg-white hover:bg-amber-100 text-amber-900"
                        onClick={() => setPendingDrawerOpen(true)}
                      >
                        <ListChecks className="h-4 w-4 mr-2" />
                        View pending requests
                      </Button>
                      <Button
                        size="sm"
                        className="bg-amber-700 text-white hover:bg-amber-800"
                        onClick={() => setStatusFilter('pending_catalog')}
                      >
                        Review parked
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
                  
                  {/* Filters (Left) */}
                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                      <div className="relative w-full md:w-[300px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder={
                              activeLineTab === 'delivery'
                                ? 'Search Plate, VIN, or Courier...'
                                : 'Search Plate, VIN, or Driver...'
                            } 
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                      </div>
                      
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="pending_catalog">Pending catalog ({parkedVehicleCount})</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={serviceFilter} onValueChange={setServiceFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Service" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Health</SelectItem>
                          <SelectItem value="ok">Healthy</SelectItem>
                          <SelectItem value="attention">Needs Attention</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>

                  {/* View Toggle (Right) */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
                      <Button 
                        variant={viewMode === 'grid' ? 'white' : 'ghost'} 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setViewMode('grid')}
                      >
                          <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant={viewMode === 'list' ? 'white' : 'ghost'} 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setViewMode('list')}
                      >
                          <List className="h-4 w-4" />
                      </Button>
                  </div>
              </div>
          </div>

          {/* When the operator drilled into the pending-catalog view, give them
              a one-click way to open the read-only requests drawer right above
              the table. We only render when there is something to show so the
              layout never jumps. */}
          {statusFilter === 'pending_catalog' && parkedVehicleCount > 0 && (
            <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
              <span>
                Showing {parkedVehicleCount} vehicle{parkedVehicleCount === 1 ? '' : 's'} pending catalog approval.
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-amber-900 hover:bg-amber-100"
                onClick={() => setPendingDrawerOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-1.5" />
                View requests
              </Button>
            </div>
          )}

          {/* --- CONTENT --- */}
          {filteredVehicles.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredVehicles.map(vehicle => (
                        <VehicleCard 
                            key={vehicle.id} 
                            vehicle={vehicle}
                            catalogPending={catalogPendingByFleetId.get(vehicle.id) ?? null}
                            onViewAnalytics={(id) => setSelectedVehicleId(id)}
                            onAssignDriver={(id) => handleOpenAssignModal(id)}
                            onLogService={handleLogService}
                            onAddFuel={handleAddFuel}
                            onSendAlert={handleSendAlert}
                        />
                    ))}
                </div>
              ) : (
                <>
                {/* Mobile list cards */}
                <div className="space-y-3 md:hidden">
                  {filteredVehicles.map((vehicle) => {
                    const parked = isVehicleParked(vehicle);
                    const cp = catalogPendingByFleetId.get(vehicle.id);
                    return (
                      <div
                        key={vehicle.id}
                        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedVehicleId(vehicle.id)}
                          aria-label={`Open ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                <img src={vehicle.image} alt="" className="h-full w-full object-cover" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                                  {vehicle.year} {vehicle.make} {vehicle.model}
                                </p>
                                <p className="font-mono text-xs text-slate-500">{vehicle.licensePlate}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <div className={`h-2.5 w-2.5 rounded-full ${vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                              <span className="text-sm text-slate-700 dark:text-slate-300">{vehicle.status}</span>
                            </div>
                          </div>
                          {parked && (
                            <Badge
                              variant="secondary"
                              className={`mt-2 ${
                                cp?.status === 'needs_info'
                                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                                  : 'border-slate-300 bg-slate-100 text-slate-700'
                              }`}
                            >
                              {cp?.status === 'needs_info' ? 'Pending catalog (action needed)' : 'Pending catalog'}
                            </Badge>
                          )}
                        </button>
                        <div className="mt-3 text-sm">
                          <p className="mb-1 text-xs text-slate-500">Assignment</p>
                          <VehicleAssignmentSelect
                            valueDriverId={vehicle.currentDriverId}
                            valueDriverName={vehicle.currentDriverName}
                            drivers={assignableDrivers}
                            disabled={parked}
                            busy={assigningVehicleId === vehicle.id}
                            personLabel={personLabel}
                            className="max-w-none"
                            onChange={(nextId) => void handleInlineAssignmentChange(vehicle.id, nextId)}
                          />
                        </div>
                        <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="min-h-11 min-w-11">
                                <MoreVertical className="h-4 w-4 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setSelectedVehicleId(vehicle.id)}>
                                <FileText className="mr-2 h-4 w-4" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleOpenAssignModal(vehicle.id)}
                                disabled={parked}
                              >
                                <UserPlus className="mr-2 h-4 w-4" /> {activeLineTab === 'delivery' ? 'Assign Courier' : 'Assign Driver'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleLogService(vehicle.id)} disabled={parked}>
                                <Wrench className="mr-2 h-4 w-4" /> Log Service
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAddFuel(vehicle.id)} disabled={parked}>
                                <Fuel className="mr-2 h-4 w-4" /> Log Fuel
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setVehicleToDelete(vehicle.id)}
                                className="text-red-600 focus:bg-red-50 focus:text-red-600"
                                disabled={!can('vehicles.delete')}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Vehicle
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-hidden rounded-md border bg-white shadow-sm md:block">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-[300px] pl-6">Vehicle / ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>License plate</TableHead>
                                <TableHead>Assignment</TableHead>
                                <TableHead className="w-[50px]">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-200">
                                                <SettingsIcon className="h-4 w-4 text-slate-500" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Table Settings</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => toast.info("Column management coming soon")}>
                                                Configure Columns
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => window.location.reload()}>
                                                Refresh Data
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredVehicles.map(vehicle => {
                                const parked = isVehicleParked(vehicle);
                                const cp = catalogPendingByFleetId.get(vehicle.id);
                                return (
                                <TableRow key={vehicle.id} className="hover:bg-slate-50/50">
                                    <TableCell className="pl-6">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-20 relative rounded-md overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                                                <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <span className="font-medium text-slate-900">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                                                  {parked && (
                                                    <Badge
                                                      variant="secondary"
                                                      className={
                                                        cp?.status === 'needs_info'
                                                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                                                          : 'border-slate-300 bg-slate-100 text-slate-700'
                                                      }
                                                      title={
                                                        cp?.status === 'needs_info'
                                                          ? 'Platform admin asked for more info before approving the motor type.'
                                                          : 'This vehicle is parked. A platform admin must approve the motor type before the vehicle can be operated.'
                                                      }
                                                    >
                                                      {cp?.status === 'needs_info' ? 'Pending catalog (action needed)' : 'Pending catalog'}
                                                    </Badge>
                                                  )}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className={`h-2.5 w-2.5 rounded-full ${vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            <span className="text-slate-700">{vehicle.status}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-slate-500">{vehicle.licensePlate}</span>
                                    </TableCell>
                                    <TableCell>
                                        <VehicleAssignmentSelect
                                          valueDriverId={vehicle.currentDriverId}
                                          valueDriverName={vehicle.currentDriverName}
                                          drivers={assignableDrivers}
                                          disabled={parked}
                                          busy={assigningVehicleId === vehicle.id}
                                          personLabel={personLabel}
                                          onChange={(nextId) => void handleInlineAssignmentChange(vehicle.id, nextId)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4 text-slate-400" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => setSelectedVehicleId(vehicle.id)}>
                                                    <FileText className="mr-2 h-4 w-4" /> View Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() => handleOpenAssignModal(vehicle.id)}
                                                  disabled={parked}
                                                  title={parked ? 'Pending catalog approval' : undefined}
                                                >
                                                    <UserPlus className="mr-2 h-4 w-4" /> {activeLineTab === 'delivery' ? 'Assign Courier' : 'Assign Driver'}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                  onClick={() => handleLogService(vehicle.id)}
                                                  disabled={parked}
                                                  title={parked ? 'Pending catalog approval' : undefined}
                                                >
                                                    <Wrench className="mr-2 h-4 w-4" /> Log Service
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() => handleAddFuel(vehicle.id)}
                                                  disabled={parked}
                                                  title={parked ? 'Pending catalog approval' : undefined}
                                                >
                                                    <Fuel className="mr-2 h-4 w-4" /> Log Fuel
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                  onClick={() => handleSendAlert(vehicle.id)}
                                                  disabled={parked}
                                                  title={parked ? 'Pending catalog approval' : undefined}
                                                >
                                                    <AlertTriangle className="mr-2 h-4 w-4" /> Send Alert
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem 
                                                    onClick={() => setVehicleToDelete(vehicle.id)}
                                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                    disabled={!can('vehicles.delete')}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Vehicle
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
                </>
              )
          ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50 rounded-xl border border-dashed">
                 <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                     <Search className="h-6 w-6 text-slate-400" />
                 </div>
                 <p className="text-lg font-medium">No vehicles found</p>
                 <p className="text-sm">Try adjusting your filters or search terms.</p>
              </div>
          )}
        </div>
      )}

      <DriverAssignmentModal 
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        vehicle={vehicleToAssign}
        trips={trips}
        allDrivers={allDrivers}
        serviceLine={activeServiceLine}
        onAssign={handleAssignDriver}
      />

      <FuelLogForm 
        open={isFuelModalOpen} 
        onOpenChange={setIsFuelModalOpen}
        onSubmit={onFuelSubmit}
      />

      {actionVehicleId ? (
        <LogMaintenanceServiceDialog
          open={isServiceModalOpen}
          onOpenChange={setIsServiceModalOpen}
          vehicleId={actionVehicleId}
          catalogTemplates={serviceCatalog}
          defaultOdo={serviceOdo}
          onSaved={() => {
            setIsServiceModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          }}
        />
      ) : null}

      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onVehicleAdded={handleVehicleAdded}
        existingVehicles={manualVehicles}
        defaultServiceLines={[activeServiceLine]}
        orgServiceLines={orgServiceLines.filter(
          (l): l is VehicleServiceLine => l === 'rideshare' || l === 'rush_delivery',
        )}
      />

      <PendingCatalogRequestsDrawer
        open={pendingDrawerOpen}
        onOpenChange={setPendingDrawerOpen}
        onOpenVehicle={(fleetVehicleId) => {
          setSelectedVehicleId(fleetVehicleId);
          setPendingDrawerOpen(false);
        }}
      />

      <AlertDialog open={!!vehicleToDelete} onOpenChange={(open) => !open && setVehicleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vehicle
              and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete Vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Toaster />
    </>
  );
}