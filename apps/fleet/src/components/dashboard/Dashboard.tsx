import React, { useEffect, useMemo, useState } from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import { Car, ChevronFirst, ChevronLeft, ChevronRight, Loader2, Plus, Search, SlidersHorizontal, UserPlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { applyDriverAssignmentChange } from '../../utils/vehicleDriverAssignmentHistory';
import { personMatchesServiceLine } from '../../utils/vehicleServiceLines';
import { isVehicleParked } from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../ui/utils';
import { AddDriverModal } from '../drivers/AddDriverModal';
import { AddVehicleModal } from '../vehicles/AddVehicleModal';
import { WorkforceInvitePanel } from '../workforce/WorkforceInvitePanel';
import { CourierDetailSheet } from '../couriers/CourierDetailSheet';
import type { CourierProfile } from '../couriers/CouriersPage';
import {
  DashboardDriverTable,
  type DashboardDriverRow,
} from './DashboardDriverTable';
import {
  DashboardCourierTable,
  type DashboardCourierRow,
} from './DashboardCourierTable';
import {
  DashboardAssignVehicleDialog,
  type AssignableVehicleOption,
} from './DashboardAssignVehicleDialog';
import { DashboardFilterBar } from './DashboardFilterBar';
import { DashboardMobileFiltersDrawer } from './DashboardMobileFiltersDrawer';
import {
  LogCashQuickActionHost,
  LogCashTrigger,
  type LogCashOpenRequest,
} from './LogCashQuickAction';
import { usePermissions } from '../../hooks/usePermissions';
import {
  DOCUMENT_OPTIONS,
  STATUS_OPTIONS,
  courierRowMatchesSearch,
  deriveCourierDocumentStatus,
  deriveDocumentStatus,
  deriveStatusBucket,
  isAssignedRow,
  rowMatchesSearch,
  type AssignmentFilter,
  type CourierSearchFieldOption,
  type DocumentFilterOption,
  type SearchFieldOption,
  type StatusFilterOption,
} from './dashboardFilters';

type Props = {
  onSelectDriver?: (driverId: string) => void;
  onNavigate?: (page: string, opts?: { weekKey: string }) => void;
};

type DashboardLine = 'rideshare' | 'delivery';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function vehicleLabel(v: {
  year?: string | number;
  make?: string;
  model?: string;
}): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ').trim();
}

function readLineFromUrl(available: DashboardLine[]): DashboardLine {
  try {
    const raw = new URLSearchParams(window.location.search).get('line');
    if (raw === 'delivery' && available.includes('delivery')) return 'delivery';
    if (raw === 'rideshare' && available.includes('rideshare')) return 'rideshare';
  } catch {
    /* ignore */
  }
  return available[0] ?? 'rideshare';
}

function writeLineToUrl(line: DashboardLine) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('line', line);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

function isRushCapable(d: { serviceLines?: string[]; service_lines?: string[] }): boolean {
  return personMatchesServiceLine(d, 'rush_delivery');
}

function normalizeCourierRow(
  row: Record<string, unknown>,
  assignedVehicle?: {
    id?: string;
    year?: string | number;
    make?: string;
    model?: string;
    licensePlate?: string;
    image?: string;
  } | null,
): DashboardCourierRow | null {
  const id = String(row.id ?? '');
  if (!id) return null;
  const status = (typeof row.status === 'string' && row.status) || 'Active';
  const blockers = Array.isArray(row.complianceBlockers)
    ? (row.complianceBlockers as CourierComplianceBlocker[])
    : undefined;
  const vehicleMissing = blockers?.includes('vehicle_missing');
  const fromVehicle = assignedVehicle ? vehicleLabel(assignedVehicle) : '';
  return {
    id,
    name:
      (typeof row.name === 'string' && row.name.trim()) ||
      (typeof row.driverName === 'string' && row.driverName.trim()) ||
      'Unknown Courier',
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : undefined,
    phone: typeof row.phone === 'string' ? row.phone : '—',
    email: typeof row.email === 'string' ? row.email : '',
    status,
    statusBucket: deriveStatusBucket(status),
    documentStatus: deriveCourierDocumentStatus(blockers),
    totalDeliveries: typeof row.totalTrips === 'number' ? row.totalTrips : undefined,
    complianceBlockers: blockers,
    vehicleId: assignedVehicle?.id,
    vehicleLabel: vehicleMissing ? 'Unassigned' : fromVehicle || 'Unassigned',
    licensePlate: assignedVehicle?.licensePlate || '',
    vehicleImage: assignedVehicle?.image || undefined,
  };
}

