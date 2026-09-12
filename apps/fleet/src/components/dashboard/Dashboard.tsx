import React, { useEffect, useMemo, useState } from 'react';
import { Car, ChevronFirst, ChevronLeft, ChevronRight, Loader2, UserPlus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { applyDriverAssignmentChange } from '../../utils/vehicleDriverAssignmentHistory';
import { isVehicleParked } from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { AddDriverModal } from '../drivers/AddDriverModal';
import { AddVehicleModal } from '../vehicles/AddVehicleModal';
import {
  DashboardDriverTable,
  type DashboardDriverRow,
} from './DashboardDriverTable';
import {
  DashboardAssignVehicleDialog,
  type AssignableVehicleOption,
} from './DashboardAssignVehicleDialog';
import { DashboardFilterBar } from './DashboardFilterBar';
import {
  DOCUMENT_OPTIONS,
  STATUS_OPTIONS,
  deriveDocumentStatus,
  deriveStatusBucket,
  isAssignedRow,
  rowMatchesSearch,
  type AssignmentFilter,
  type DocumentFilterOption,
  type SearchFieldOption,
  type StatusFilterOption,
} from './dashboardFilters';

type Props = {
  onSelectDriver?: (driverId: string) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function vehicleLabel(v: {
  year?: string | number;
  make?: string;
  model?: string;
}): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ').trim();
}

export function Dashboard({ onSelectDriver }: Props) {
  const queryClient = useQueryClient();
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);

  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(null);
  const [statusFilters, setStatusFilters] = useState<StatusFilterOption[]>([
    ...STATUS_OPTIONS,
  ]);
  const [documentFilters, setDocumentFilters] = useState<DocumentFilterOption[]>([
    ...DOCUMENT_OPTIONS,
  ]);
  const [searchField, setSearchField] = useState<SearchFieldOption>('Number plate');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: rosterPayload, isLoading: rosterLoading } = useQuery({
    queryKey: ['driversRoster'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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

  const rows: DashboardDriverRow[] = useMemo(() => {
    const roster = rosterPayload?.data ?? [];

    return roster.map((driver) => {
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
  }, [rosterPayload, byDriverId]);

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

  useEffect(() => {
    setPage(1);
  }, [assignmentFilter, statusFilters, documentFilters, searchField, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

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
    // Empty strings so JSON.stringify keeps the clear (undefined fields get dropped).
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

  const pagerBtnClass =
    'h-9 rounded-md border-none bg-slate-100 px-3 text-slate-600 shadow-none hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

  const loading = rosterLoading || vehiclesLoading;

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Dashboard
        </h2>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>

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
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            const next = Number(v) as (typeof PAGE_SIZE_OPTIONS)[number];
            if (PAGE_SIZE_OPTIONS.includes(next)) setPageSize(next);
          }}
        >
          <SelectTrigger className="h-9 w-[110px] rounded-md border-none bg-transparent shadow-none text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
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
    </div>
  );
}
