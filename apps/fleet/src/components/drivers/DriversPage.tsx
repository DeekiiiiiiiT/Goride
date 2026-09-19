/**
 * ARCHITECTURE:
 * - List = GET /drivers/roster (this page)
 * - Detail ops = driverOperationalMetrics; money = ledger overview / financial periods
 * - Analytics should reuse those helpers (see driverAnalyticsAggregates) — not re-derive rates
 */
import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useVocab } from '../../utils/vocabulary';
import { personMatchesServiceLine } from '../../utils/vehicleServiceLines';
import { formatJMD } from '../../utils/formatJMD';
import { exportToCSV } from '../../utils/csvHelpers';
import { format } from 'date-fns';
import { 
  Loader2, 
  Search, 
  Plus,
  MoreVertical, 
  CheckCircle2, 
  ChevronDown,
  ChevronLeft, 
  ChevronRight,
  Download,
  Eye,
  StickyNote,
  AlertCircle,
  Bookmark,
  BookmarkPlus,
  Trash2,
} from 'lucide-react';
import { applyDriverAssignmentChange } from '../../utils/vehicleDriverAssignmentHistory';
import { isVehicleParked } from '../../utils/vehicleCatalogGate';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';
import {
  DashboardAssignVehicleDialog,
  type AssignableVehicleOption,
} from '../dashboard/DashboardAssignVehicleDialog';
import { Checkbox } from '../ui/checkbox';
import {
  loadDriverSavedViews,
  fetchDriverSavedViews,
  saveDriverSavedView,
  deleteDriverSavedView,
  type DriverSavedView,
} from './driverSavedViews';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
import { requireAuthHeaders } from '../../utils/authHeaders';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Card, CardContent } from "../ui/card";
import { DriverDetail } from './DriverDetail';
import { AddDriverModal } from './AddDriverModal';
import {
  isDriverDetailTab,
  pathForDriverDetail,
  type DriverDetailTab,
} from '../../navigation/pageRegistry';
import {
  loadEarningsPolicyRuntimeContext,
  resolveBundleFromContext,
  type EarningsPolicyRuntimeContext,
} from '../../utils/loadResolvedEarningsBundle';
import { useServiceLineScopeParam } from '../../hooks/useServiceLineScopeParam';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { TierCalculations } from '../../utils/tierCalculations';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../auth/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { CouriersPage } from '../couriers/CouriersPage';

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function driverDisplayName(name: unknown): string {
  if (typeof name === 'string' && name.trim()) return name.trim();
  return 'Unknown Driver';
}

function vehicleAssignmentLabel(v: {
  year?: string | number;
  make?: string;
  model?: string;
  licensePlate?: string;
}): string {
  const ym = [v.year, v.make, v.model].filter(Boolean).join(' ').trim();
  return ym || v.licensePlate || '';
}

function driverInitials(name: unknown): string {
  const label = driverDisplayName(name);
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
  return initials || '??';
}

function normalizeDriverProfile(driver: Partial<DriverProfile> & { id: string }): DriverProfile {
  const statusRaw = String(driver.status ?? 'Active');
  const status: DriverProfile['status'] =
    statusRaw === 'Inactive' || statusRaw.toLowerCase() === 'inactive'
      ? 'Inactive'
      : statusRaw === 'Needs Attention' || statusRaw.toLowerCase().includes('attention')
        ? 'Needs Attention'
        : 'Active';
  return {
    id: driver.id,
    name: driverDisplayName(driver.name),
    avatarUrl: driver.avatarUrl,
    status,
    vehicle: driver.vehicle ?? 'Unassigned',
    phone: driver.phone ?? '—',
    email: driver.email ?? '',
    totalTrips: asNumber(driver.totalTrips),
    totalEarnings: asNumber(driver.totalEarnings),
    todaysEarnings: asNumber(driver.todaysEarnings),
    todaysTrips: asNumber(driver.todaysTrips),
    monthlyEarnings: asNumber(driver.monthlyEarnings),
    acceptanceRate: asNumber(driver.acceptanceRate, 100),
    tier: driver.tier ?? 'Bronze',
    licenseFrontUrl: driver.licenseFrontUrl,
    licenseBackUrl: driver.licenseBackUrl,
    proofOfAddressUrl: driver.proofOfAddressUrl,
    proofOfAddressType: driver.proofOfAddressType,
    uberDriverId: driver.uberDriverId,
    inDriveDriverId: driver.inDriveDriverId,
    createdAt: driver.createdAt,
    licenseExpiry: driver.licenseExpiry,
    licenseNumber: driver.licenseNumber,
    bankInfo: driver.bankInfo,
    organizationId: driver.organizationId,
    dispatchBlocked: Boolean(driver.dispatchBlocked),
    dispatchBlockReason: driver.dispatchBlockReason,
    overdueFollowUpCount: asNumber(driver.overdueFollowUpCount),
  };
}
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Link2 } from 'lucide-react';
import { WorkforceInvitePanel, WorkforcePendingInvitesButton } from '../workforce/WorkforceInvitePanel';
// Interface for our View Model
interface DriverProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'Active' | 'Inactive' | 'Needs Attention';
  vehicle: string;
  phone: string;
  email: string;
  totalTrips: number;
  totalEarnings: number; // Added
  // New metrics for Phase 2
  todaysEarnings: number;
  todaysTrips: number;
  monthlyEarnings: number; // New for correct Tier Calc
  acceptanceRate: number;
  tier: string;
  
  // Document URLs (Optional)
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  proofOfAddressUrl?: string;
  proofOfAddressType?: string;

  // External Platform IDs (For Matching)
  uberDriverId?: string;
  inDriveDriverId?: string;
  createdAt?: string;
  licenseExpiry?: string;
  licenseNumber?: string;
  bankInfo?: unknown;
  organizationId?: string;
  dispatchBlocked?: boolean;
  dispatchBlockReason?: string;
  overdueFollowUpCount?: number;
}