export function Dashboard({ onSelectDriver, onNavigate }: Props) {
  const queryClient = useQueryClient();
  const { rideshareVisible, rushVisible } = useServiceLineScope();
  const { can } = usePermissions();
  const canLogCash = can('settlements.collect');
  const [logCashPickerOpen, setLogCashPickerOpen] = useState(false);
  const [logCashOpenRequest, setLogCashOpenRequest] = useState<LogCashOpenRequest | null>(null);
  const [logCashGateByDriver, setLogCashGateByDriver] = useState<
    Record<string, { collectable: boolean; reason?: string }>
  >({});

  const requestLogCashForDriver = (driverId: string, driverName: string) => {
    setLogCashOpenRequest({ driverId, driverName, nonce: Date.now() });
  };

  const availableLines = useMemo((): DashboardLine[] => {
    const lines: DashboardLine[] = [];
    if (rideshareVisible) lines.push('rideshare');
    if (rushVisible) lines.push('delivery');
    return lines.length ? lines : ['rideshare'];
  }, [rideshareVisible, rushVisible]);

  const showTabs = availableLines.length > 1;
  const [activeLine, setActiveLine] = useState<DashboardLine>(() =>
    readLineFromUrl(availableLines),
  );

  useEffect(() => {
    if (!availableLines.includes(activeLine)) {
      const next = availableLines[0] ?? 'rideshare';
      setActiveLine(next);
      if (showTabs) writeLineToUrl(next);
    }
  }, [availableLines, activeLine, showTabs]);

  const handleLineChange = (value: string) => {
    const next = value === 'delivery' ? 'delivery' : 'rideshare';
    if (!availableLines.includes(next)) return;
    setActiveLine(next);
    writeLineToUrl(next);
    setPage(1);
  };

  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<CourierProfile | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(null);
  const [statusFilters, setStatusFilters] = useState<StatusFilterOption[]>([...STATUS_OPTIONS]);
  const [documentFilters, setDocumentFilters] = useState<DocumentFilterOption[]>([
    ...DOCUMENT_OPTIONS,
  ]);
  const [searchField, setSearchField] = useState<SearchFieldOption>('Number plate');
  const [searchQuery, setSearchQuery] = useState('');

  const [courierAssignmentFilter, setCourierAssignmentFilter] = useState<AssignmentFilter>(null);
  const [courierStatusFilters, setCourierStatusFilters] = useState<StatusFilterOption[]>([
    ...STATUS_OPTIONS,
  ]);
  const [courierDocumentFilters, setCourierDocumentFilters] = useState<DocumentFilterOption[]>([
    ...DOCUMENT_OPTIONS,
  ]);
  const [courierSearchField, setCourierSearchField] =
    useState<CourierSearchFieldOption>('Name');
  const [courierSearchQuery, setCourierSearchQuery] = useState('');

  const showRideshare = activeLine === 'rideshare' && rideshareVisible;
  const showDelivery = activeLine === 'delivery' && rushVisible;

  const { data: rosterPayload, isLoading: rosterLoading } = useQuery({
    queryKey: ['driversRoster'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: rideshareVisible,
  });

  const { data: driversList = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers', 'service-line-filter'],
    queryFn: async () => {
      const drivers = await api.getDrivers();
      return Array.isArray(drivers) ? drivers : [];
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: rideshareVisible || rushVisible,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: rideshareVisible || rushVisible,
  });

  const vehicleList = useMemo(
    () => (Array.isArray(vehicles) ? vehicles : []),
    [vehicles],
  );

  const byDriverId = useMemo(() => {
    const map = new Map<string, any>();
    for (const v of vehicleList) {
      const driverId = v?.currentDriverId;
      if (driverId && typeof driverId === 'string' && !map.has(driverId)) {
        map.set(driverId, v);
      }
    }
    return map;
  }, [vehicleList]);

  const profileById = useMemo(() => {
    const map = new Map<string, { serviceLines?: string[]; service_lines?: string[] }>();
    for (const d of driversList as Array<{ id?: string; serviceLines?: string[]; service_lines?: string[] }>) {
      if (d?.id) map.set(String(d.id), d);
    }
    return map;
  }, [driversList]);

  const rows: DashboardDriverRow[] = useMemo(() => {
    const roster = rosterPayload?.data ?? [];
    const dual = rideshareVisible && rushVisible;

    return roster
      .filter((driver) => {
        // Courier-only belongs on Delivery — use roster serviceLines (profile enrich is fallback).
        if (!dual) return true;
        const profile = profileById.get(driver.id);
        return personMatchesServiceLine(
          {
            serviceLines:
              (driver as { serviceLines?: string[] }).serviceLines ?? profile?.serviceLines,
            service_lines: profile?.service_lines,
          },
          'rideshare',
        );
      })
      .map((driver) => {
        const assigned = byDriverId.get(driver.id);
        const fromVehicle = assigned ? vehicleLabel(assigned) : '';
        const fromRoster =
          typeof driver.vehicle === 'string' &&
          driver.vehicle.trim() &&
          driver.vehicle.toLowerCase() !== 'unassigned'
            ? driver.vehicle.trim()
            : '';
        const status = driver.status || 'Active';

        return {
          id: driver.id,
          name: driver.name || 'Unknown Driver',
          avatarUrl: driver.avatarUrl,
          phone: driver.phone || '—',
          email: driver.email || '',
          status,
          statusBucket: deriveStatusBucket(status),
          documentStatus: deriveDocumentStatus(driver),
          vehicleId: assigned?.id,
          vehicleLabel: fromVehicle || fromRoster || 'Unassigned',
          licensePlate: assigned?.licensePlate || '',
          vehicleImage: assigned?.image || undefined,
          vin: assigned?.vin || '',
        };
      });
  }, [rosterPayload, byDriverId, rideshareVisible, rushVisible, profileById]);

  const courierRows: DashboardCourierRow[] = useMemo(() => {
    return (driversList as Array<Record<string, unknown>>)
      .filter((d) => isRushCapable(d as { serviceLines?: string[]; service_lines?: string[] }))
      .map((d) => {
        const id = String(d.id ?? '');
        return normalizeCourierRow(d, id ? byDriverId.get(id) : null);
      })
      .filter((c): c is DashboardCourierRow => Boolean(c));
  }, [driversList, byDriverId]);

  const filteredRows = useMemo(() => {
    const allStatuses = statusFilters.length === STATUS_OPTIONS.length;
    const allDocuments = documentFilters.length === DOCUMENT_OPTIONS.length;

    return rows.filter((row) => {
      if (assignmentFilter === 'Assigned' && !isAssignedRow(row)) return false;
      if (assignmentFilter === 'Unassigned' && isAssignedRow(row)) return false;

      if (!allStatuses) {
        if (!row.statusBucket || !statusFilters.includes(row.statusBucket)) return false;
      }

      if (!allDocuments && !documentFilters.includes(row.documentStatus)) {
        return false;
      }

      if (!rowMatchesSearch(row, searchField, searchQuery)) return false;

      return true;
    });
  }, [rows, assignmentFilter, statusFilters, documentFilters, searchField, searchQuery]);

  const filteredCouriers = useMemo(() => {
    const allStatuses = courierStatusFilters.length === STATUS_OPTIONS.length;
    const allDocuments = courierDocumentFilters.length === DOCUMENT_OPTIONS.length;

    return courierRows.filter((row) => {
      if (courierAssignmentFilter === 'Assigned' && !isAssignedRow(row)) return false;
      if (courierAssignmentFilter === 'Unassigned' && isAssignedRow(row)) return false;

      if (!allStatuses) {
        if (!row.statusBucket || !courierStatusFilters.includes(row.statusBucket)) return false;
      }

      if (!allDocuments && !courierDocumentFilters.includes(row.documentStatus)) {
        return false;
      }

      if (!courierRowMatchesSearch(row, courierSearchField, courierSearchQuery)) return false;

      return true;
    });
  }, [
    courierRows,
    courierAssignmentFilter,
    courierStatusFilters,
    courierDocumentFilters,
    courierSearchField,
    courierSearchQuery,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    assignmentFilter,
    statusFilters,
    documentFilters,
    searchField,
    searchQuery,
    courierAssignmentFilter,
    courierStatusFilters,
    courierDocumentFilters,
    courierSearchField,
    courierSearchQuery,
    pageSize,
    activeLine,
  ]);

  const activeListLength = showDelivery ? filteredCouriers.length : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  const paginatedCouriers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCouriers.slice(start, start + pageSize);
  }, [filteredCouriers, safePage, pageSize]);

  const assignDriver = useMemo(
    () => rows.find((r) => r.id === assignDriverId) ?? null,
    [rows, assignDriverId],
  );

  const assignableVehicles: AssignableVehicleOption[] = useMemo(
    () =>
      vehicleList.map((v: any) => ({
        id: v.id,
        label: vehicleLabel(v) || v.licensePlate || v.id,
        licensePlate: v.licensePlate || '',
        image: v.image,
        currentDriverName: v.currentDriverName,
        parked: isVehicleParked(v),
      })),
    [vehicleList],
  );

  const refreshAssignmentCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] }),
      queryClient.invalidateQueries({ queryKey: ['drivers'] }),
    ]);
  };

  const clearVehicleDriver = async (vehicle: any) => {
    const updated = {
      ...vehicle,
      currentDriverId: '',
      currentDriverName: '',
      driverAssignmentHistory: applyDriverAssignmentChange(vehicle, null, ''),
    };
    await api.saveVehicle(updated);
  };

  const handleUnassignVehicle = async (driverId: string) => {
    const vehicle = byDriverId.get(driverId);
    if (!vehicle) {
      toast.info('This driver has no vehicle to unassign.');
      return;
    }

    setBusyDriverId(driverId);
    try {
      await clearVehicleDriver(vehicle);
      await refreshAssignmentCaches();
      toast.success('Vehicle unassigned');
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Could not unassign vehicle');
      }
    } finally {
      setBusyDriverId(null);
    }
  };

  const handleConfirmAssign = async (vehicleId: string) => {
    if (!assignDriverId) return;
    const driver = rows.find((r) => r.id === assignDriverId);
    if (!driver) return;

    const nextVehicle = vehicleList.find((v: any) => v.id === vehicleId);
    if (!nextVehicle) {
      toast.error('Vehicle not found');
      return;
    }
    if (isVehicleParked(nextVehicle)) {
      toast.warning('Vehicle is parked', {
        description: 'Pending catalog approval — cannot assign yet.',
      });
      return;
    }

    setBusyDriverId(assignDriverId);
    try {
      const previous = byDriverId.get(assignDriverId);
      if (previous && previous.id !== vehicleId) {
        await clearVehicleDriver(previous);
      }

      const updated = {
        ...nextVehicle,
        currentDriverId: assignDriverId,
        currentDriverName: driver.name,
        status: 'Active',
        driverAssignmentHistory: applyDriverAssignmentChange(
          nextVehicle,
          assignDriverId,
          driver.name,
        ),
      };
      await api.saveVehicle(updated);
      await refreshAssignmentCaches();
      toast.success('Vehicle assigned', {
        description: `${driver.name} → ${vehicleLabel(nextVehicle) || nextVehicle.licensePlate}`,
      });
      setAssignDriverId(null);
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Could not assign vehicle');
      }
    } finally {
      setBusyDriverId(null);
    }
  };

  const resetFilters = () => {
    setAssignmentFilter(null);
    setStatusFilters([...STATUS_OPTIONS]);
    setDocumentFilters([...DOCUMENT_OPTIONS]);
    setSearchField('Number plate');
    setSearchQuery('');
  };

  const resetCourierFilters = () => {
    setCourierAssignmentFilter(null);
    setCourierStatusFilters([...STATUS_OPTIONS]);
    setCourierDocumentFilters([...DOCUMENT_OPTIONS]);
    setCourierSearchField('Name');
    setCourierSearchQuery('');
  };

  const pagerBtnClass =
    'h-9 rounded-md border-none bg-slate-100 px-3 text-slate-600 shadow-none hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

  const loading =
    ((showRideshare || showDelivery) && vehiclesLoading) ||
    (showRideshare && rosterLoading) ||
    // Delivery list needs getDrivers; rideshare filters from roster.serviceLines.
    (showDelivery && driversLoading);

  if (loading && rows.length === 0 && courierRows.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const headerActions = showDelivery ? (
    <WorkforceInvitePanel
      variant="button"
      serviceLine="rush_delivery"
      inviteButtonLabel="Invite courier"
      dialogTitle="Invite a courier"
      dialogDescription="Invite by the courier’s Roam Tag (in-app Accept/Decline), or generate a shareable code. Roam reviews and approves all couriers before they can go online."
      buttonClassName="h-10 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    />
  ) : (
    <>
      {/* Desktop: Log cash (outline) + matched add pair */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <LogCashTrigger
          variant="desktop"
          visible={canLogCash}
          onClick={() => setLogCashPickerOpen(true)}
        />
        <Button
          type="button"
          className="h-10 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          onClick={() => setIsAddDriverOpen(true)}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add driver
        </Button>
        <Button
          type="button"
          className="h-10 rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          onClick={() => setIsAddVehicleOpen(true)}
        >
          <Car className="mr-2 h-4 w-4" />
          Add vehicle
        </Button>
      </div>

      {/* Mobile: Log cash icon + add menu */}
      <LogCashTrigger
        variant="mobile"
        visible={canLogCash}
        onClick={() => setLogCashPickerOpen(true)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            aria-label="Add to your fleet"
            className="h-10 w-10 shrink-0 rounded-lg bg-slate-900 text-white hover:bg-slate-800 md:hidden dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-1.5">
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            What do you want to add?
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-md px-2 py-2.5"
            onSelect={() => setIsAddDriverOpen(true)}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <UserPlus className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Driver</span>
              <span className="text-xs text-slate-500">Add someone to your rideshare roster</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-3 rounded-md px-2 py-2.5"
            onSelect={() => setIsAddVehicleOpen(true)}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Car className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Vehicle</span>
              <span className="text-xs text-slate-500">Register a car for your fleet</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const mobileSearchPlaceholder =
    activeLine === 'delivery' ? 'Search couriers' : 'Search vehicles';
  const mobileSearchValue = activeLine === 'delivery' ? courierSearchQuery : searchQuery;
  const mobileSearchField = activeLine === 'delivery' ? courierSearchField : searchField;
  const onMobileSearchChange =
    activeLine === 'delivery' ? setCourierSearchQuery : setSearchQuery;
  const mobileFiltersActive =
    activeLine === 'delivery'
      ? courierAssignmentFilter !== null ||
        courierStatusFilters.length !== STATUS_OPTIONS.length ||
        courierDocumentFilters.length !== DOCUMENT_OPTIONS.length
      : assignmentFilter !== null ||
        statusFilters.length !== STATUS_OPTIONS.length ||
        documentFilters.length !== DOCUMENT_OPTIONS.length;

  const rideshareBody = (
    <>
      <DashboardFilterBar
        assignment={assignmentFilter}
        statuses={statusFilters}
        documents={documentFilters}
        searchField={searchField}
        searchQuery={searchQuery}
        onAssignmentChange={setAssignmentFilter}
        onStatusesChange={setStatusFilters}
        onDocumentsChange={setDocumentFilters}
        onSearchFieldChange={setSearchField}
        onSearchQueryChange={setSearchQuery}
        onReset={resetFilters}
      />

      <DashboardDriverTable
        rows={paginatedRows}
        onOpenDriver={onSelectDriver}
        onAssignVehicle={(driverId) => setAssignDriverId(driverId)}
        onUnassignVehicle={handleUnassignVehicle}
        assignmentBusyDriverId={busyDriverId}
        onLogCash={canLogCash ? requestLogCashForDriver : undefined}
        logCashGateByDriver={logCashGateByDriver}
      />
    </>
  );

  const deliveryBody = (
    <>
      <DashboardFilterBar
        variant="delivery"
        assignment={courierAssignmentFilter}
        statuses={courierStatusFilters}
        documents={courierDocumentFilters}
        searchField={courierSearchField}
        searchQuery={courierSearchQuery}
        onAssignmentChange={setCourierAssignmentFilter}
        onStatusesChange={setCourierStatusFilters}
        onDocumentsChange={setCourierDocumentFilters}
        onSearchFieldChange={setCourierSearchField}
        onSearchQueryChange={setCourierSearchQuery}
        onReset={resetCourierFilters}
      />

      <DashboardCourierTable
        rows={paginatedCouriers}
        emptyMessage="No couriers yet. Invite your first courier."
        onOpenCourier={(row) =>
          setSelectedCourier({
            id: row.id,
            name: row.name,
            status: row.status,
            phone: row.phone,
            email: row.email,
            totalDeliveries: row.totalDeliveries,
            complianceBlockers: row.complianceBlockers,
          })
        }
      />
    </>
  );

  return (
    <div className="space-y-6">
      {/* Desktop: title + add actions */}
      <div className="hidden items-center justify-between gap-3 md:flex">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Dashboard
        </h2>
        {headerActions}
      </div>

      {/* Mobile: search + filters icon beside + / invite */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={mobileSearchValue}
            onChange={(e) => onMobileSearchChange(e.target.value)}
            placeholder={mobileSearchPlaceholder}
            className="h-10 rounded-full border-transparent bg-slate-100 pl-9 pr-11 shadow-none focus-visible:border-slate-200 focus-visible:bg-white"
            aria-label={`Search by ${mobileSearchField}`}
          />
          <button
            type="button"
            aria-label="Open filters"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/80"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {mobileFiltersActive ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-slate-900" />
            ) : null}
          </button>
        </div>
        {headerActions}
      </div>

      {activeLine === 'delivery' ? (
        <DashboardMobileFiltersDrawer
          variant="delivery"
          open={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          assignment={courierAssignmentFilter}
          statuses={courierStatusFilters}
          documents={courierDocumentFilters}
          searchField={courierSearchField}
          onAssignmentChange={setCourierAssignmentFilter}
          onStatusesChange={setCourierStatusFilters}
          onDocumentsChange={setCourierDocumentFilters}
          onSearchFieldChange={setCourierSearchField}
          onReset={resetCourierFilters}
        />
      ) : (
        <DashboardMobileFiltersDrawer
          open={mobileFiltersOpen}
          onOpenChange={setMobileFiltersOpen}
          assignment={assignmentFilter}
          statuses={statusFilters}
          documents={documentFilters}
          searchField={searchField}
          onAssignmentChange={setAssignmentFilter}
          onStatusesChange={setStatusFilters}
          onDocumentsChange={setDocumentFilters}
          onSearchFieldChange={setSearchField}
          onReset={resetFilters}
        />
      )}

      {showTabs ? (
        <Tabs value={activeLine} onValueChange={handleLineChange} className="gap-4">
          <TabsList
            className={cn(
              'h-10 rounded-lg bg-slate-100 p-1 dark:bg-slate-800',
              'max-md:grid max-md:w-full',
              availableLines.length >= 2 ? 'max-md:grid-cols-2' : 'max-md:grid-cols-1',
            )}
          >
            {availableLines.includes('rideshare') ? (
              <TabsTrigger value="rideshare" className="rounded-md px-4 max-md:w-full">
                Rideshare
              </TabsTrigger>
            ) : null}
            {availableLines.includes('delivery') ? (
              <TabsTrigger value="delivery" className="rounded-md px-4 max-md:w-full">
                Delivery
              </TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="rideshare" className="space-y-4">
            {rideshareBody}
          </TabsContent>
          <TabsContent value="delivery" className="space-y-4">
            {deliveryBody}
          </TabsContent>
        </Tabs>
      ) : showDelivery ? (
        <div className="space-y-4">{deliveryBody}</div>
      ) : (
        <div className="space-y-4">{rideshareBody}</div>
      )}

      <div
        className={cn(
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
          totalPages <= 1 && 'max-md:hidden',
        )}
      >
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            const next = Number(v) as (typeof PAGE_SIZE_OPTIONS)[number];
            if (PAGE_SIZE_OPTIONS.includes(next)) setPageSize(next);
          }}
        >
          <SelectTrigger className="h-9 w-[110px] rounded-md border-none bg-transparent text-slate-600 shadow-none hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <SelectValue placeholder="10 rows" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={pagerBtnClass}
            disabled={safePage <= 1}
            onClick={() => setPage(1)}
          >
            <ChevronFirst className="mr-1 h-4 w-4" />
            First
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={pagerBtnClass}
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={pagerBtnClass}
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <DashboardAssignVehicleDialog
        open={Boolean(assignDriverId)}
        onOpenChange={(open) => {
          if (!open && !busyDriverId) setAssignDriverId(null);
        }}
        driverName={assignDriver?.name || ''}
        vehicles={assignableVehicles}
        currentVehicleId={assignDriver?.vehicleId}
        busy={Boolean(busyDriverId)}
        onConfirm={handleConfirmAssign}
      />

      <AddDriverModal
        isOpen={isAddDriverOpen}
        onClose={() => setIsAddDriverOpen(false)}
        onDriverAdded={() => {
          setIsAddDriverOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
          void queryClient.invalidateQueries({ queryKey: ['drivers'] });
          toast.success('Driver added');
        }}
      />

      <AddVehicleModal
        isOpen={isAddVehicleOpen}
        onClose={() => setIsAddVehicleOpen(false)}
        existingVehicles={vehicleList}
        onVehicleAdded={() => {
          setIsAddVehicleOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          toast.success('Vehicle added');
        }}
      />

      <CourierDetailSheet
        courier={selectedCourier}
        open={selectedCourier !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCourier(null);
        }}
      />

      {!showDelivery ? (
        <LogCashQuickActionHost
          onNavigate={onNavigate}
          pickerOpen={logCashPickerOpen}
          onPickerOpenChange={setLogCashPickerOpen}
          openRequest={logCashOpenRequest}
          onOpenRequestHandled={() => setLogCashOpenRequest(null)}
          onGateMapChange={setLogCashGateByDriver}
        />
      ) : null}
    </div>
  );
}
