import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useVocab } from '../../utils/vocabulary';
import { formatJMD } from '../../utils/formatJMD';
import { exportToCSV } from '../../utils/csvHelpers';
import { format } from 'date-fns';
import { 
  Loader2, 
  Search, 
  Plus,
  MoreVertical, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Download,
  Eye,
  StickyNote,
  AlertCircle,
} from 'lucide-react';
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
import { TierCalculations } from '../../utils/tierCalculations';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../auth/AuthContext';

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
import { WorkforceInvitePanel } from '../workforce/WorkforceInvitePanel';
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
  // Phase 5: Get user for organization validation
  const { user } = useAuth();
  const currentOrgId = user?.user_metadata?.organizationId || user?.id;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
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
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [driverToDelete, setDriverToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [driverToRemove, setDriverToRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const { serviceLineParam } = useServiceLineScopeParam();
  const earningsServiceLine = serviceLineParam;

  // Primary list source — server-aggregated roster (no client trip sample)
  const { data: rosterRaw = [], isLoading: rosterLoading, isError: rosterError, error: rosterErr } = useQuery({
    queryKey: ['driversRoster'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

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

  // Keep getDrivers for mutations / detail profile merge (bankInfo, etc.)
  const { data: manualDrivers = [], isError: driversLoadError, error: driversError } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers(),
    enabled: enrichEnabled,
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

  const { data: importedMetrics = [] } = useQuery({
    queryKey: ['driverMetrics'],
    queryFn: () => api.getDriverMetrics().catch(() => []),
    enabled: enrichEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: vehicleMetrics = [] } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics().catch(() => []),
    enabled: enrichEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: earningsPolicyCtx } = useQuery({
    queryKey: ['earningsPolicyRuntimeContext'],
    queryFn: () => loadEarningsPolicyRuntimeContext(),
    enabled: enrichEnabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const safeManualDrivers = asArray<DriverProfile>(manualDrivers);
  const safeImportedMetrics = asArray<import('../../types/data').DriverMetrics>(importedMetrics);
  const safeRoster = asArray<DriverProfile>(rosterRaw);

  const handleDeleteDriver = async () => {
    if (!driverToDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.fleet}/drivers/${driverToDelete}`, {
        method: 'DELETE',
        headers: await requireAuthHeaders(null)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete driver');
      }
      
      // Phase 7.1: Invalidate React Query cache after deletion
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
      toast.success("Driver deleted successfully");
      setDriverToDelete(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete driver");
    } finally {
      setIsDeleting(false);
    }
  };

  // Detach membership (auth + KV + driver_profiles + vehicle) without deleting the account
  const handleRemoveFromFleet = async () => {
    if (!driverToRemove) return;
    setIsRemoving(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.fleet}/team/drivers/${driverToRemove}/remove`, {
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
      console.error('Remove error:', error);
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

    return safeRoster.map((row) => {
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
        const bundle = resolveBundleFromContext(
          earningsPolicyCtx as EarningsPolicyRuntimeContext,
          row.id,
          undefined,
          earningsServiceLine,
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
      });
    });
  }, [safeRoster, safeManualDrivers, safeImportedMetrics, earningsPolicyCtx, earningsServiceLine]);

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

          return matchesSearch && matchesStatus && matchesTier && matchesPerformance;
      });
  }, [orgValidatedDrivers, searchQuery, statusFilter, tierFilter, performanceFilter]);

  // Export Function — Papa CSV via exportToCSV; gated for export / view roles
  const handleExport = () => {
    if (!can('transactions.export') && !can('drivers.view')) {
      return;
    }
    const rows = filteredDrivers.map((d) => ({
      ID: d.id,
      Name: d.name,
      Status: d.status,
      Vehicle: d.vehicle,
      Phone: d.phone,
      Email: d.email,
      'Total Trips': d.totalTrips,
      'Total Earnings': Number(d.totalEarnings || 0).toFixed(2),
      'Acceptance Rate': `${d.acceptanceRate}%`,
      Tier: d.tier,
      'License Number': d.licenseNumber || '',
      'License Expiry': d.licenseExpiry || '',
      'Member Since': d.createdAt || '',
    }));
    exportToCSV(rows, 'drivers_export.csv');
  };

  // Pagination Logic
  const totalPages = Math.ceil(filteredDrivers.length / rowsPerPage);
  const paginatedDrivers = filteredDrivers.slice(
      (currentPage - 1) * rowsPerPage, 
      currentPage * rowsPerPage
  );

  const handleNextPage = () => {
      if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const handleDriverAdded = (driver: any) => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
    queryClient.invalidateQueries({ queryKey: ['driversRoster'] });
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
        vehicleMetrics={vehicleMetrics}
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
           <div>
               <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{v('driversPageTitle')}</h2>
               <p className="text-slate-500 dark:text-slate-400">{v('driversPageSubtitle')}</p>
           </div>
           {can('drivers.create') && (
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
           )}
        </div>

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
      </div>

      {/* --- TABLE --- */}
      <Card className="border-none shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
          <CardContent className="p-0">
            <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                    <TableRow>
                        <TableHead className="w-[250px] font-semibold text-slate-700 dark:text-slate-300">Driver</TableHead>
                        <TableHead className="w-[100px] font-semibold text-slate-700 dark:text-slate-300">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Earnings (Today)</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Trips (Today)</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Acceptance</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Tier</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedDrivers.length > 0 ? (
                        paginatedDrivers.map((driver) => (
                            <TableRow key={driver.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => openDriver(driver.id)}>
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
                                    <StatusBadge status={driver.status} />
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-slate-900 dark:text-slate-100">{formatJMD(driver.todaysEarnings, 2)}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-slate-600 dark:text-slate-300">{driver.todaysTrips}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                       <span className={`font-medium ${driver.acceptanceRate < 70 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                          {driver.acceptanceRate}%
                                       </span>
                                       {driver.acceptanceRate < 70 && <AlertCircle className="h-3 w-3 text-rose-500" />}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <TierBadge tier={driver.tier} />
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
                                                <DropdownMenuSeparator />
                                                {can('drivers.delete') && (
                                                <>
                                                <DropdownMenuItem
                                                    className="cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDriverToRemove(driver.id);
                                                    }}
                                                >
                                                    Remove from Fleet
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                    className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-900/20 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDriverToDelete(driver.id);
                                                    }}
                                                >
                                                    Delete Driver
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
                            <TableCell colSpan={7} className="h-24 text-center text-slate-500 dark:text-slate-400">
                                No drivers found matching your criteria.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </CardContent>
      </Card>

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

      <AddDriverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onDriverAdded={handleDriverAdded}
      />

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
              console.error(error);
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!driverToDelete} onOpenChange={(open) => !open && setDriverToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the driver account and remove their data from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleDeleteDriver();
              }}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Driver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
