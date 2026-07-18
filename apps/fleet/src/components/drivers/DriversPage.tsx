import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Trip } from '../../types/data';
import { useVocab } from '../../utils/vocabulary';
import { 
  Loader2, 
  Search, 
  Plus,
  MoreVertical, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Download,
  Phone,
  Mail,
  Car,
  Eye,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  DollarSign
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
import { projectId } from '../../utils/supabase/info';
import { requireAuthHeaders } from '../../utils/authHeaders';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { toast } from "sonner@2.0.3";
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
  loadEarningsPolicyRuntimeContext,
  resolveBundleFromContext,
  type EarningsPolicyRuntimeContext,
} from '../../utils/loadResolvedEarningsBundle';
import { TierCalculations } from '../../utils/tierCalculations';
import { TierConfig } from '../../types/data';
import { isSameMonth } from 'date-fns';
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
  return {
    id: driver.id,
    name: driverDisplayName(driver.name),
    avatarUrl: driver.avatarUrl,
    status: driver.status ?? 'Active',
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
    linkedTrips: driver.linkedTrips,
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

  // Linked Trips (To ensure detail view matches list view aggregation)
  linkedTrips?: Trip[];
}

export function DriversPage({ initialDriverId }: { initialDriverId?: string | null }) {
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

  // Update selected driver if initialDriverId changes
  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    }
  }, [initialDriverId]);

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [performanceFilter, setPerformanceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [driverToDelete, setDriverToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Phase 7.1: React Query for trips data
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ['trips', 200],
    queryFn: () => api.getTrips({ limit: 200 }),
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 7.1: React Query for manual drivers
  const { data: manualDrivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.getDrivers().catch(() => []),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 7.1: React Query for driver metrics
  const { data: importedMetrics = [] } = useQuery({
    queryKey: ['driverMetrics'],
    queryFn: () => api.getDriverMetrics().catch(() => []),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 7.1: React Query for vehicle metrics
  const { data: vehicleMetrics = [] } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics().catch(() => []),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Earnings policy context (per-driver ladder resolve for current week)
  const { data: earningsPolicyCtx } = useQuery({
    queryKey: ['earningsPolicyRuntimeContext'],
    queryFn: () => loadEarningsPolicyRuntimeContext(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Phase 7.1: React Query for ledger summary
  const { data: ledgerData, isLoading: ledgerLoading, isError: ledgerErrorQuery } = useQuery({
    queryKey: ['ledgerDriversSummary'],
    queryFn: async () => {
      try {
        const result = await api.getLedgerDriversSummary();
        if (result.success && result.data) {
          console.log(`[DriversPage] Ledger summary loaded: ${result.meta.totalDrivers} drivers, ${result.meta.totalEntriesProcessed} entries in ${result.meta.durationMs}ms`);
          return result.data;
        }
        console.warn('[DriversPage] Ledger summary unavailable — earnings may show $0');
        return {};
      } catch (e) {
        console.warn('[DriversPage] Ledger summary fetch failed:', e);
        return {};
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes (financial data should be fresher)
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const ledgerSummary = ledgerData || {};
  const ledgerLoaded = !ledgerLoading && !ledgerErrorQuery;
  const ledgerError = ledgerErrorQuery;
  const loading = tripsLoading;

  const safeManualDrivers = asArray<DriverProfile>(manualDrivers);
  const safeImportedMetrics = asArray<import('../../types/data').DriverMetrics>(importedMetrics);

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
      toast.success("Driver deleted successfully");
      setDriverToDelete(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete driver");
    } finally {
      setIsDeleting(false);
    }
  };

  // Transform Trips into Unique Drivers List with Real Metrics
  const drivers: DriverProfile[] = useMemo(() => {
    // 1. Index Manual Drivers by Name AND External IDs
    const manualDriverMap = new Map<string, DriverProfile>(); // Name -> Driver
    const externalIdMap = new Map<string, DriverProfile>();   // External ID -> Driver
    
    // Index Metrics for fast lookup
    const metricsMap = new Map<string, import('../../types/data').DriverMetrics>();
    (safeImportedMetrics).forEach(m => {
        if (m?.driverId) metricsMap.set(m.driverId, m);
    });

    safeManualDrivers.forEach(d => {
        if (!d || typeof d !== 'object') return;
        // Index by Name
        if (d.name) manualDriverMap.set(String(d.name).toLowerCase().trim(), d);
        
        // Index by External IDs (Prioritized)
        if (d.uberDriverId) externalIdMap.set(d.uberDriverId, d);
        if (d.inDriveDriverId) externalIdMap.set(d.inDriveDriverId, d);
    });

    const driverMap = new Map<string, DriverProfile>();
    const driverStats = new Map<string, { completed: number, cancelled: number }>();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Process trips to extract unique drivers and aggregate data
    // Sort by date desc so we get latest vehicle/info
    const safeTrips = Array.isArray(trips) ? trips : [];
    const sortedTrips = [...safeTrips].sort((a, b) => {
      const tb = a?.date ? new Date(a.date).getTime() : 0;
      const ta = b?.date ? new Date(b.date).getTime() : 0;
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    sortedTrips.forEach(trip => {
        if (!trip || !trip.driverId || trip.driverId === 'unknown') return;

        // Try to match with a Manual Driver Profile
        let driverId = trip.driverId;
        let matchedManualDriver = null;

        // STRATEGY 1: Match by External ID (Exact Match)
        if (externalIdMap.has(trip.driverId)) {
            matchedManualDriver = externalIdMap.get(trip.driverId)!;
        }
        
        // STRATEGY 2: Match by Name (Fuzzy/Failsafe)
        if (!matchedManualDriver && trip.driverName) {
            const normalizedTripName = trip.driverName.toLowerCase().trim();
            
            // Check for exact name match
            if (manualDriverMap.has(normalizedTripName)) {
                matchedManualDriver = manualDriverMap.get(normalizedTripName)!;
            } else {
                // Check if any manual driver name is a prefix of the trip name 
                // (handles "NAME 5179KZ" or "NAME (ID)")
                for (const [manualName, manualDriver] of manualDriverMap.entries()) {
                    if (normalizedTripName.startsWith(manualName) || manualName.startsWith(normalizedTripName)) {
                        matchedManualDriver = manualDriver;
                        break;
                    }
                }
            }
        }

        if (matchedManualDriver) {
             driverId = matchedManualDriver.id; // Use Manual ID to aggregate stats
        }

        // Initialize driver profile if not exists
        if (!driverMap.has(driverId)) {
            if (matchedManualDriver) {
                 // Use Manual Profile Data
                 driverMap.set(driverId, {
                    ...matchedManualDriver,
                    name: driverDisplayName(matchedManualDriver.name),
                    // Reset calculated metrics (will be summed up below)
                    totalTrips: 0,
                    totalEarnings: 0,
                    todaysEarnings: 0,
                    todaysTrips: 0,
                    monthlyEarnings: 0,
                    linkedTrips: [], // Initialize list
                    // Keep status from manual unless logic overrides? 
                    // We'll keep manual status but update acceptanceRate
                 });
                 driverStats.set(driverId, { completed: 0, cancelled: 0 });
            } else {
                // PHASE 5 FIX: Do NOT synthesize driver profiles from trip data.
                // This was causing "random drivers" to appear in fleet portals.
                // Only show drivers that have explicit driver profiles.
                // Skip this trip's driver - they don't have a manual profile.
                return;
            }
        }

        const driver = driverMap.get(driverId)!;
        
        // Capture Platform IDs if missing from profile
        // This ensures that even if we matched a manual driver or started with another platform,
        // we collect all associated UUIDs.
        if (trip.platform === 'Uber' && !driver.uberDriverId) {
            driver.uberDriverId = trip.driverId;
        } else if (trip.platform === 'InDrive' && !driver.inDriveDriverId) {
            driver.inDriveDriverId = trip.driverId;
        }

        let stats = driverStats.get(driverId);
        
        // Safety check if stats missing (shouldn't happen)
        if (!stats) {
            stats = { completed: 0, cancelled: 0 };
            driverStats.set(driverId, stats);
        }

        const tripDate = trip.date ? String(trip.date).split('T')[0] : '';

        // Update Totals
        driver.totalTrips += 1;
        // Phase 6: Trip-based earnings fallback removed — ledger is sole source
        
        // Link Trip
        if (driver.linkedTrips) {
            driver.linkedTrips.push(trip);
        }

        // Update Today's Metrics
        if (tripDate === today) {
            // Phase 6: Trip-based todaysEarnings fallback removed — ledger is sole source
            driver.todaysTrips += 1;
        }

        // Update Monthly Earnings (for Tier Calc)
        try {
             if (isSameMonth(new Date(trip.date), now)) {
                 // Phase 6: Trip-based monthlyEarnings fallback removed — ledger is sole source
             }
        } catch (e) {
             // Ignore invalid dates
        }

        // Update Status Stats
        if (trip.status === 'Completed') stats.completed++;
        else if (trip.status === 'Cancelled') stats.cancelled++;

        // Update Vehicle (use the most recent one since we sorted desc)
        if (trip.vehicleId && (driver.vehicle === 'Unassigned' || !driver.vehicle)) {
            driver.vehicle = trip.vehicleId;
        }
    });

    // Phase 2: Overlay ledger-sourced earnings onto driver profiles
    if (ledgerLoaded && !ledgerError) {
      for (const [, driver] of driverMap) {
        // Try matching by driver's Roam ID first, then by external platform IDs
        const summary = ledgerSummary[driver.id]
          || (driver.uberDriverId ? ledgerSummary[driver.uberDriverId] : undefined)
          || (driver.inDriveDriverId ? ledgerSummary[driver.inDriveDriverId] : undefined);
        if (summary) {
          driver.totalEarnings = asNumber(summary.lifetimeEarnings);
          driver.todaysEarnings = asNumber(summary.todayEarnings);
          driver.monthlyEarnings = asNumber(summary.monthlyEarnings);
        }
        // If no ledger summary for this driver, earnings stay at 0 (not trip-based)
      }
    } else if (!ledgerLoaded) {
      // Phase 6: Still loading — earnings stay at 0 until ledger loads
    } else {
      console.error('[DriversPage] Ledger unavailable — earnings will show $0 (no trip fallback)');
    }

    // Finalize Metrics (Rate, Tier, Status)
    const processedDrivers = Array.from(driverMap.values()).map(driver => {
        const stats = driverStats.get(driver.id) || { completed: 0, cancelled: 0 };
        const total = stats.completed + stats.cancelled;
        
        // Find matched metric from CSV
        let metric = metricsMap.get(driver.id);
        if (!metric && driver.uberDriverId) metric = metricsMap.get(driver.uberDriverId);
        if (!metric && driver.inDriveDriverId) metric = metricsMap.get(driver.inDriveDriverId);

        // Acceptance Rate Strategy:
        // 1. Prefer CSV Metric (True Acceptance Rate)
        // 2. Fallback to Calculated Completion Rate (Trip Logs)
        if (metric && metric.acceptanceRate !== undefined) {
             // metric.acceptanceRate is 0.0-1.0
             driver.acceptanceRate = Math.round(metric.acceptanceRate * 100);
        } else {
             driver.acceptanceRate = total > 0 ? Math.round((stats.completed / total) * 100) : 100;
        }

        // Tier Logic — resolve this driver's scheduled policy for the current week
        if (earningsPolicyCtx) {
            const bundle = resolveBundleFromContext(
              earningsPolicyCtx as EarningsPolicyRuntimeContext,
              driver.id,
            );
            const tier = TierCalculations.getTierForEarnings(
              driver.monthlyEarnings ?? 0,
              bundle.tiers,
            );
            driver.tier = tier?.name ?? 'Bronze';
        } else if (metric && metric.tier) {
             // Priority 2: Imported Metric Fallback
            driver.tier = metric.tier;
        } else {
            // Fallback Legacy
            if (driver.totalEarnings > 5000) driver.tier = 'Platinum';
            else if (driver.totalEarnings > 3000) driver.tier = 'Gold';
            else if (driver.totalEarnings > 1000) driver.tier = 'Silver';
            else driver.tier = 'Bronze';
        }

        // Status Logic (Only override if Active)
        if (driver.status === 'Active' && driver.acceptanceRate < 70) {
            driver.status = 'Needs Attention';
        }
        
        return driver;
    });

    // Add Orphaned Manual Drivers (No trips found)
    const processedIds = new Set(processedDrivers.map(d => d.id));
    // @ts-ignore
    const orphanedDrivers = safeManualDrivers
      .filter(d => d?.id && !processedIds.has(d.id)).map(d => {
        // Try to find imported metrics for orphan
        let metric = metricsMap.get(d.id);
        if (!metric && d.uberDriverId) metric = metricsMap.get(d.uberDriverId);
        
        // Use manual driver tier if available, otherwise default
        let tier = d.tier || 'Bronze';
        if (metric && metric.tier) tier = metric.tier;
        else if (earningsPolicyCtx && d.totalEarnings !== undefined) {
             // For orphans without trips loaded, we might default to their 'totalEarnings' field 
             // if it represents monthly, but usually it's lifetime.
             // Safest to rely on manual 'tier' field or calculate if we had monthly data.
             // If we have no trips, monthlyEarnings is effectively 0 unless manually set.
             // We'll stick to existing logic or manual set tier.
             // If manual driver has a tier set, use it.
             if (!d.tier) {
                 const bundle = resolveBundleFromContext(
                   earningsPolicyCtx as EarningsPolicyRuntimeContext,
                   d.id,
                 );
                 const t = TierCalculations.getTierForEarnings(0, bundle.tiers);
                 tier = t?.name ?? 'Bronze';
             }
        }

        return {
            ...d,
            totalEarnings: d.totalEarnings || 0,
            totalTrips: d.totalTrips || 0,
            todaysEarnings: 0,
            todaysTrips: 0,
            monthlyEarnings: 0, // No trips = 0 monthly
            acceptanceRate: metric?.acceptanceRate != null ? Math.round(metric.acceptanceRate * 100) : 100,
            tier: tier,
            status: d.status || 'Active'
        };
    }).map(orphan => {
        // Phase 2: Overlay ledger earnings for orphaned drivers too
        if (ledgerLoaded && !ledgerError) {
            const summary = ledgerSummary[orphan.id]
              || (orphan.uberDriverId ? ledgerSummary[orphan.uberDriverId] : undefined)
              || (orphan.inDriveDriverId ? ledgerSummary[orphan.inDriveDriverId] : undefined);
            if (summary) {
                orphan.totalEarnings = asNumber(summary.lifetimeEarnings);
                orphan.todaysEarnings = asNumber(summary.todayEarnings);
                orphan.monthlyEarnings = asNumber(summary.monthlyEarnings);
                // Re-calculate tier with ledger monthly earnings + this driver's policy
                if (earningsPolicyCtx) {
                    const bundle = resolveBundleFromContext(
                      earningsPolicyCtx as EarningsPolicyRuntimeContext,
                      orphan.id,
                    );
                    const t = TierCalculations.getTierForEarnings(summary.monthlyEarnings, bundle.tiers);
                    orphan.tier = t?.name ?? 'Bronze';
                }
            }
        }
        return orphan;
    });

    return [...processedDrivers, ...orphanedDrivers].map((d) => normalizeDriverProfile(d));
  }, [trips, safeManualDrivers, safeImportedMetrics, earningsPolicyCtx, ledgerSummary, ledgerLoaded, ledgerError]);

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

  // Export Function
  const handleExport = () => {
    const headers = ['ID', 'Name', 'Status', 'Vehicle', 'Phone', 'Email', 'Total Trips', 'Total Earnings', 'Acceptance Rate', 'Tier'];
    const csvContent = [
      headers.join(','),
      ...filteredDrivers.map(d => [
        d.id,
        `"${d.name}"`,
        d.status,
        d.vehicle,
        d.phone,
        d.email,
        d.totalTrips,
        d.totalEarnings.toFixed(2),
        `${d.acceptanceRate}%`,
        d.tier
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'drivers_export.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Calculate Fleet Averages
  const fleetStats = useMemo(() => {
    if (drivers.length === 0) return undefined;
    
    const totalEarnings = drivers.reduce((sum, d) => sum + asNumber(d.totalEarnings), 0);
    const totalTrips = drivers.reduce((sum, d) => sum + asNumber(d.totalTrips), 0);
    const avgAcceptance = drivers.reduce((sum, d) => sum + asNumber(d.acceptanceRate, 100), 0) / drivers.length;
    
    // Simplistic calculation for demo purposes
    return {
        avgEarningsPerTrip: totalTrips > 0 ? totalEarnings / totalTrips : 0,
        avgAcceptanceRate: Math.round(avgAcceptance),
        avgRating: 4.8, // Hardcoded for now as we don't have rating in DriverProfile yet
        avgWeeklyEarnings: totalEarnings / drivers.length // Assuming totalEarnings is lifetime, this is a rough proxy for "average driver earnings"
    };
  }, [drivers]);

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
    // Phase 7.1: Invalidate React Query cache to refetch drivers list
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // If a driver is selected, show the detail view with filtered trips
  if (selectedDriverId) {
    const selectedDriver = drivers.find(d => 
        d.id === selectedDriverId || 
        d.uberDriverId === selectedDriverId || 
        d.inDriveDriverId === selectedDriverId
    );
    // Use trips that were explicitly linked to this driver during aggregation
    const driverTrips = selectedDriver?.linkedTrips || [];
    
    // Find relevant metrics for this driver
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
        trips={driverTrips}
        metrics={driverMetrics}
        vehicleMetrics={vehicleMetrics}
        onBack={() => setSelectedDriverId(null)}
        fleetStats={fleetStats}
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

                <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-auto md:ml-2 rounded-full"
                    onClick={handleExport}
                >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                </Button>
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
                            <TableRow key={driver.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setSelectedDriverId(driver.id)}>
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
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[120px] font-mono">
                                                {driver.phone}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={driver.status} />
                                </TableCell>
                                <TableCell>
                                    <div className="font-medium text-slate-900 dark:text-slate-100">${driver.todaysEarnings.toFixed(2)}</div>
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
                                             setSelectedDriverId(driver.id);
                                           }}
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                                            <MessageSquare className="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setSelectedDriverId(driver.id)}>View Analysis</DropdownMenuItem>
                                                <DropdownMenuItem>View History</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                {can('drivers.delete') && (
                                                <DropdownMenuItem 
                                                    className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-900/20 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDriverToDelete(driver.id);
                                                    }}
                                                >
                                                    Delete Driver
                                                </DropdownMenuItem>
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