export function DriversPage({
  initialDriverId,
  initialTab,
  onDriverDeepLinkChange,
}: {
  initialDriverId?: string | null;
  initialTab?: DriverDetailTab;
  onDriverDeepLinkChange?: (driverId: string | null, tab?: DriverDetailTab) => void;
}) {
  const { v } = useVocab();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { rideshareVisible, rushVisible } = useServiceLineScope();
  // Phase 5: Get user for organization validation
  const { user } = useAuth();
  const currentOrgId = user?.user_metadata?.organizationId || user?.id;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const showCourierTab = rushVisible;
  const showDriversTab = rideshareVisible;
  const showWorkforceTabs = showCourierTab && showDriversTab;

  type WorkforceTab = 'drivers' | 'couriers';
  const readWorkforceTab = (): WorkforceTab => {
    try {
      const raw = new URLSearchParams(window.location.search).get('workforce');
      if (raw === 'couriers' && showCourierTab) return 'couriers';
      if (raw === 'drivers' && showDriversTab) return 'drivers';
    } catch {
      /* ignore */
    }
    if (!showDriversTab && showCourierTab) return 'couriers';
    return 'drivers';
  };
  const [workforceTab, setWorkforceTab] = useState<WorkforceTab>(() => readWorkforceTab());

  useEffect(() => {
    if (workforceTab === 'couriers' && !showCourierTab) {
      setWorkforceTab(showDriversTab ? 'drivers' : 'couriers');
    } else if (workforceTab === 'drivers' && !showDriversTab && showCourierTab) {
      setWorkforceTab('couriers');
    }
  }, [showCourierTab, showDriversTab, workforceTab]);

  const setWorkforceTabAndUrl = (next: WorkforceTab) => {
    setWorkforceTab(next);
    try {
      const url = new URL(window.location.href);
      if (showWorkforceTabs) {
        url.searchParams.set('workforce', next);
      } else {
        url.searchParams.delete('workforce');
      }
      window.history.replaceState(
        { page: 'drivers' },
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch {
      /* ignore */
    }
  };
  
  // Phase 10: Claim Driver state
  const [isClaimOpen, setIsClaimOpen] = useState(false);
  const [claimEmail, setClaimEmail] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);

  // Navigation State
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(initialDriverId || null);
  const [detailTab, setDetailTab] = useState<DriverDetailTab>(initialTab || 'overview');

  // Sync from App (deep link / popstate / nav back to list)
  useEffect(() => {
    setSelectedDriverId(initialDriverId || null);
  }, [initialDriverId]);

  useEffect(() => {
    if (initialTab && isDriverDetailTab(initialTab)) {
      setDetailTab(initialTab);
    }
  }, [initialTab]);

  const openDriver = (driverId: string, tab: DriverDetailTab = 'overview') => {
    setSelectedDriverId(driverId);
    setDetailTab(tab);
    onDriverDeepLinkChange?.(driverId, tab);
    if (typeof window !== 'undefined') {
      const nextPath = pathForDriverDetail(driverId, tab);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ page: 'drivers', driverId, tab }, '', nextPath);
      }
    }
  };

  const backToList = () => {
    setSelectedDriverId(null);
    setDetailTab('overview');
    onDriverDeepLinkChange?.(null);
    if (typeof window !== 'undefined') {
      if (window.location.pathname !== '/drivers') {
        window.history.pushState({ page: 'drivers' }, '', '/drivers');
      }
    }
  };

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [performanceFilter, setPerformanceFilter] = useState<string>('all');
  const [overdueFollowUpsOnly, setOverdueFollowUpsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: savedViews = [], refetch: refetchSavedViews } = useQuery({
    queryKey: ['driverSavedViews'],
    queryFn: () => fetchDriverSavedViews(),
    initialData: typeof window !== 'undefined' ? loadDriverSavedViews() : [],
    staleTime: 60_000,
  });
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [bulkStatusBusy, setBulkStatusBusy] = useState(false);

  const [driverToRemove, setDriverToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);

  const { serviceLineParam } = useServiceLineScopeParam();
  const earningsServiceLine = serviceLineParam;

  // Primary list source — server-aggregated roster (no client trip sample)
  const { data: rosterPayload, isLoading: rosterLoading, isError: rosterError, error: rosterErr } = useQuery({
    queryKey: ['driversRoster'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const rosterRaw = rosterPayload?.data ?? [];
  const rosterTruncated = Boolean(rosterPayload?.meta?.truncated);

  const loading = rosterLoading;
  // Second wave after roster settles — avoids stacking earnings-policies with
  // the roster call on /drivers mount (ROAM-FLEET-10).
  const [enrichReady, setEnrichReady] = useState(false);
  useEffect(() => {
    if (rosterLoading) {
      setEnrichReady(false);
      return;
    }
    const t = window.setTimeout(() => setEnrichReady(true), 450);
    return () => window.clearTimeout(t);
  }, [rosterLoading]);
  const enrichEnabled = enrichReady;

  // List-tier enrich fights money-tab APIs for HTTP/1.1 slots (ROAM-FLEET-10).
  // Inline gates — Vite HMR TDZ on const bindings (ROAM-FLEET-1Z/1D).
  const onMoneyDeepLink =
    Boolean(selectedDriverId) &&
    (detailTab === 'financial' || detailTab === 'wallet');
  // List enrich only — vehicle-metrics lives in DriverDetail (ops tabs).
  const listEnrichOk = enrichEnabled && !onMoneyDeepLink;

  // Keep getDrivers for mutations / detail profile merge (bankInfo, etc.).
  // Skip while money deep-link is loading so ledger APIs own the HTTP/1.1 slots.
  const { data: manualDrivers = [], isError: driversLoadError, error: driversError } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers(),
    enabled: listEnrichOk,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (rosterError) {
      toast.error(
        rosterErr instanceof Error
          ? `Could not load driver roster: ${rosterErr.message}`
          : 'Could not load driver roster — check login / network.',
      );
    } else if (driversLoadError) {
      toast.error(
        driversError instanceof Error
          ? `Could not load drivers: ${driversError.message}`
          : 'Could not load drivers — check login / network (not deleted).',
      );
    }
  }, [rosterError, rosterErr, driversLoadError, driversError]);

  useEffect(() => {
    if (rosterTruncated) {
      toast.warning(
        'Driver earnings/trip totals may be incomplete (server hit a scan limit). Refresh after periods rebuild, or contact support.',
      );
    }
  }, [rosterTruncated]);

  const { data: importedMetrics = [], isError: metricsEnrichError, error: metricsEnrichErr } = useQuery({
    queryKey: ['driverMetrics'],
    queryFn: () => api.getDriverMetrics(),
    enabled: listEnrichOk,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: vehiclesRaw = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const vehicleList = useMemo(
    () => (Array.isArray(vehiclesRaw) ? vehiclesRaw : []),
    [vehiclesRaw],
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
  const assignableVehicles: AssignableVehicleOption[] = useMemo(
    () =>
      vehicleList.map((v: any) => ({
        id: v.id,
        label: vehicleAssignmentLabel(v) || v.licensePlate || v.id,
        licensePlate: v.licensePlate || '',
        image: v.image,
        currentDriverName: v.currentDriverName,
        parked: isVehicleParked(v),
      })),
    [vehicleList],
  );

  useEffect(() => {
    if (!metricsEnrichError) return;
    toast.error(
      metricsEnrichErr instanceof Error
        ? `Could not load driver metrics: ${metricsEnrichErr.message}`
        : 'Could not load driver metrics — list enrichment may be incomplete.',
    );
  }, [metricsEnrichError, metricsEnrichErr]);
  const { data: earningsPolicyCtx } = useQuery({
    queryKey: ['earningsPolicyRuntimeContext'],
    queryFn: () => loadEarningsPolicyRuntimeContext(),
    enabled: listEnrichOk,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const safeManualDrivers = asArray<DriverProfile>(manualDrivers);
  const safeImportedMetrics = asArray<import('../../types/data').DriverMetrics>(importedMetrics);
  const safeRoster = asArray<DriverProfile>(rosterRaw);

  // Detach membership (auth + KV + driver_profiles + vehicle) without deleting the account
  const handleRemoveFromFleet = async () => {
    if (!driverToRemove) return;
    setIsRemoving(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.fleetCore}/team/drivers/${driverToRemove}/remove`, {
        method: 'POST',
        headers: await requireAuthHeaders(null),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to remove driver');

      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
      toast.success('Driver removed from your fleet');
      setDriverToRemove(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove driver');
    } finally {
      setIsRemoving(false);
    }
  };

  // Roster is primary list source; merge profile extras from getDrivers + CSV acceptance overlay
  const drivers: DriverProfile[] = useMemo(() => {
    const profileById = new Map<string, DriverProfile>();
    for (const d of safeManualDrivers) {
      if (d?.id) profileById.set(d.id, d);
    }

    const metricsMap = new Map<string, import('../../types/data').DriverMetrics>();
    for (const m of safeImportedMetrics) {
      if (m?.driverId) metricsMap.set(m.driverId, m);
    }

    return safeRoster
      .filter((row) => {
        // Courier-only (rush_delivery, no rideshare) belongs on Couriers tab, not Drivers.
        if (!rushVisible) return true;
        const profile = profileById.get(row.id) as { serviceLines?: string[] } | undefined;
        // Roster carries serviceLines; profile enrich is delayed — prefer whichever is present.
        return personMatchesServiceLine(
          {
            serviceLines: profile?.serviceLines ?? (row as { serviceLines?: string[] }).serviceLines,
          },
          'rideshare',
        );
      })
      .map((row) => {
        const profile = profileById.get(row.id);
        let acceptanceRate = asNumber(row.acceptanceRate, 100);
        let metric = metricsMap.get(row.id);
        if (!metric && row.uberDriverId) metric = metricsMap.get(row.uberDriverId);
        if (!metric && row.inDriveDriverId) metric = metricsMap.get(row.inDriveDriverId);
        if (metric?.acceptanceRate != null) {
          acceptanceRate = Math.round(Number(metric.acceptanceRate) <= 1
            ? Number(metric.acceptanceRate) * 100
            : Number(metric.acceptanceRate));
        }

        const monthlyEarnings = asNumber(row.monthlyEarnings);
        let tier = row.tier || profile?.tier || 'Bronze';
        if (earningsPolicyCtx) {
          const serviceLineForBundle =
            earningsServiceLine === 'rideshare' || earningsServiceLine === 'rush_delivery'
              ? earningsServiceLine
              : undefined;
          const bundle = resolveBundleFromContext(
            earningsPolicyCtx as EarningsPolicyRuntimeContext,
            row.id,
            undefined,
            serviceLineForBundle,
          );
          const t = TierCalculations.getTierForEarnings(monthlyEarnings, bundle.tiers);
          tier = t?.name ?? 'Bronze';
        } else if (metric?.tier) {
          tier = metric.tier;
        }

        let status = (row.status as DriverProfile['status']) || 'Active';
        if (status === 'Active' && acceptanceRate < 70) status = 'Needs Attention';

        return normalizeDriverProfile({
          ...profile,
          ...row,
          name: driverDisplayName(row.name || profile?.name),
          status,
          vehicle: row.vehicle || profile?.vehicle || 'Unassigned',
          phone: row.phone || profile?.phone || '—',
          email: row.email || profile?.email || '',
          totalTrips: asNumber(row.totalTrips),
          totalEarnings: asNumber(row.totalEarnings),
          todaysEarnings: asNumber(row.todaysEarnings),
          todaysTrips: asNumber(row.todaysTrips),
          monthlyEarnings,
          acceptanceRate,
          tier,
          bankInfo: (row as any).bankInfo ?? (profile as any)?.bankInfo,
          createdAt: (row as any).createdAt ?? (profile as any)?.createdAt,
          licenseExpiry: (row as any).licenseExpiry ?? (profile as any)?.licenseExpiry,
          licenseNumber: (row as any).licenseNumber ?? (profile as any)?.licenseNumber,
          dispatchBlocked: Boolean((row as any).dispatchBlocked),
          dispatchBlockReason: (row as any).dispatchBlockReason,
          overdueFollowUpCount: asNumber((row as any).overdueFollowUpCount),
        });
      });
  }, [safeRoster, safeManualDrivers, safeImportedMetrics, earningsPolicyCtx, earningsServiceLine, rushVisible]);

  // Phase 5: Apply org validation first, then other filters
  const orgValidatedDrivers = useMemo(() => {
    if (!currentOrgId) return drivers; // No org context - show all (legacy support)
    
    return drivers.filter(driver => {
      // Allow drivers with matching organizationId or no organizationId (legacy data)
      const driverOrgId = (driver as any).organizationId;
      if (!driverOrgId) return true; // Legacy driver without org - include for now
      return driverOrgId === currentOrgId;
    });
  }, [drivers, currentOrgId]);

  // Apply Filters
  const filteredDrivers = useMemo(() => {
      return orgValidatedDrivers.filter(driver => {
          const q = searchQuery.toLowerCase();
          const matchesSearch = 
            (driver.name ?? '').toLowerCase().includes(q) || 
            (driver.id ?? '').toLowerCase().includes(q) ||
            (driver.email ?? '').toLowerCase().includes(q);
          
          const matchesStatus = statusFilter === 'all' || (driver.status ?? '').toLowerCase() === statusFilter.toLowerCase();
          const matchesTier = tierFilter === 'all' || (driver.tier ?? 'Bronze').toLowerCase() === tierFilter.toLowerCase();
          
          let matchesPerformance = true;
          if (performanceFilter === 'high') {
             matchesPerformance = driver.acceptanceRate >= 90 && (driver.tier === 'Gold' || driver.tier === 'Platinum');
          } else if (performanceFilter === 'risk') {
             matchesPerformance = driver.acceptanceRate < 80;
          }

          const matchesOverdue =
            !overdueFollowUpsOnly || asNumber(driver.overdueFollowUpCount) > 0;

          return matchesSearch && matchesStatus && matchesTier && matchesPerformance && matchesOverdue;
      });
  }, [orgValidatedDrivers, searchQuery, statusFilter, tierFilter, performanceFilter, overdueFollowUpsOnly]);

  const overdueFollowUpDriverCount = useMemo(
    () => orgValidatedDrivers.filter((d) => asNumber(d.overdueFollowUpCount) > 0).length,
    [orgValidatedDrivers],
  );

  // Export Function — Papa CSV via exportToCSV; gated for export / view roles
  // Formula-injection guard: prefix cells that Excel/Sheets would treat as formulas.
  // Formula-injection guard: neutralize cells Excel/Sheets would treat as formulas.
  const csvSafe = (val: unknown): string => {
    const s = String(val ?? '');
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
  };

  const handleExport = () => {
    if (!can('transactions.export') && !can('drivers.view')) {
      return;
    }
    exportDriverRows(filteredDrivers, 'drivers_export.csv');
  };

  const exportDriverRows = (driversToExport: DriverProfile[], filename: string) => {
    const rows = driversToExport.map((d) => ({
      ID: csvSafe(d.id),
      Name: csvSafe(d.name),
      Status: csvSafe(d.status),
      Vehicle: csvSafe(d.vehicle),
      Phone: csvSafe(d.phone),
      Email: csvSafe(d.email),
      'Total Trips': csvSafe(d.totalTrips),
      'Total Earnings': csvSafe(Number(d.totalEarnings || 0).toFixed(2)),
      'Acceptance Rate': csvSafe(`${d.acceptanceRate}%`),
      Tier: csvSafe(d.tier),
      'License Number': csvSafe(d.licenseNumber || ''),
      'License Expiry': csvSafe(d.licenseExpiry || ''),
      'Member Since': csvSafe(d.createdAt || ''),
    }));
    exportToCSV(rows, filename);
  };

  const handleExportSelected = () => {
    if (!can('transactions.export') && !can('drivers.view')) return;
    const selected = filteredDrivers.filter((d) => selectedIds.has(d.id));
    if (!selected.length) {
      toast.error('Select at least one driver');
      return;
    }
    exportDriverRows(selected, 'drivers_selected_export.csv');
    toast.success(`Exported ${selected.length} driver${selected.length === 1 ? '' : 's'}`);
  };

  const handleBulkStatusChange = async (nextStatus: 'Active' | 'Inactive') => {
    if (!can('drivers.edit')) {
      toast.error('You do not have permission to change driver status');
      return;
    }
    const selected = filteredDrivers.filter((d) => selectedIds.has(d.id));
    if (!selected.length) return;
    setBulkStatusBusy(true);
    try {
      let ok = 0;
      for (const d of selected) {
        await api.saveDriver({ ...d, status: nextStatus });
        ok += 1;
      }
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
      setSelectedIds(new Set());
      toast.success(`Updated ${ok} driver${ok === 1 ? '' : 's'} to ${nextStatus}`);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk status update failed');
    } finally {
      setBulkStatusBusy(false);
    }
  };

  const applySavedView = (view: DriverSavedView) => {
    setStatusFilter(view.filters.status || 'all');
    setPerformanceFilter(view.filters.atRiskOnly ? 'risk' : 'all');
    setOverdueFollowUpsOnly(Boolean(view.filters.overdueFollowUpsOnly));
    setTierFilter('all');
    setCurrentPage(1);
    setSelectedIds(new Set());
    toast.success(`Applied view “${view.name}”`);
  };

  const handleSaveCurrentView = async () => {
    const name = saveViewName.trim();
    if (!name) {
      toast.error('Enter a name for this view');
      return;
    }
    const view: DriverSavedView = {
      id: `view_${Date.now()}`,
      name,
      filters: {
        status: statusFilter === 'all' ? undefined : statusFilter,
        atRiskOnly: performanceFilter === 'risk',
        overdueFollowUpsOnly: overdueFollowUpsOnly || undefined,
      },
    };
    await saveDriverSavedView(view);
    await refetchSavedViews();
    setSaveViewName('');
    setSaveViewOpen(false);
    toast.success(`Saved view “${name}”`);
  };

  const handleDeleteSavedView = async (id: string) => {
    await deleteDriverSavedView(id);
    await refetchSavedViews();
  };

  // Clear selection when filters change page contents
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, statusFilter, tierFilter, performanceFilter, overdueFollowUpsOnly, currentPage]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredDrivers.length / rowsPerPage);
  const paginatedDrivers = filteredDrivers.slice(
      (currentPage - 1) * rowsPerPage, 
      currentPage * rowsPerPage
  );

  const pageIds = paginatedDrivers.map((d) => d.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of pageIds) next.add(id);
      } else {
        for (const id of pageIds) next.delete(id);
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const assignDriver = useMemo(
    () => drivers.find((d) => d.id === assignDriverId) ?? null,
    [drivers, assignDriverId],
  );

  const refreshAssignmentCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] }),
      queryClient.invalidateQueries({ queryKey: ['drivers'] }),
    ]);
  };

  const clearVehicleDriver = async (vehicle: any) => {
    await api.saveVehicle({
      ...vehicle,
      currentDriverId: '',
      currentDriverName: '',
      custodyStatus: 'none',
      handedOverAt: undefined,
      handedOverBy: undefined,
      custodyConfirmedAt: undefined,
      custodyConfirmedBy: undefined,
      driverAssignmentHistory: applyDriverAssignmentChange(vehicle, null, ''),
    });
  };

  const handleUnassignVehicle = async (driverId: string) => {
    const vehicle = byDriverId.get(driverId);
    if (!vehicle) {
      toast.info('This driver has no vehicle to unassign.');
      return;
    }
    const custody = vehicle.custodyStatus;
    if (custody === 'handed_over' || custody === 'in_custody') {
      const ok = window.confirm(
        custody === 'in_custody'
          ? 'This vehicle is in the driver’s custody. Unassigning clears custody and they must go through hand-over again. Continue?'
          : 'This vehicle was marked handed over. Unassigning clears custody. Continue?',
      );
      if (!ok) return;
    }
    setBusyDriverId(driverId);
    try {
      await clearVehicleDriver(vehicle);
      await refreshAssignmentCaches();
      toast.success('Vehicle unassigned');
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) toast.error('Could not unassign vehicle');
    } finally {
      setBusyDriverId(null);
    }
  };

  const handleConfirmAssign = async (vehicleId: string) => {
    if (!assignDriverId) return;
    const driver = drivers.find((d) => d.id === assignDriverId);
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

      await api.saveVehicle({
        ...nextVehicle,
        currentDriverId: assignDriverId,
        currentDriverName: driver.name,
        custodyStatus: 'assigned',
        handedOverAt: undefined,
        handedOverBy: undefined,
        custodyConfirmedAt: undefined,
        custodyConfirmedBy: undefined,
        status: 'Active',
        driverAssignmentHistory: applyDriverAssignmentChange(
          nextVehicle,
          assignDriverId,
          driver.name,
        ),
      });
      await refreshAssignmentCaches();
      toast.success('Vehicle assigned', {
        description: `${driver.name} → ${vehicleAssignmentLabel(nextVehicle) || nextVehicle.licensePlate}`,
      });
      setAssignDriverId(null);
    } catch (error) {
      const handled = showCatalogGateToastIfApplicable(error);
      if (!handled) {
        toast.error('Could not assign vehicle', {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    } finally {
      setBusyDriverId(null);
    }
  };

  const handleNextPage = () => {
      if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const handleDriverAdded = (driver: any) => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
    queryClient.invalidateQueries({ queryKey: ['couriers'] });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // If a driver is selected, show the detail view (detail fetches its own trips)
  if (selectedDriverId) {
    const selectedDriver = drivers.find(d => 
        d.id === selectedDriverId || 
        d.uberDriverId === selectedDriverId || 
        d.inDriveDriverId === selectedDriverId
    ) || safeManualDrivers.find(d =>
        d.id === selectedDriverId ||
        d.uberDriverId === selectedDriverId ||
        d.inDriveDriverId === selectedDriverId
    );
    
    const driverMetrics = safeImportedMetrics.filter(m => 
        m.driverId === selectedDriver?.id || 
        (selectedDriver?.uberDriverId && m.driverId === selectedDriver.uberDriverId) ||
        (selectedDriver?.inDriveDriverId && m.driverId === selectedDriver.inDriveDriverId)
    );

    return (
      <DriverDetail 
        driverId={selectedDriverId} 
        driverName={selectedDriver?.name || 'Unknown'} 
        driver={selectedDriver}
        trips={[]}
        metrics={driverMetrics}
        initialTab={detailTab}
        onTabChange={(tab) => {
          setDetailTab(tab);
          onDriverDeepLinkChange?.(selectedDriverId, tab);
          if (typeof window !== 'undefined' && selectedDriverId) {
            const nextPath = pathForDriverDetail(selectedDriverId, tab);
            const search = window.location.search;
            const next = `${nextPath}${search}`;
            if (`${window.location.pathname}${window.location.search}` !== next) {
              window.history.pushState(
                { page: 'drivers', driverId: selectedDriverId, tab },
                '',
                next,
              );
            }
          }
        }}
        onBack={backToList}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* --- HEADER --- */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
           <div className="hidden md:block">
               <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                 {v('driversPageTitle')}
               </h2>
               <p className="text-slate-500 dark:text-slate-400">
                 {workforceTab === 'couriers'
                   ? 'Manage fleet couriers for Roam Rush delivery.'
                   : v('driversPageSubtitle')}
               </p>
           </div>
           {workforceTab === 'couriers' ? (
             <WorkforceInvitePanel
               variant="button"
               serviceLine="rush_delivery"
               inviteButtonLabel="Invite courier"
               dialogTitle="Invite a courier"
               dialogDescription="Invite by the courier’s Roam Tag (in-app Accept/Decline), or generate a shareable code. Roam reviews and approves all couriers before they can go online."
             />
           ) : can('drivers.create') ? (
           <div className="flex items-center gap-2">
             <WorkforceInvitePanel
               variant="button"
               serviceLine="rideshare"
               inviteButtonLabel="Invite driver"
               dialogTitle="Invite a driver"
               dialogDescription="Generate a code for your driver to enter in the Roam Driver app during onboarding."
             />
             <Button variant="outline" onClick={() => setIsClaimOpen(true)}>
               <Link2 className="h-4 w-4 mr-2" />
               Claim Driver
             </Button>
             <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsAddModalOpen(true)}>
               <Plus className="h-4 w-4 mr-2" />
               Add Driver
             </Button>
           </div>
           ) : null}
        </div>

        {showWorkforceTabs ? (
          <Tabs
            value={workforceTab}
            onValueChange={(v) => setWorkforceTabAndUrl(v === 'couriers' ? 'couriers' : 'drivers')}
            className="gap-4"
          >
            <TabsList className="h-10 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <TabsTrigger value="drivers" className="rounded-md px-4">
                Drivers
              </TabsTrigger>
              <TabsTrigger value="couriers" className="rounded-md px-4">
                Couriers
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>

      {workforceTab === 'couriers' ? (
        <CouriersPage embedded />
      ) : (
      <>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* Filters (Left) */}
            <div className="flex flex-wrap items-center gap-2">
                <Button 
                  variant={statusFilter === 'all' ? "default" : "outline"} 
                  className="rounded-full px-4"
                  onClick={() => setStatusFilter('all')}
                >
                    All
                </Button>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[110px] rounded-full border-dashed">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="needs attention">Needs Attention</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-[110px] rounded-full border-dashed">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tier</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="bronze">Bronze</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={performanceFilter} onValueChange={setPerformanceFilter}>
                  <SelectTrigger className="w-[140px] rounded-full border-dashed">
                    <SelectValue placeholder="Performance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Performance</SelectItem>
                    <SelectItem value="high">High Performers</SelectItem>
                    <SelectItem value="risk">At Risk</SelectItem>
                  </SelectContent>
                </Select>

                <WorkforcePendingInvitesButton serviceLine="rideshare" />

                {overdueFollowUpDriverCount > 0 && (
                  <Button
                    variant={overdueFollowUpsOnly ? 'default' : 'outline'}
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setOverdueFollowUpsOnly((v) => !v);
                      setCurrentPage(1);
                    }}
                    aria-pressed={overdueFollowUpsOnly}
                  >
                    <StickyNote className="h-4 w-4 mr-1.5" />
                    Overdue notes ({overdueFollowUpDriverCount})
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full">
                      <Bookmark className="h-4 w-4 mr-2" />
                      Views
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                    {savedViews.length === 0 ? (
                      <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
                    ) : (
                      savedViews.map((view) => (
                        <DropdownMenuItem
                          key={view.id}
                          className="flex items-center justify-between gap-2"
                          onSelect={(e) => {
                            e.preventDefault();
                            applySavedView(view);
                          }}
                        >
                          <span className="truncate">{view.name}</span>
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-rose-600"
                            aria-label={`Delete ${view.name}`}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSavedView(view.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setSaveViewOpen(true);
                      }}
                    >
                      <BookmarkPlus className="h-4 w-4 mr-2" />
                      Save current filters…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {(can('transactions.export') || can('drivers.view')) && (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-auto md:ml-2 rounded-full"
                    onClick={handleExport}
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>
                )}
            </div>

            {/* Search (Right) */}
            <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search Drivers" 
                  className="pl-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>

      {/* --- BULK ACTIONS --- */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 dark:border-indigo-800 dark:bg-indigo-950/40">
          <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
            {selectedIds.size} selected
          </span>
          {(can('transactions.export') || can('drivers.view')) && (
            <Button variant="outline" size="sm" onClick={handleExportSelected}>
              <Download className="h-4 w-4 mr-1.5" />
              Export selected
            </Button>
          )}
          {can('drivers.edit') && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkStatusBusy}
                onClick={() => handleBulkStatusChange('Active')}
              >
                {bulkStatusBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Set Active
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkStatusBusy}
                onClick={() => handleBulkStatusChange('Inactive')}
              >
                Set Inactive
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-slate-600"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* --- TABLE --- */}
      <Card className="hidden border-none shadow-sm ring-1 ring-slate-200 md:block dark:ring-slate-700">
          <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow>
                        <TableHead className="w-[48px] pl-4">
                          <Checkbox
                            checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                            onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                            aria-label="Select all drivers on this page"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableHead>
                        <TableHead className="w-[250px] font-semibold text-slate-700 dark:text-slate-300">Driver</TableHead>
                        <TableHead className="w-[100px] font-semibold text-slate-700 dark:text-slate-300">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Tier</TableHead>
                        <TableHead className="min-w-[180px] font-semibold text-slate-700 dark:text-slate-300">Vehicle</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedDrivers.length > 0 ? (
                        paginatedDrivers.map((driver) => (
                            <TableRow
                              key={driver.id}
                              className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer"
                              role="button"
                              tabIndex={0}
                              aria-label={`Open driver ${driver.name}`}
                              onClick={() => openDriver(driver.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openDriver(driver.id);
                                }
                              }}
                            >
                                <TableCell
                                  className="pl-4"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Checkbox
                                    checked={selectedIds.has(driver.id)}
                                    onCheckedChange={(v) => toggleSelectOne(driver.id, v === true)}
                                    aria-label={`Select ${driver.name}`}
                                  />
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-700">
                                            <AvatarImage src={driver.avatarUrl} />
                                            <AvatarFallback className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">
                                                {driverInitials(driver.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">{driver.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px] font-mono">
                                                {driver.phone}
                                            </p>
                                            {(driver.licenseNumber || driver.licenseExpiry || driver.createdAt) && (
                                              <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                                                {driver.licenseNumber ? `#${driver.licenseNumber}` : ''}
                                                {driver.licenseNumber && driver.licenseExpiry ? ' · ' : ''}
                                                {driver.licenseExpiry
                                                  ? `Exp ${String(driver.licenseExpiry).slice(0, 10)}`
                                                  : ''}
                                                {(driver.licenseNumber || driver.licenseExpiry) && driver.createdAt
                                                  ? ' · '
                                                  : ''}
                                                {driver.createdAt
                                                  ? `Since ${(() => {
                                                      try {
                                                        return format(new Date(driver.createdAt), 'MMM yyyy');
                                                      } catch {
                                                        return String(driver.createdAt).slice(0, 10);
                                                      }
                                                    })()}`
                                                  : ''}
                                              </p>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <StatusBadge status={driver.status} />
                                      {driver.dispatchBlocked && (
                                        <Badge
                                          variant="destructive"
                                          className="text-[10px] px-1.5 py-0"
                                          title={driver.dispatchBlockReason || 'License expired'}
                                        >
                                          Dispatch blocked
                                        </Badge>
                                      )}
                                      {asNumber(driver.overdueFollowUpCount) > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 gap-1 border-amber-300 text-amber-800 bg-amber-50"
                                          title={`${driver.overdueFollowUpCount} overdue follow-up note(s)`}
                                        >
                                          <StickyNote className="h-3 w-3" />
                                          {driver.overdueFollowUpCount}
                                        </Badge>
                                      )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <TierBadge tier={driver.tier} />
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const assigned = byDriverId.get(driver.id);
                                    const unassigned = !assigned;
                                    const busy = busyDriverId === driver.id;
                                    const assignment = assigned
                                      ? vehicleAssignmentLabel(assigned) || assigned.licensePlate || 'Assigned'
                                      : 'Unassigned';
                                    return (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            className="group -mx-1.5 flex w-full max-w-[220px] items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800"
                                            aria-label={`Change vehicle for ${driver.name}`}
                                          >
                                            {unassigned ? (
                                              <span className="text-slate-400 group-hover:text-slate-600">
                                                Unassigned
                                              </span>
                                            ) : (
                                              <>
                                                {assigned?.image ? (
                                                  <div className="flex h-10 w-16 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                                    <img
                                                      src={assigned.image}
                                                      alt=""
                                                      className="h-full w-full object-cover"
                                                    />
                                                  </div>
                                                ) : null}
                                                <span className="truncate text-slate-800 dark:text-slate-200">
                                                  {assignment}
                                                </span>
                                              </>
                                            )}
                                            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start" className="w-52">
                                          <DropdownMenuLabel>Vehicle</DropdownMenuLabel>
                                          <DropdownMenuItem
                                            disabled={busy}
                                            onClick={() => setAssignDriverId(driver.id)}
                                          >
                                            {unassigned ? 'Assign vehicle' : 'Assign another vehicle'}
                                          </DropdownMenuItem>
                                          {!unassigned ? (
                                            <>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                disabled={busy}
                                                className="text-rose-600 focus:text-rose-700"
                                                onClick={() => void handleUnassignVehicle(driver.id)}
                                              >
                                                Unassign vehicle
                                              </DropdownMenuItem>
                                            </>
                                          ) : null}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                        <Button 
                                           variant="ghost" 
                                           size="icon" 
                                           className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             openDriver(driver.id);
                                           }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                           variant="ghost"
                                           size="icon"
                                           className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                           title="Add note"
                                           aria-label="Add note"
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             openDriver(driver.id, 'profile');
                                           }}
                                        >
                                            <StickyNote className="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openDriver(driver.id)}>View Analysis</DropdownMenuItem>
                                                <DropdownMenuItem>View History</DropdownMenuItem>
                                                {can('drivers.edit') && (
                                                  <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDriverToRemove(driver.id);
                                                        }}
                                                    >
                                                        Remove from Fleet
                                                    </DropdownMenuItem>
                                                  </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-slate-500 dark:text-slate-400">
                                No drivers found matching your criteria.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
      </Card>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {paginatedDrivers.length > 0 ? (
          paginatedDrivers.map((driver) => (
            <div
              key={driver.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => openDriver(driver.id)}
                aria-label={`Open driver ${driver.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0 border border-slate-200 dark:border-slate-700">
                      <AvatarImage src={driver.avatarUrl} />
                      <AvatarFallback className="bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {driverInitials(driver.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">{driver.name}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{driver.phone}</p>
                    </div>
                  </div>
                  <StatusBadge status={driver.status} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <p className="text-xs text-slate-500">Tier</p>
                  <TierBadge tier={driver.tier} />
                </div>
              </button>
              <div className="mt-3">
                  {(() => {
                    const assigned = byDriverId.get(driver.id);
                    const unassigned = !assigned;
                    const busy = busyDriverId === driver.id;
                    const assignment = assigned
                      ? vehicleAssignmentLabel(assigned) || assigned.licensePlate || 'Assigned'
                      : 'Unassigned';
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm dark:border-slate-700"
                            aria-label={`Change vehicle for ${driver.name}`}
                          >
                            <span className={unassigned ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}>
                              {assignment}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuLabel>Vehicle</DropdownMenuLabel>
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() => setAssignDriverId(driver.id)}
                          >
                            {unassigned ? 'Assign vehicle' : 'Assign another vehicle'}
                          </DropdownMenuItem>
                          {!unassigned ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={busy}
                                className="text-rose-600 focus:text-rose-700"
                                onClick={() => void handleUnassignVehicle(driver.id)}
                              >
                                Unassign vehicle
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <Checkbox
                  checked={selectedIds.has(driver.id)}
                  onCheckedChange={(v) => toggleSelectOne(driver.id, v === true)}
                  aria-label={`Select ${driver.name}`}
                  className="min-h-11 min-w-11"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-slate-400">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDriver(driver.id)}>View Analysis</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openDriver(driver.id, 'profile')}>Add note</DropdownMenuItem>
                    {can('drivers.edit') && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => setDriverToRemove(driver.id)}
                        >
                          Remove from Fleet
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No drivers found matching your criteria.
          </div>
        )}
      </div>

      {/* --- FOOTER --- */}
      <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
             <Select defaultValue="10">
                <SelectTrigger className="h-8 w-[100px] border-none shadow-none bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800">
                    <SelectValue placeholder="10 rows" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="10">10 rows</SelectItem>
                    <SelectItem value="20">20 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                </SelectContent>
             </Select>
          </div>
          
          <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePrevPage} 
                disabled={currentPage === 1}
                className="bg-slate-50 dark:bg-slate-800 border-none shadow-none text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                 {currentPage} / {totalPages || 1}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleNextPage} 
                disabled={currentPage >= totalPages}
                className="bg-slate-50 dark:bg-slate-800 border-none shadow-none text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
          </div>
      </div>
      </>
      )}

      <DashboardAssignVehicleDialog
        open={Boolean(assignDriverId)}
        onOpenChange={(open) => {
          if (!open && !busyDriverId) setAssignDriverId(null);
        }}
        driverName={assignDriver?.name || ''}
        vehicles={assignableVehicles}
        currentVehicleId={assignDriverId ? byDriverId.get(assignDriverId)?.id : undefined}
        busy={Boolean(busyDriverId)}
        onConfirm={handleConfirmAssign}
      />

      <AddDriverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onDriverAdded={handleDriverAdded}
      />

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save filter view</DialogTitle>
            <DialogDescription>
              Save the current status and performance filters as a named view on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="save-view-name">View name</Label>
            <Input
              id="save-view-name"
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              placeholder="e.g. At-risk Active"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveCurrentView();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCurrentView}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 10: Claim Driver Dialog */}
      <Dialog open={isClaimOpen} onOpenChange={setIsClaimOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim Existing Driver</DialogTitle>
            <DialogDescription>
              Link a driver who registered independently to your organization. Enter their email address.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setClaimLoading(true);
            try {
              await api.claimDriver(claimEmail);
              toast.success(`Driver ${claimEmail} has been linked to your organization`);
              setIsClaimOpen(false);
              setClaimEmail('');
              queryClient.invalidateQueries({ queryKey: ['drivers'] });
              queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
            } catch (error: any) {
              toast.error(error.message || "Failed to claim driver");
            } finally {
              setClaimLoading(false);
            }
          }} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="claim-email">Driver's Email</Label>
              <Input
                id="claim-email"
                type="email"
                placeholder="driver@example.com"
                required
                value={claimEmail}
                onChange={(e) => setClaimEmail(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                The driver must have an existing account and not already be linked to another organization.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsClaimOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={claimLoading}>
                {claimLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Claim Driver
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove From Fleet Confirmation Dialog */}
      <AlertDialog open={!!driverToRemove} onOpenChange={(open) => !open && setDriverToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove driver from your fleet?</AlertDialogTitle>
            <AlertDialogDescription>
              The driver keeps their account and trip history, but is unlinked from your organization,
              unassigned from their vehicle, and switched back to independent mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemoveFromFleet();
              }}
              disabled={isRemoving}
            >
              {isRemoving ? "Removing..." : "Remove from Fleet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
   if (status === 'Active') {
      return (
        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100 font-normal">
            <CheckCircle2 className="h-3 w-3 mr-1.5 fill-emerald-500 text-white" />
            Active
        </Badge>
      );
   } else if (status === 'Needs Attention') {
      return (
        <Badge variant="secondary" className="bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-100 font-normal">
            <AlertCircle className="h-3 w-3 mr-1.5 fill-rose-500 text-white" />
            Needs Attention
        </Badge>
      );
   }
   return (
      <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 font-normal">
        Inactive
      </Badge>
   );
}

function TierBadge({ tier }: { tier: string }) {
    const colors = {
        Platinum: "bg-slate-800 text-slate-100 border-slate-700",
        Gold: "bg-amber-100 text-amber-800 border-amber-200",
        Silver: "bg-slate-100 text-slate-700 border-slate-200",
        Bronze: "bg-orange-50 text-orange-800 border-orange-200"
    };
    const colorClass = colors[tier as keyof typeof colors] || colors.Bronze;

    return (
        <Badge variant="outline" className={`${colorClass} font-medium`}>
            {tier}
        </Badge>
    )
}

export default DriversPage;
