// ════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE: Driver Detail — Data Flow (Phase 7 Documentation)
// ════════════════════════════════════════════════════════════════════════════
//
// FINANCIAL DATA (earnings, cash collected, tolls, tips, base fare):
//   → Source: canonical ledger_event:* KV (via server aggregation), not trip:* amounts
//   → Overview tab: GET /ledger/driver-overview  →  `resolvedFinancials`
//   → Financials > Earnings tab: GET /ledger/driver-earnings-history
//   → Financials > Donut chart: `resolvedFinancials.lifetimePlatformStats`
//
// OPERATIONAL DATA (distance, duration, ratings, utilization, fuel):
//   → Source: trip:* KV entries, computed client-side in `metrics` useMemo
//   → Overview distance/time, Service Quality rates (Efficiency & Trip History tabs removed — use Trip Logs / Fuel Analytics elsewhere)
//
// CASH WALLET DATA (net outstanding / collections):
//   → Source: walletCashWeeks + call-outstanding helpers (Financials / Cash Wallet tabs)
//
// INTEGRITY MONITORING (Phase 6):
//   → Server: /ledger/driver-overview returns `completeness` object
//   → Client: amber warning banner + "Diagnose" + "Repair Now"
//   → Repair: POST /ledger/ensure-from-trip-ids (repair-driver is retired)
//
// SAFETY NET (Phase 6): resolvedFinancials fallback now returns ZEROS
//   with dataIncomplete=true instead of trip-computed financials.
//   Auto-repair triggers when missing platforms detected.
//
// MIGRATED TO LEDGER (Phase 8):
//   → DriverPayoutHistory: now reads from GET /ledger/driver-earnings-history
//     (trips prop removed in Step 8.5; fallback gutted to return [])
//
// REMAINING TRIP-TO-FINANCIAL CONSUMERS:
//   → DriverExpensesHistory: uses trips only for date-range detection
//   → earningsPerKm: MIGRATED (Phase 6.2) — now hybrid: ledger earnings ÷ trip distance
//
// Money display paths use canonical ledger APIs (ledger_event:*); not raw trip:* for posted money.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { 
  ArrowLeft, 
  Star, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  MapPin,
  MessageSquare,
  Calendar as CalendarIcon, 
  Shield,
  Award,
  MoreHorizontal,
  Download,
  Share2,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Upload,
  Eye,
  Filter,
  CreditCard as CreditCardIcon,
  Wallet,
  Landmark,
  Trash2,
  Loader2,
  Car as CarIcon,
  Pencil,
  Plus,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Stethoscope
} from "lucide-react";
import { Button } from "../ui/button";
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import { Input } from "../ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Separator } from "../ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Trip, DriverMetrics, FinancialTransaction, QuotaConfig, LedgerDriverOverview } from '../../types/data';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "../ui/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { LogCashPaymentModal } from './LogCashPaymentModal';
import { CashWriteOffModal, type CashWriteOffSavePayload } from './CashWriteOffModal';
import { RecordPayoutModal, type RecordPayoutSavePayload } from './RecordPayoutModal';
import { PermissionGate } from '../auth/PermissionGate';
import {
  AVG_OPEN_SPEED_KMH,
  GAP_THRESHOLD_MINS as OPS_GAP_THRESHOLD_MINS,
  MIN_UNAVAILABLE_BLOCK_HOURS as OPS_MIN_UNAVAILABLE_BLOCK_HOURS,
  resolveFuelEconomyKmPerL,
} from '../../config/driverOpsDefaults';
import { usePermissions } from '../../hooks/usePermissions';
import { formatJMD } from '../../utils/formatJMD';
import { useDriverPayoutPeriodRows } from '../../hooks/useDriverPayoutPeriodRows';
import { useDriverFinancialBundle } from '../../hooks/useDriverFinancialBundle';
import { useInvalidateDriverFinancialPeriods } from '../../hooks/useDriverFinancialPeriods';
import { useDriverTransactions } from '../../hooks/useDriverTransactions';
import { useDriverTollLogs } from '../../hooks/useDriverTollLogs';
import { buildWalletCallOutstandingByMonday } from '../../utils/walletCallOutstanding';
import { DriverEarningsHistory } from './DriverEarningsHistory';
import { DriverExpensesHistory } from './DriverExpensesHistory';
import { DriverPayoutHistory } from './DriverPayoutHistory';
// TollRecoveryCard removed — Phase 8 uses platformStats injection instead
// fetchDriverTrips.ts deleted in Phase 11 — logic inlined in the useEffect below
import { DistanceByPlatform } from './DistanceByPlatform';
import { FinancialSubTabs } from './FinancialSubTabs';
import {
  DriverPeriodProvider,
  useDriverPeriod,
} from './context/DriverPeriodContext';
import {
  isDriverDetailTab,
  type DriverDetailTab,
} from '../../navigation/pageRegistry';
import { OverviewMetricsGrid, PLATFORM_COLORS } from './OverviewMetricsGrid';
import { DriverIndriveWalletTab } from './DriverIndriveWalletTab';
import { DriverFuelPolicySelect } from './DriverFuelPolicySelect';
import { TimeFilterDropdown, TimeFilterValue, isHourInTimeFilter } from './TimeFilterDropdown';
import { api } from '../../services/api';
import { computeServiceQualityRates } from '../../utils/driverOperationalMetrics';
import { TierCalculations } from '../../utils/tierCalculations';
import { TierConfig } from '../../types/data';
import { loadResolvedEarningsBundleForDriverWeek } from '../../utils/loadResolvedEarningsBundle';
import { useServiceLineScopeParam } from '../../hooks/useServiceLineScopeParam';
import { getEffectiveTripEarnings } from '../../utils/tripEarnings';
import { normalizePlatform } from '../../utils/normalizePlatform';
import { getTripPhysicalCashCollected, sumTripPhysicalCashCollected } from '../../utils/tripPhysicalCash';
import { expandDriverTransactionIds } from '../../utils/expandDriverTransactionIds';
import { isCashWriteOffTransaction, isDriverCashPaymentTransaction, isDriverPayoutTransaction } from '../../utils/driverCashPayment';
import {
  buildCashCollectionTx,
  buildCashWriteOffTx,
  buildDriverPayoutTx,
} from '../../utils/driverSettlementTx';
import { isUberCashEligibleMetricPeriod, isValidDriverMetricPeriod } from '../../utils/driverMetricPeriod';
import { resolveUberPeriodCashCollected } from '../../utils/resolveUberPeriodCash';
import { calculateAverageEnroute, estimateEnrouteFallback } from '../../utils/enrouteStrategy';
import { Checkbox } from "../ui/checkbox";
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

import type { DriverDocument } from './tabs/DriverProfileTab';
export type { DriverDocument };

const DriverProfileTab = React.lazy(() =>
  import('./tabs/DriverProfileTab').then((m) => ({ default: m.DriverProfileTab })),
);
const DriverServiceQualityTab = React.lazy(() =>
  import('./tabs/DriverServiceQualityTab').then((m) => ({ default: m.DriverServiceQualityTab })),
);
const DriverCashWalletTab = React.lazy(() =>
  import('./tabs/DriverCashWalletTab').then((m) => ({ default: m.DriverCashWalletTab })),
);

export interface ReconstructedMetrics {
    onTrip: { time: number; distance: number };
    enroute: { time: number; distance: number };
    open: { time: number; distance: number };
    unavailable: { time: number; distance: number };
    fuel: {
        rideShare: number;
        companyOps: number;
        personal: number;
        misc: number;
        total: number;
    };
}

export const parseTripDate = (dateStr: string | Date): Date | null => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    try {
        let dateObj: Date;
        if (dateStr.includes('T')) {
            dateObj = new Date(dateStr);
        } else if (dateStr.includes('/')) {
            // US vs UK date format ambiguity handling
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                const p3 = parseInt(parts[2]);
                // Heuristic: if first part > 12, it must be day (DD/MM/YYYY)
                // Otherwise assume MM/DD/YYYY unless specified otherwise
                if (p1 > 12) {
                     dateObj = new Date(p3, p2 - 1, p1);
                } else {
                     dateObj = new Date(p3, p1 - 1, p2);
                }
            } else {
                dateObj = new Date(dateStr);
            }
        } else if (dateStr.includes('-') && dateStr.length === 10) {
            const [y, m, d] = dateStr.split('-').map(Number);
            dateObj = new Date(y, m - 1, d);
        } else {
            dateObj = new Date(dateStr);
        }
        
        if (isNaN(dateObj.getTime())) return null;
        return dateObj;
    } catch (e) {
        console.error("Failed to parse date:", dateStr);
        return null;
    }
};

/** `asc` = oldest-first (required for gap analysis between consecutive trips). `desc` = newest-first. */
export const getSortedTripsInRange = (
    trips: Trip[],
    rangeStart: Date,
    rangeEnd: Date,
    sortOrder: 'asc' | 'desc' = 'asc',
): Trip[] => {
    return trips.filter(trip => {
        // Use requestTime if available, otherwise fall back to date
        // Note: We need to cast to any if requestTime isn't in the imported Trip type yet, 
        // but for now we assume it is or will be accessed dynamically.
        const tripDate = parseTripDate((trip as any).requestTime || trip.date);
        if (!tripDate) return false;
        return tripDate >= rangeStart && tripDate <= rangeEnd;
    }).sort((a, b) => {
        const dateA = parseTripDate((a as any).requestTime || a.date);
        const dateB = parseTripDate((b as any).requestTime || b.date);
        const diff = (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
        return sortOrder === 'asc' ? diff : -diff;
    });
};

/** Build documents from real driver record only — never invent Unsplash / mock rows. */
function buildDriverDocuments(driver: any): DriverDocument[] {
  if (!driver) return [];
  const docs: DriverDocument[] = [];
  const expiry = String(driver.licenseExpiry || '').slice(0, 10);
  const verifications = (driver.complianceVerifications || {}) as Record<
    string,
    { status?: string; verifiedAt?: string; verifiedBy?: string }
  >;
  const expiryExpired = (() => {
    if (!expiry) return false;
    const d = parseTripDate(expiry);
    return !!(d && d < new Date());
  })();

  const resolveStatus = (
    docId: string,
    fallback: DriverDocument['status'],
  ): DriverDocument['status'] => {
    const v = verifications[docId];
    if (v?.status === 'Verified' || v?.status === 'Rejected' || v?.status === 'Pending') {
      if (expiryExpired && (docId === 'license-front' || docId === 'license-back')) return 'Expired';
      return v.status;
    }
    if (expiryExpired && (docId === 'license-front' || docId === 'license-back')) return 'Expired';
    return fallback;
  };

  if (driver.licenseFrontUrl) {
    const id = 'license-front';
    const v = verifications[id];
    docs.push({
      id,
      name: 'Driver License (Front)',
      type: 'License',
      status: resolveStatus(id, 'Pending'),
      expiryDate: expiry || '',
      uploadDate: '',
      url: driver.licenseFrontUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  if (driver.licenseBackUrl) {
    const id = 'license-back';
    const v = verifications[id];
    docs.push({
      id,
      name: 'Driver License (Back)',
      type: 'License Back',
      status: resolveStatus(id, 'Pending'),
      expiryDate: expiry || '',
      uploadDate: '',
      url: driver.licenseBackUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  if (driver.proofOfAddressUrl || driver.addressDocUrl) {
    const id = 'proof-address';
    const v = verifications[id];
    docs.push({
      id,
      name: `Proof of Address (${driver.proofOfAddressType || 'Document'})`,
      type: 'Address Proof',
      status: resolveStatus(id, 'Pending'),
      expiryDate: '',
      uploadDate: '',
      url: driver.proofOfAddressUrl || driver.addressDocUrl,
      verifiedAt: v?.verifiedAt,
      verifiedBy: v?.verifiedBy,
    });
  }
  return docs;
}

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  /** Optional seed trips — detail always fetches its own full set. */
  trips?: Trip[];
  metrics?: DriverMetrics[];
  vehicleMetrics?: import('../../types/data').VehicleMetrics[];
  onBack: () => void;
  /** Deep-link tab from `/drivers/:id/:tab` */
  initialTab?: DriverDetailTab | string;
  onTabChange?: (tab: DriverDetailTab) => void;
}

export function DriverDetail(props: DriverDetailProps) {
  return (
    <DriverPeriodProvider>
      <DriverDetailInner {...props} />
    </DriverPeriodProvider>
  );
}

function DriverDetailInner({
  driverId,
  driverName,
  driver,
  trips = [],
  metrics: csvMetrics,
  vehicleMetrics,
  onBack,
  initialTab,
  onTabChange,
}: DriverDetailProps) {
  const { serviceLineParam } = useServiceLineScopeParam();
  const { can } = usePermissions();
  const canEditTransactions = can('transactions.edit');
  const canEditDrivers = can('drivers.edit');
  const { period, setPeriod } = useDriverPeriod();
  const [activeTab, setActiveTab] = useState<string>(() =>
    isDriverDetailTab(initialTab) ? initialTab : 'overview',
  );

  useEffect(() => {
    if (isDriverDetailTab(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (isDriverDetailTab(tab)) onTabChange?.(tab);
  };

  /** Financials / Cash Wallet — gates money supporting APIs off Overview. */
  const moneyTabActive = activeTab === 'financial' || activeTab === 'wallet';
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
      isOpen: boolean;
      initialWorkPeriodStart?: string;
      initialWorkPeriodEnd?: string;
      initialAmount?: number;
      editingTransaction?: FinancialTransaction;
  }>({ isOpen: false });
  const [writeOffModalState, setWriteOffModalState] = useState<{
      isOpen: boolean;
      workPeriodStart: string;
      workPeriodEnd: string;
      maxAmount: number;
  }>({ isOpen: false, workPeriodStart: '', workPeriodEnd: '', maxAmount: 0 });
  const [payoutModalState, setPayoutModalState] = useState<{
      isOpen: boolean;
      workPeriodStart: string;
      workPeriodEnd: string;
      maxAmount: number;
  }>({ isOpen: false, workPeriodStart: '', workPeriodEnd: '', maxAmount: 0 });
  const [walletView, setWalletView] = useState<'ledger' | 'settlements'>('settlements');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['All']));
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ preset: 'all' });

  // Date Range State (Default: Last 7 Days) — Overview / InDrive only
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

  /** Shared period (DriverPeriodContext) — Financials + Cash Wallet; URL `?from=&to=`. */
  const financialDateRange = period;

  const financialDateRangeStrings = useMemo(() => {
    if (!financialDateRange?.from) return null;
    return {
      startDate: format(financialDateRange.from, 'yyyy-MM-dd'),
      endDate: format(financialDateRange.to || financialDateRange.from, 'yyyy-MM-dd'),
    };
  }, [financialDateRange]);

  /** Header Overview calendar only on Overview + InDrive Wallet. */
  const showOverviewDateControls =
    activeTab === 'overview' || activeTab === 'indrive-wallet';

  /** Once per driver, prefer the latest CSV metrics period (if any) over "last 7 days → today" so the calendar matches imported statement weeks. */
  const didInitDateRangeFromCsv = useRef(false);
  useEffect(() => {
    didInitDateRangeFromCsv.current = false;
  }, [driverId]);

  useEffect(() => {
    if (didInitDateRangeFromCsv.current) return;
    if (!csvMetrics?.length) return;
    const mine = csvMetrics.filter((m) => {
      const id = String(m.driverId ?? '').trim();
      return id === driverId || id.toLowerCase() === driverId.toLowerCase();
    });
    if (!mine.length) return;
    const latest = [...mine].sort(
      (a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
    )[0];
    if (!latest?.periodStart || !latest?.periodEnd) return;
    try {
      const fromStr = String(latest.periodStart).slice(0, 10);
      const toStr = String(latest.periodEnd).slice(0, 10);
      const from = new Date(`${fromStr}T12:00:00`);
      const to = new Date(`${toStr}T12:00:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
      setDateRange({ from, to });
      didInitDateRangeFromCsv.current = true;
    } catch {
      /* ignore */
    }
  }, [csvMetrics, driverId]);

  /** Single source for `getLedgerDriverOverview` and InDrive wallet GET — same `yyyy-MM-dd` bounds. */
  const ledgerDateRangeStrings = useMemo(() => {
    if (!dateRange?.from) return null;
    return {
      startDate: format(dateRange.from, 'yyyy-MM-dd'),
      endDate: format(dateRange.to || dateRange.from, 'yyyy-MM-dd'),
    };
  }, [dateRange]);

  // ────────────────────────────────────────────────────────────
  // Server-side trip fetching: load ALL trips for this driver
  // so we aren't limited by the initial 1,000-trip page load.
  // ────────────────────────────────────────────────────────────
  const [serverTrips, setServerTrips] = useState<Trip[]>([]);
  const [serverTripsLoaded, setServerTripsLoaded] = useState(false);
  const [ledgerOverview, setLedgerOverview] = useState<LedgerDriverOverview | null>(null);
  const [ledgerOverviewLoaded, setLedgerOverviewLoaded] = useState(false);
  const [repairInProgress, setRepairInProgress] = useState(false);
  const [repairResult, setRepairResult] = useState<any>(null);
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);
  const [tripGapDiagOpen, setTripGapDiagOpen] = useState(false);
  const [tripGapDiagResult, setTripGapDiagResult] = useState<any>(null);
  const [tripGapDiagLoading, setTripGapDiagLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAllDriverTrips = async () => {
      // === SINGLE OR QUERY: search all IDs + name at once ===
      try {
        const allIds: string[] = [driverId];
        if (driver?.uberDriverId) allIds.push(driver.uberDriverId);
        if (driver?.inDriveDriverId) allIds.push(driver.inDriveDriverId);
        const resolvedName = driver?.name || (driver?.firstName ? [driver.firstName, driver.lastName].filter(Boolean).join(' ') : '') || driverName || '';

        // Paginate in 1,000-trip pages to get ALL trips (PostgREST caps at 1,000)
        const PAGE_SIZE = 1000;
        const seen = new Set<string>();
        const merged: Trip[] = [];
        let pageOffset = 0;
        while (true) {
          const result = await api.getTripsFiltered({ driverIds: allIds, driverName: resolvedName || undefined, limit: PAGE_SIZE, offset: pageOffset }).catch(() => ({ data: [] as Trip[], total: 0 }));
          if (cancelled) return;
          const page = result.data || [];
          for (const trip of page) {
            if (trip.id && !seen.has(trip.id)) { seen.add(trip.id); merged.push(trip); }
          }
          // If we got fewer than PAGE_SIZE, we've fetched everything
          if (page.length < PAGE_SIZE) break;
          pageOffset += PAGE_SIZE;
          // Safety cap at 10,000 trips
          if (pageOffset >= 10000) break;
        }

        setServerTrips(merged);
      } catch (err) {
        console.error('[DriverDetail] Failed to fetch server trips:', err);
      } finally {
        if (!cancelled) setServerTripsLoaded(true);
      }
    };
    fetchAllDriverTrips();
    return () => { cancelled = true; };
  }, [driverId, driver?.uberDriverId, driver?.inDriveDriverId, driver?.name, driver?.firstName, driver?.lastName, driverName]);


  const allTrips = useMemo(() => {
    const seen = new Set<string>();
    const merged: Trip[] = [];
    for (const t of serverTrips) {
      if (t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    }
    for (const t of (trips || [])) {
      if (t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    }
    return merged;
  }, [serverTrips, trips]);
  
  // Phase 4: Payment Transactions
  // Cash Returned + Cash Write Offs (write-offs are not cash collected; shown so ops can undo them).
  const isBankTransferPaymentMethod = (pm?: string | null) => {
    const m = String(pm || '').toLowerCase().trim();
    return m === 'bank transfer' || m === 'mobile money' || m === 'check';
  };

  const paymentTransactions = useMemo(() => {
    return (transactions || [])
      .filter(
        (t) =>
          isDriverCashPaymentTransaction(t) ||
          isCashWriteOffTransaction(t) ||
          isDriverPayoutTransaction(t),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  // Cash received: physical cash collections + write-offs + cash payouts.
  const cashReceivedTransactions = useMemo(
    () =>
      paymentTransactions.filter((t) => {
        if (isCashWriteOffTransaction(t)) return true;
        if (isBankTransferPaymentMethod(t.paymentMethod)) return false;
        return isDriverCashPaymentTransaction(t) || isDriverPayoutTransaction(t);
      }),
    [paymentTransactions],
  );

  // Bank transfers: Log Cash / payouts via bank, mobile money, or check (incl. awaiting verify).
  const bankTransferTransactions = useMemo(
    () =>
      paymentTransactions.filter((t) => {
        if (isCashWriteOffTransaction(t)) return false;
        if (!isBankTransferPaymentMethod(t.paymentMethod)) return false;
        return isDriverCashPaymentTransaction(t) || isDriverPayoutTransaction(t);
      }),
    [paymentTransactions],
  );

  const [paymentsLogTab, setPaymentsLogTab] = useState<'cash' | 'bank'>('cash');

  // Group Payments Log rows by Settlement Week (period), newest period first, untagged last.
  const groupWalletPaymentsByWeek = (rows: typeof paymentTransactions) => {
    const groups = new Map<string, {
      key: string;
      label: string;
      sortKey: number;
      total: number;
      writeOffTotal: number;
      payoutTotal: number;
      rows: typeof paymentTransactions;
    }>();
    for (const tx of rows) {
      const s = tx.metadata?.workPeriodStart;
      const e = tx.metadata?.workPeriodEnd;
      const sd = s ? parseTripDate(String(s).split('T')[0]) : null;
      const ed = e ? parseTripDate(String(e).split('T')[0]) : null;
      const key = sd ? `${s}|${e || ''}` : '__untagged__';
      const label = sd
        ? (ed ? `${format(sd, 'MMM d')} – ${format(ed, 'MMM d, yyyy')}` : format(sd, 'MMM d, yyyy'))
        : 'Untagged';
      const sortKey = sd ? sd.getTime() : -Infinity;
      let g = groups.get(key);
      if (!g) {
        g = { key, label, sortKey, total: 0, writeOffTotal: 0, payoutTotal: 0, rows: [] };
        groups.set(key, g);
      }
      if (isCashWriteOffTransaction(tx)) g.writeOffTotal += Math.abs(Number(tx.amount) || 0);
      else if (isDriverPayoutTransaction(tx)) g.payoutTotal += Math.abs(Number(tx.amount) || 0);
      else g.total += Number(tx.amount) || 0;
      g.rows.push(tx);
    }
    return Array.from(groups.values()).sort((a, b) => b.sortKey - a.sortKey);
  };

  const groupedCashReceivedTransactions = useMemo(
    () => groupWalletPaymentsByWeek(cashReceivedTransactions),
    [cashReceivedTransactions],
  );
  const groupedBankTransferTransactions = useMemo(
    () => groupWalletPaymentsByWeek(bankTransferTransactions),
    [bankTransferTransactions],
  );

  const activePaymentTransactions =
    paymentsLogTab === 'cash' ? cashReceivedTransactions : bankTransferTransactions;
  const groupedPaymentTransactions =
    paymentsLogTab === 'cash' ? groupedCashReceivedTransactions : groupedBankTransferTransactions;

  // Periods collapsed by default; track which ones the user expanded.
  const [expandedPaymentGroups, setExpandedPaymentGroups] = useState<Set<string>>(new Set());
  const togglePaymentGroup = (key: string) => {
    setExpandedPaymentGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Phase 2: Tier from resolved earnings policy for this driver-week
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [quotaConfig, setQuotaConfig] = useState<QuotaConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadResolvedEarningsBundleForDriverWeek(driverId, undefined, serviceLineParam)
      .then((bundle) => {
        if (cancelled) return;
        setTiers(bundle.tiers || []);
        setQuotaConfig(bundle.quotas || null);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [driverId, serviceLineParam]);

  // Calculate Monthly Earnings & Current Tier (Independent of Date Range Selection)
  const { monthlyEarnings, currentTier } = useMemo(() => {
      const mEarnings = TierCalculations.calculateMonthlyEarnings(allTrips);
      const cTier = TierCalculations.getTierForEarnings(mEarnings, tiers);
      return { monthlyEarnings: mEarnings, currentTier: cTier };
  }, [allTrips, tiers]);

  // Money supporting data (tx / toll-logs) — RQ-cached; only when Financials or Cash Wallet is open.
  const moneyExpandedIds = React.useMemo(
    () =>
      expandDriverTransactionIds([
        driverId,
        driver?.uberDriverId,
        driver?.inDriveDriverId,
      ]),
    [driverId, driver?.uberDriverId, driver?.inDriveDriverId]
  );

  const {
    transactions: rqTransactions,
    loading: rqTxLoading,
  } = useDriverTransactions(moneyExpandedIds, { enabled: moneyTabActive });
  const {
    tollLogs: rqTollLogs,
    loading: rqTollLogsLoading,
  } = useDriverTollLogs(moneyExpandedIds, { enabled: moneyTabActive });

  const serverMergedTransactions = React.useMemo(() => {
    const validTx = Array.isArray(rqTransactions) ? rqTransactions.filter(Boolean) : [];
    const tollLogRows = Array.isArray(rqTollLogs) ? rqTollLogs : [];
    const mergedById = new Map<string, any>();
    for (const tx of validTx) if (tx?.id) mergedById.set(tx.id, tx);
    for (const tx of tollLogRows) if (tx?.id) mergedById.set(tx.id, tx);
    return Array.from(mergedById.values()) as FinancialTransaction[];
  }, [rqTransactions, rqTollLogs]);

  React.useEffect(() => {
    if (!moneyTabActive) return;
    if (rqTxLoading || rqTollLogsLoading) return;
    setTransactions(serverMergedTransactions);
  }, [moneyTabActive, serverMergedTransactions, rqTxLoading, rqTollLogsLoading]);


  // Cash Wallet "Cash still owed" reads the server period projection — refetch after cash writes.
  const invalidateFinancialPeriods = useInvalidateDriverFinancialPeriods();

  const handleSavePayment = async (payment: { 
    id?: string;
    amount: number; 
    date: string; 
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => {
      const newTx = buildCashCollectionTx(payment, {
        driverId,
        driverName: driver?.name || driverName,
      });
      
      if (payment.id) {
          const updatedTx = { ...newTx, id: payment.id };
          await api.saveTransaction(updatedTx);
          setTransactions(prev => prev.map(t => t.id === payment.id ? { ...t, ...updatedTx } as FinancialTransaction : t));
      } else {
          const saved = await api.saveTransaction(newTx);
          const savedTx = saved?.data || saved;
          setTransactions(prev => [savedTx, ...prev].filter(Boolean));
      }
      void invalidateFinancialPeriods(driverId);
  };

  const handleSaveCashWriteOff = async (payload: CashWriteOffSavePayload) => {
      if (payload.amount > writeOffModalState.maxAmount + 0.005) {
        throw new Error(`Cannot write off more than cash still owed (${writeOffModalState.maxAmount.toFixed(2)})`);
      }
      const newTx = buildCashWriteOffTx(payload, {
        driverId,
        driverName: driver?.name || driverName,
      });
      const saved = await api.saveTransaction(newTx);
      const savedTx = saved?.data || saved;
      setTransactions(prev => [savedTx, ...prev].filter(Boolean));
      void invalidateFinancialPeriods(driverId);
  };

  const handleSaveDriverPayout = async (payload: RecordPayoutSavePayload) => {
      if (payload.amount > payoutModalState.maxAmount + 0.005) {
        throw new Error(`Cannot pay more than fleet owes (${payoutModalState.maxAmount.toFixed(2)})`);
      }
      const newTx = buildDriverPayoutTx(payload, {
        driverId,
        driverName: driver?.name || driverName,
      });
      const saved = await api.saveTransaction(newTx);
      const savedTx = saved?.data || saved;
      setTransactions(prev => [savedTx, ...prev].filter(Boolean));
      void invalidateFinancialPeriods(driverId);
  };

  const handleEditTransaction = (tx: FinancialTransaction) => {
      setPaymentModalState({
          isOpen: true,
          editingTransaction: tx
      });
  };

  const handleVerifyTransaction = async (id: string) => {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;

      try {
          // Optimistic update
          const updatedTx = { ...tx, status: 'Verified' as const };
          setTransactions(prev => prev.map(t => t.id === id ? updatedTx : t));

          // Persist
          await api.saveTransaction(updatedTx);
          void invalidateFinancialPeriods(driverId);
          toast.success("Transaction verified");
      } catch (e) {
          console.error("Failed to verify transaction", e);
          toast.error("Failed to verify transaction");
          // Revert on failure
          setTransactions(prev => prev.map(t => t.id === id ? tx : t));
      }
  };

  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  const confirmDeleteTransaction = async () => {
      if (!transactionToDelete) return;

      // Optimistic Update
      const originalTransactions = [...transactions];
      setTransactions(prev => prev.filter(t => t.id !== transactionToDelete));

      try {
          await api.deleteTransaction(transactionToDelete);
          void invalidateFinancialPeriods(driverId);
          toast.success(
            isCashWriteOffTransaction(originalTransactions.find((t) => t.id === transactionToDelete))
              ? 'Write-off undone'
              : 'Transaction deleted',
          );
      } catch (e) {
          setTransactions(originalTransactions);
          console.error("Failed to delete transaction", e);
          toast.error("Failed to delete transaction");
      } finally {
          setTransactionToDelete(null);
      }
  };

  const handleDeleteTransaction = (id: string) => {
      setTransactionToDelete(id);
  };

  const documents = useMemo(() => buildDriverDocuments(driver), [driver]);

  const vehicleLabel = useMemo(() => {
    const fromDriver = String(driver?.vehicle || '').trim();
    if (fromDriver && fromDriver !== 'Unassigned') return fromDriver;
    return null;
  }, [driver?.vehicle]);

  const memberSinceLabel = useMemo(() => {
    const raw = driver?.createdAt || driver?.joinedAt || driver?.memberSince || driver?.created_at;
    if (!raw) return null;
    const d = parseTripDate(String(raw));
    return d ? format(d, 'MMM d, yyyy') : null;
  }, [driver]);

  const cancelledTripsInPeriod = useMemo(() => {
    if (!dateRange?.from) return [] as Trip[];
    const start = startOfDay(dateRange.from);
    const end = endOfDay(dateRange.to || dateRange.from);
    return allTrips.filter((t) => {
      if (t.status !== 'Cancelled') return false;
      const d = parseTripDate((t as any).requestTime || t.date);
      return d ? isWithinInterval(d, { start, end }) : false;
    }).slice(0, 25);
  }, [allTrips, dateRange]);
  
  // ── Ledger driver-overview fetch (Phase 14 — date-range aware) ──
  useEffect(() => {
    if (!ledgerDateRangeStrings) return;
    let cancelled = false;
    const fetchLedgerOverview = async () => {
      try {
        const { startDate, endDate } = ledgerDateRangeStrings;
        const platforms = selectedPlatforms.has('All') ? undefined : Array.from(selectedPlatforms);
        const result = await api.getLedgerDriverOverview({
          driverId,
          startDate,
          endDate,
          platforms,
        });
        if (!cancelled) {
          setLedgerOverview(result);
        }
      } catch (err) {
        console.error('[DriverDetail LEDGER] Overview fetch failed (non-blocking):', err);
      } finally {
        if (!cancelled) setLedgerOverviewLoaded(true);
      }
    };
    setLedgerOverviewLoaded(false);
    fetchLedgerOverview();
    return () => { cancelled = true; };
  }, [driverId, ledgerDateRangeStrings, selectedPlatforms, ledgerRefreshKey]);

  // Uber recon ledger side — same Financials from/to as SSOT (not Overview dateRange).
  const [financialUberLedger, setFinancialUberLedger] = useState<LedgerDriverOverview['period']['uber'] | null>(null);
  useEffect(() => {
    if (!moneyTabActive || !financialDateRangeStrings) {
      setFinancialUberLedger(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await api.getLedgerDriverOverview({
          driverId,
          startDate: financialDateRangeStrings.startDate,
          endDate: financialDateRangeStrings.endDate,
        });
        if (!cancelled) setFinancialUberLedger(result?.period?.uber || null);
      } catch (err) {
        console.error('[DriverDetail] Financial-period Uber ledger fetch failed:', err);
        if (!cancelled) setFinancialUberLedger(null);
      }
    })();
    return () => { cancelled = true; };
  }, [driverId, moneyTabActive, financialDateRangeStrings, ledgerRefreshKey]);

  // Calculate Metrics based on Date Range
   // Phase 7 NOTE: This useMemo computes THREE categories of data:
   //   1. LEGACY FINANCIAL — periodEarnings, cashCollected, totalTolls, weeklyEarningsData, etc.
   //      Only consumed by the resolvedFinancials fallback path + metrics.earningsPerKm.
   //      DriverPayoutHistory migrated to ledger in Phase 8 — no longer a consumer.
   //   2. OPERATIONAL — totalDistance, totalDuration, completionRate, distanceMetrics, tripRatio,
   //      fuelMetrics, platformStats.completed/distance/rating. Used by Efficiency + Trips tabs.
   //   3. CASH WALLET — floatHeld, pendingClearance, approvedFuelCredits, cashReceived (still live).
   //      Phase 5: netOutstanding/periodCashReceived/periodNetChange removed — cash wash lives on period SSOT.
  const metrics = useMemo(() => {
     const emptyMetrics = {
        periodEarnings: 0,
        prevPeriodEarnings: 0,
        trendPercent: "0.0",
        trendUp: true,
        totalEarnings: 0,
        lifetimeTrips: 0,
        totalTrips: 0,
        totalCashCollected: 0,
        lifetimeTolls: 0,
        periodCompletedTrips: 0,
        periodCancelledTrips: 0,
        cashCollected: 0,
        totalDistance: 0,
        totalDuration: 0,
        netTollReimbursement: 0,
        disputeCharges: 0,
        fuelSpend: 0,
        earningsPerKm: 0,
        avgDuration: 0,
        approvedFuelCredits: 0,
        floatHeld: 0,
        pendingClearance: 0,
        acceptanceRate: 0,
        currentRating: 0,
        completionRate: 0,
        cancellationRate: 0,
        totalTolls: 0,
        totalTips: 0,
        totalBaseFare: 0,
        platformStats: {
            Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
            InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
            Roam: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
            Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 }
        },
        tripRatio: {
            available: 0,
            toTrip: 0,
            onTrip: 0,
            unavailable: 0,
            totalOnline: 0
        },
        distanceMetrics: {
            open: 0,
            enroute: 0,
            onTrip: 0,
            unavailable: 0,
            riderCancelled: 0,
            driverCancelled: 0,
            deliveryFailed: 0,
            total: 0
        },
        fuelMetrics: {
            rideShare: 0,
            companyOps: 0,
            personal: 0,
            misc: 0,
            total: 0
        },
        uberCsvCashCollectedMagnitude: null as number | null,
        perPlatformDistance: {} as Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number; total: number }>
     };

     if (!dateRange?.from) return emptyMetrics;

     const start = startOfDay(dateRange.from);
     const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
     const daysDiff = differenceInDays(end, start) + 1;
     
     // Previous Period for Trend
     const prevStart = subDays(start, daysDiff);
     const prevEnd = subDays(end, daysDiff);

     let periodEarnings = 0;
     let prevPeriodEarnings = 0;
     
     let totalEarnings = 0; // Lifetime
     let lifetimeTrips = 0; // Lifetime
     let totalCashCollected = 0; // Lifetime trip-cash fallback for metrics.totalCashCollected
     let lifetimeTolls = 0; // Lifetime

     let periodCompletedTrips = 0;
     let periodCancelledTrips = 0;
     let cashCollected = 0;
     
     // Efficiency Metrics
     let totalDistance = 0;
     let totalDuration = 0; // minutes
     
     // Phase 3: Fleet Efficiency Accumulators (Pre-Calculated from Import)
     let sumOnTripHours = 0;
     let sumToTripHours = 0;
     let sumAvailableHours = 0;
     let sumTotalHours = 0;
     
     const hoursDistribution = new Array(24).fill(0);

     // Breakdown
     let totalBaseFare = 0;
     let totalTips = 0;
     let totalTolls = 0;

     // Platform Stats
     const platformStats: Record<string, any> = {
        Uber: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        InDrive: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        Roam: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 },
        Other: { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 }
     };

     // Chart Data Map
     const chartDataMap = new Map<string, Record<string, number>>();
     
     try {
         const days = eachDayOfInterval({ start, end });
         days.forEach(d => {
             const initialDayStats: Record<string, number> = {};
             Object.keys(platformStats).forEach(k => initialDayStats[k] = 0);
             chartDataMap.set(format(d, 'yyyy-MM-dd'), initialDayStats);
         });
     } catch (e) { }

     // --- Phase 3: Ratio-Reconstruction Algorithm ---
     // We no longer need to calculate "Report Duration" because we use the Efficiency Ratio method.
     // This ignores mismatched file dates and focuses on the Driver's Performance Profile.

     const filteredTrips = allTrips.filter(t => {
         if (selectedPlatforms.has('All') || selectedPlatforms.has(t.platform || 'Other')) { const timeScoped = activeTab === 'overview'; if (timeScoped && timeFilter.preset !== 'all') { const h = new Date(t.date).getHours(); if (!isHourInTimeFilter(h, timeFilter)) return false; } return true; } return false;
         // time+platform filter handled above
     });

     filteredTrips.forEach(trip => {
        const tripDateObj = new Date(trip.date);
        if (isNaN(tripDateObj.getTime())) return;
        
        // Physical cash: explicit cashCollected or paymentMethod Cash only (not all Roam trips).
        const effectiveCash = getTripPhysicalCashCollected(trip);

        // Lifetime stats
        // For InDrive trips with fee data, use true profit (net income) instead of full fare
        totalEarnings += (trip.platform === 'InDrive' && trip.indriveNetIncome != null)
          ? trip.indriveNetIncome
          : trip.amount;
        lifetimeTrips += 1;
        if (effectiveCash) totalCashCollected += Math.abs(effectiveCash);
        // Only count tolls as debt if they weren't collected in cash (assuming cash collected includes toll reimbursement)
        // If it's a card trip (no cash collected), the driver received the toll refund in their payout, so they owe it back.
        if (trip.tollCharges && !effectiveCash) {
            lifetimeTolls += trip.tollCharges;
        }

        // Filter Check
        // Effective earnings: use true profit for InDrive trips with fee data
        const effectiveEarnings = (trip.platform === 'InDrive' && trip.indriveNetIncome != null)
          ? trip.indriveNetIncome
          : trip.amount;

        // Period totals for Roam/InDrive/Uber (trip side): strict trip.date in [start,end]. This is why a 1-day
        // filter works predictably for trip-native platforms. Ledger-led Uber totals (ledgerOverview) use
        // canonicalEventInSelectedWindow on ledger_event — different date semantics; see ledgerMoneyAggregate.ts.
        if (isWithinInterval(startOfDay(tripDateObj), { start, end })) {
            periodEarnings += effectiveEarnings;
            
            const platform = normalizePlatform(trip.platform);
            if (!platformStats[platform]) {
                platformStats[platform] = { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 };
            }
            const pStats = platformStats[platform];

            // Platform Stats
            pStats.earnings += effectiveEarnings;
            pStats.trips += 1;
            
            if (trip.status === 'Completed') {
                periodCompletedTrips++;
                pStats.completed++;
            }
            if (trip.status === 'Cancelled') periodCancelledTrips++;
            if (effectiveCash) {
                const amount = Math.abs(effectiveCash);
                cashCollected += amount;
                pStats.cashCollected = (pStats.cashCollected || 0) + amount;
            }
            
            if (trip.distance) {
                totalDistance += trip.distance;
                pStats.distance += trip.distance;
            }
            if (trip.duration) totalDuration += trip.duration;
            
            // Phase 3: Sum pre-calculated hours (Static Reconstruction)
            sumOnTripHours += trip.onTripHours || 0;
            sumToTripHours += trip.toTripHours || 0;
            sumAvailableHours += trip.availableHours || 0;
            sumTotalHours += trip.totalHours || 0;

            // Hourly Distribution
            const h = tripDateObj.getHours();
            hoursDistribution[h]++;

            // Chart Data
            const dateKey = format(tripDateObj, 'yyyy-MM-dd');
            if (chartDataMap.has(dateKey)) {
                const dayData = chartDataMap.get(dateKey)!;
                dayData[platform] = (dayData[platform] || 0) + trip.amount;
            }

            // Breakdown
            if (trip.fareBreakdown) {
                totalBaseFare += trip.fareBreakdown.baseFare || 0;
                totalTips += trip.fareBreakdown.tips || 0;
            } else {
                totalBaseFare += trip.amount;
            }
            
            if (trip.tollCharges) {
                totalTolls += trip.tollCharges;
                pStats.tolls = (pStats.tolls || 0) + trip.tollCharges;
            }
        }

        // Previous Period Check
        if (isWithinInterval(startOfDay(tripDateObj), { start: prevStart, end: prevEnd })) {
            prevPeriodEarnings += effectiveEarnings;
        }
     });

     // --- Phase 2: Dynamic Reconstruction (Source of Truth: Trip Logs) ---
     // Filter and Sort Trips using the Utility
     const sortedPeriodTrips = getSortedTripsInRange(filteredTrips, start, end);
     
     // PHASE 2.1: EXTRACT CSV SOURCE OF TRUTH (If Applicable)
     // CRITICAL: Only apply this override if "All" platforms are selected.
     const isAllPlatforms = selectedPlatforms.has('All');
     
     const relevantCsvMetrics = (isAllPlatforms && csvMetrics) ? csvMetrics.filter(m => {
        if (!isValidDriverMetricPeriod(m)) return false;
        const mStart = new Date(m.periodStart);
        const mEnd = new Date(m.periodEnd);
        return mStart <= end && mEnd >= start;
     }) : [];

     /** Sum of `payments_driver`-sourced rows overlapping the period (CSV visual template / statement totals). */
     const uberPaymentCsvRollup = (() => {
       const rows = relevantCsvMetrics.filter(
         (m) => Array.isArray(m.dataSources) && m.dataSources.includes('payment'),
       );
       if (rows.length === 0) return null;
       let totalEarnings = 0;
       let refundsAndExpenses = 0;
       let netEarnings = 0;
       let cashCollected = 0;
       for (const m of rows) {
         const te = Number(m.totalEarnings) || 0;
         const re = Number(m.refundsAndExpenses) || 0;
         totalEarnings += te;
         refundsAndExpenses += re;
         netEarnings += m.netEarnings != null ? Number(m.netEarnings) : te - re;
         cashCollected += Number(m.cashCollected) || 0;
       }
       return { totalEarnings, refundsAndExpenses, netEarnings, cashCollected };
     })();

     // Initialize Accumulators for Reconstruction
     let recOnTripTime = 0; // Hours
     let recOnTripDist = 0; // Km
     let recEnrouteTime = 0; // Hours
     let recEnrouteDist = 0; // Km
     let recOpenTime = 0; // Hours
     let recOpenDist = 0; // Km
     let recUnavailableTime = 0; // Hours
     let recUnavailableDist = 0; // Km
     let recRiderCancelledDist = 0; // Km
     let recDriverCancelledDist = 0; // Km
     let recDeliveryFailedDist = 0; // Km
      const perPlatformDistanceAccum: Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number }> = {};

     sortedPeriodTrips.forEach(trip => {
         // Per-platform distance accumulation
          const tripPlatform = normalizePlatform(trip.platform);
          if (!perPlatformDistanceAccum[tripPlatform]) { perPlatformDistanceAccum[tripPlatform] = { open: 0, enroute: 0, onTrip: 0, unavailable: 0, riderCancelled: 0, driverCancelled: 0, deliveryFailed: 0 }; }
          // Only process Completed trips for "On Trip" metrics
         if (trip.status === 'Completed') {
             // 1. On Trip Time & Distance
             // Time: (Dropoff - Pickup) or Trip Duration Column
             let tripDurationHours = 0;
             const pickupTime = parseTripDate(trip.pickupTime);
             const dropoffTime = parseTripDate(trip.dropoffTime);
             
             if (pickupTime && dropoffTime) {
                 tripDurationHours = (dropoffTime.getTime() - pickupTime.getTime()) / (1000 * 60 * 60);
             } else if (trip.duration) {
                 tripDurationHours = trip.duration / 60; // duration is in minutes usually
             }
             
             // Sanity Check: If duration is negative or > 12 hours, clamp
             tripDurationHours = Math.max(0, Math.min(tripDurationHours, 12));
             
             recOnTripTime += tripDurationHours;
             recOnTripDist += (trip.distance || 0);
              perPlatformDistanceAccum[tripPlatform].onTrip += (trip.distance || 0);
             
             // 2. Enroute Time & Distance
             // Time: (Pickup - Request)
             // Fallback: (Dropoff - Request) - Trip Duration
             let enrouteDurationHours = 0;
             const requestTime = parseTripDate((trip as any).requestTime || trip.date);
             
             if (requestTime) {
                 if (pickupTime) {
                     enrouteDurationHours = (pickupTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
                 } else if (dropoffTime && tripDurationHours > 0) {
                     const totalTime = (dropoffTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
                     enrouteDurationHours = totalTime - tripDurationHours;
                 }
             }
             
             // Sanity Check: Enroute shouldn't be negative or excessively long (> 2 hours)
             enrouteDurationHours = Math.max(0, Math.min(enrouteDurationHours, 2));

             // FIX: If enroute is 0 (missing timestamps), assume average 5 mins (0.083h)
             if (enrouteDurationHours === 0) {
                 enrouteDurationHours = 0.083;
             }
             
             recEnrouteTime += enrouteDurationHours;
             
             // Distance: Use Pre-Calculated Uniform Average
             const enrouteDistance = trip.normalizedEnrouteDistance ?? estimateEnrouteFallback(trip);
             
             recEnrouteDist += enrouteDistance;
              perPlatformDistanceAccum[tripPlatform].enroute += enrouteDistance;
             
             // NEW: Open Distance from Pre-Calculated Average (if available)
             // We prioritize the CSV-derived uniform average over the Gap Analysis estimate
             if (trip.normalizedOpenDistance) {
                 recOpenDist += trip.normalizedOpenDistance;
                  perPlatformDistanceAccum[tripPlatform].open += trip.normalizedOpenDistance;
             }
             
             // NEW: Unavailable Distance from Pre-Calculated Average
             if (trip.normalizedUnavailableDistance) {
                 recUnavailableDist += trip.normalizedUnavailableDistance;
                  perPlatformDistanceAccum[tripPlatform].unavailable += trip.normalizedUnavailableDistance;
             }
         } else if (trip.status === 'Cancelled' && (trip.distance || 0) > 0) {
             // Handle Cancellation Distance (Lost Km)
             const reason = (trip.cancellationReason || '').toLowerCase();
             const dist = trip.distance || 0;
             
             if (reason.includes('rider')) {
                  perPlatformDistanceAccum[tripPlatform].riderCancelled += dist;
                 recRiderCancelledDist += dist;
             } else if (reason.includes('driver')) {
                 recDriverCancelledDist += dist;
                  perPlatformDistanceAccum[tripPlatform].driverCancelled += dist;
             } else if (reason.includes('delivery_failed') || reason.includes('failed')) {
                 recDeliveryFailedDist += dist;
                  perPlatformDistanceAccum[tripPlatform].deliveryFailed += dist;
             } else {
                 // Fallback if generic cancelled with distance
                  // Also count as riderCancelled per-platform
                 recRiderCancelledDist += dist;
                  perPlatformDistanceAccum[tripPlatform].riderCancelled += dist; 
             }
         }
     });

     // Build finalized per-platform distance metrics with totals
      const perPlatformDistance: Record<string, { open: number; enroute: number; onTrip: number; unavailable: number; riderCancelled: number; driverCancelled: number; deliveryFailed: number; total: number }> = {};
      for (const [plat, acc] of Object.entries(perPlatformDistanceAccum)) { perPlatformDistance[plat] = { ...acc, total: acc.open + acc.enroute + acc.onTrip + acc.unavailable + acc.riderCancelled + acc.driverCancelled + acc.deliveryFailed }; }

      // Prepare Charts Data
     const weeklyEarningsData = Array.from(chartDataMap.entries()).filter(([date]) => !!date).map(([date, amounts]) => {
         const d = new Date(date);
         return {
             day: format(d, 'MMM d'),
             fullDate: date,
             ...amounts
         };
     });

     // --- Phase 3: Gap Analysis (Open vs Unavailable) ---
     
     // Gap Thresholds
     const GAP_THRESHOLD_MINS = OPS_GAP_THRESHOLD_MINS;
     const GAP_THRESHOLD_HOURS = GAP_THRESHOLD_MINS / 60;
     const MIN_UNAVAILABLE_BLOCK_HOURS = OPS_MIN_UNAVAILABLE_BLOCK_HOURS;
     const AVG_OPEN_SPEED = AVG_OPEN_SPEED_KMH; // km/h (Cruising for fares)
     // const AVG_PERSONAL_SPEED = 30; // REMOVED: Causing inflation

     // Helper: Add gap to appropriate bucket
     const processGap = (gapHours: number) => {
         if (gapHours <= 0) return;

         if (gapHours > MIN_UNAVAILABLE_BLOCK_HOURS) {
             // Huge gap -> Unavailable (Sleep/Shift End)
             recUnavailableTime += gapHours;
             recUnavailableDist += 0; // FIX: Assume 0km (Parked/Sleeping)
         } else if (gapHours > GAP_THRESHOLD_HOURS) {
             // Medium gap -> Personal/Break (Unavailable)
             recUnavailableTime += gapHours;
             recUnavailableDist += 0; // FIX: Assume 0km (Parked/Eating)
         } else {
             // Small gap -> Open (Waiting for fare)
             recOpenTime += gapHours;
             // recOpenDist += (gapHours * AVG_OPEN_SPEED); // REMOVED: Replaced by CSV Uniform Average Strategy
             recOpenDist += 0; 
         }
     };

     // Iterate through sorted trips to find gaps
     for (let i = 0; i < sortedPeriodTrips.length - 1; i++) {
         const currentTrip = sortedPeriodTrips[i];
         const nextTrip = sortedPeriodTrips[i+1];

         // End of Current Trip (Dropoff or Date + Duration)
         let currentEnd = parseTripDate(currentTrip.dropoffTime);
         if (!currentEnd && currentTrip.duration) {
             const start = parseTripDate((currentTrip as any).requestTime || currentTrip.date);
             if (start) currentEnd = new Date(start.getTime() + (currentTrip.duration * 60000));
         }

         // Start of Next Trip (Request Time)
         const nextStart = parseTripDate((nextTrip as any).requestTime || nextTrip.date);

         if (currentEnd && nextStart && nextStart > currentEnd) {
             const gapHours = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60);
             processGap(gapHours);
         }
     }
     
     // Handle Start/End of Period Boundaries?
     // For now, we only analyze gaps BETWEEN trips to be conservative.
     // Leading/Trailing time in the selected period is ignored unless we have shift logs.

     // --- End Phase 3 ---

     // --- Phase 4: Fuel Metric Finalization ---
     
     // PHASE 2 FIX: USE IMPORTED METRICS IF AVAILABLE
     // "Normalization Strategy": Use Trip Logs for shape (time distribution) but CSV Report for volume (totals).
     // This ensures the dashboard matches the official report exactly.
     // CRITICAL: Only apply this override if "All" platforms are selected. 
     // We cannot split the CSV total by platform, so for filtered views, we must rely on the log reconstruction.
     // (isAllPlatforms and relevantCsvMetrics are defined above)

     // Check if we have valid CSV metrics for distance (Source: driver_time_and_distance.csv)
     const hasCsvDistance = relevantCsvMetrics.some(m => (m.onTripDistance || 0) > 0);

     if (hasCsvDistance) {
         let csvOpenDist = 0;
         let csvEnrouteDist = 0;
         let csvOnTripDist = 0;
         let csvUnavailableDist = 0;
         
         let csvOpenTime = 0;
         let csvEnrouteTime = 0;
         let csvOnTripTime = 0;
         let csvUnavailableTime = 0;

         relevantCsvMetrics.forEach(m => {
             // Sum up metrics (e.g. if we have 7 daily records for a week selection)
             csvOpenDist += m.openDistance || 0;
             csvEnrouteDist += m.enrouteDistance || 0;
             csvOnTripDist += m.onTripDistance || 0;
             csvUnavailableDist += m.unavailableDistance || 0;
             
             // Time Override (if available in CSV)
             csvOpenTime += m.openTime || 0;
             csvEnrouteTime += m.enrouteTime || 0;
             csvOnTripTime += m.onTripHours || 0; 
             csvUnavailableTime += m.unavailableTime || 0;
         });
         
         // --- APPLING THE FIX ---
         
         // 1. On Trip Distance: Force match the CSV report
         recOnTripDist = csvOnTripDist; 
         
         // 2. Other Distances: Force match the CSV report
         // recOpenDist = csvOpenDist; // Handled per-trip via Uniform Average
         // recEnrouteDist is already calculated via Uniform Average in the loop (if isAllPlatforms is true), 
         // so it naturally sums to csvTotalEnroute (which is csvEnrouteDist).
         // We do NOT override it here to respect the per-trip distribution.
         // recEnrouteDist = csvEnrouteDist; 
         // recUnavailableDist = csvUnavailableDist; // Handled per-trip via Uniform Average
         
         // 3. Time Metrics: Force match the CSV report (if populated)
         // if (csvOnTripTime > 0) recOnTripTime = csvOnTripTime; // DISABLED: User wants "On Trip" time to come strictly from Trip Activity Logs
         if (csvEnrouteTime > 0) recEnrouteTime = csvEnrouteTime;
         if (csvOpenTime > 0) recOpenTime = csvOpenTime;
         if (csvUnavailableTime > 0) recUnavailableTime = csvUnavailableTime;
     }

     const vehicleEconomy =
       (vehicleMetrics || []).find((v: any) => v?.fuel_economy_km_per_l != null)?.fuel_economy_km_per_l ??
       (driver as any)?.fuelEconomyKmPerL ??
       null;
     const FUEL_EFFICIENCY_KMPL = resolveFuelEconomyKmPerL(vehicleEconomy);
     
     // 1. Calculate Fuel Splits based on Reconstructed Distance
     const fuelRideShare = (recOnTripDist + recEnrouteDist) / FUEL_EFFICIENCY_KMPL;
     const fuelCompanyOps = recOpenDist / FUEL_EFFICIENCY_KMPL;
     const fuelPersonal = recUnavailableDist / FUEL_EFFICIENCY_KMPL;
     const fuelTotalEst = fuelRideShare + fuelCompanyOps + fuelPersonal;

     // 2. Override Legacy Variables with New Reconstructed Data
     // This ensures the dashboard UI updates automatically without changing JSX structure yet
     
     // Update Distance Metrics object (used by Fuel Usage Split Tile)
     const reconstructedDistanceMetrics = {
         open: recOpenDist,
         enroute: recEnrouteDist,
         onTrip: recOnTripDist,
         unavailable: recUnavailableDist,
         riderCancelled: recRiderCancelledDist,
         driverCancelled: recDriverCancelledDist,
         deliveryFailed: recDeliveryFailedDist,
         total: recOpenDist + recEnrouteDist + recOnTripDist + recUnavailableDist + recRiderCancelledDist + recDriverCancelledDist + recDeliveryFailedDist
     };

     // Update Fuel Metrics object
     const reconstructedFuelMetrics = {
         rideShare: fuelRideShare,
         companyOps: fuelCompanyOps,
         personal: fuelPersonal,
         misc: 0,
         total: fuelTotalEst
     };

     // Update Time Metrics (used by Utilization Chart)
     // We replace the static CSV sums with our dynamic reconstruction
     const reconstructedTimeMetrics = {
         onTrip: recOnTripTime,
         toTrip: recEnrouteTime,
         available: recOpenTime,
         unavailable: recUnavailableTime,
         totalOnline: recOnTripTime + recEnrouteTime + recOpenTime
     };

     // --- End Phase 4 ---
     
     // Earnings Breakdown Data
     const earningsBreakdownData = [
        { name: 'Base Fare', value: totalBaseFare, color: '#4f46e5' },
        { name: 'Tips', value: totalTips, color: '#10b981' },
     ].filter(d => d.value > 0);

     // Hourly Activity Data
     const hourlyActivityData = hoursDistribution.map((count, hour) => ({
         hour: `${hour}:00`,
         trips: count
     }));

     // Trend
     const trendPercent = prevPeriodEarnings > 0 
        ? ((periodEarnings - prevPeriodEarnings) / prevPeriodEarnings) * 100 
        : periodEarnings > 0 ? 100 : 0;

     // Derived Efficiency Metrics
     const totalTrips = periodCompletedTrips + periodCancelledTrips;
     const avgDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;
     const avgDuration = totalTrips > 0 ? totalDuration / totalTrips : 0;
     const earningsPerKm = 0; // Phase 6: Moved to hybrid metric (resolvedFinancials / totalDistance)
     const tripsPerHour = totalDuration > 0 ? (totalTrips / (totalDuration / 60)) : 0;

     // Completion / cancellation / acceptance (pure helper)
     const latestCsvMetric = relevantCsvMetrics.length > 0 
        ? [...relevantCsvMetrics].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]
        : null;

     const { completionRate, cancellationRate, acceptanceRate } = computeServiceQualityRates(
       { completed: periodCompletedTrips, cancelled: periodCancelledTrips },
       latestCsvMetric?.acceptanceRate,
     );
     
     const currentRating = latestCsvMetric?.ratingLast4Weeks || latestCsvMetric?.ratingLast500 || 5.0;

     // Lifetime trip-cash override for metrics.totalCashCollected
     if (latestCsvMetric?.cashCollected) {
         totalCashCollected = Math.max(totalCashCollected, latestCsvMetric.cashCollected);
     }

     // Phase 4: Cash Logic

     // cashCollected override — used by wallet metrics and period earnings fallback
     // Calculate cash from CSV only if the selected range covers the CSV period
     const csvPeriodCash = relevantCsvMetrics.reduce((sum, m) => {
        // Uber payment statement cash is applied only via resolveUberPeriodCashCollected.
        if (isUberCashEligibleMetricPeriod(m) && m.dataSources?.includes('payment')) {
          return sum;
        }
        const mStart = new Date(m.periodStart);
        const mEnd = new Date(m.periodEnd);
        
        // Calculate effective overlap duration
        const overlapStart = mStart > start ? mStart : start;
        const overlapEnd = mEnd < end ? mEnd : end;
        
        // Ensure valid overlap
        if (overlapStart > overlapEnd) return sum;

        const reportDays = differenceInDays(mEnd, mStart) + 1;
        const overlapDays = differenceInDays(overlapEnd, overlapStart) + 1;

        // Use CSV if overlap covers almost the entire report (allow 1 day margin)
        // This includes "Dec 8-14" (7 days) for a 7-day report
        // But excludes "Dec 8" (1 day) for a 7-day report
        if (overlapDays >= reportDays - 1) {
            return sum + (m.cashCollected || 0);
        }
        return sum;
     }, 0);
     
     // If CSV data exists, use it to override or floor the trip-calculated cash
     // This handles cases where trips might include adjustments (negative) but CSV reports actual collection
     if (csvPeriodCash > 0) {
         cashCollected = Math.max(cashCollected, csvPeriodCash);
     }

     // --- Phase 1: STRICT Cash Liability Logic ---
     
     // 2. Calculate Payments Received (Cash returned to fleet)
     // Strictly look for 'Payment_Received' type or 'Cash Collection' category.
     // These are positive values (money entering fleet).
     const totalPaymentsReceived = (transactions || [])
        .filter(isDriverCashPaymentTransaction)
        .reduce((sum, t) => sum + (t?.amount || 0), 0);

     // 3b. Fuel reimbursements from Finalize only (exclude orphan approve-time credits)
     const approvedFuelCredits = (transactions || [])
        .filter(t => {
            if (!t) return false;
            if (t.category === 'Fuel Reimbursement Credit') return false; // approve-era orphans
            if (t.metadata?.settlementType === 'RideShare_Cash_Offset') return false; // portal early posts
            const isFuelCredit =
              t.category === 'Fuel Reimbursement' ||
              t.category === 'Fuel Settlement Credit' ||
              t.category === 'Fuel Settlement';
            return isFuelCredit && t.amount > 0;
        })
        .reduce((sum, t) => sum + (t?.amount || 0), 0);

     // Note: totalCashCollected is Lifetime, calculated earlier in the loop.
     const cashReceived = totalPaymentsReceived;

     // Wallet State Logic (Phase 5)
     // Float Held: Total sum of negative transactions categorized as "Float Issue"
     // Note: In transactions, floats are negative.
     const floatHeld = Math.abs((transactions || [])
        .filter(t => t && t.category === "Float Issue")
        .reduce((sum, t) => sum + (t?.amount || 0), 0));

     // Pending Clearance: Log Cash bank/mobile/check still awaiting Verify — not every Pending tx.
     const pendingClearance = (transactions || [])
        .filter((t) => {
          if (!t || !isDriverCashPaymentTransaction(t)) return false;
          if (String(t.status || '').toLowerCase().trim() !== 'pending') return false;
          const pm = String(t.paymentMethod || 'Cash').toLowerCase().trim();
          return pm !== 'cash' && pm !== '';
        })
        .reduce((sum, t) => sum + (t?.amount || 0), 0);

     // Trip Ratio Logic (from Vehicle Metrics)
     // Solution 1: "The Bridge" - Link Driver to Vehicle via Trips
     const activePlates = new Set<string>();
     
     // 1. Identify vehicles driven in this period from Trip Logs
     allTrips.forEach(trip => {
         let tripDateObj: Date;
         if (typeof trip.date === 'string') {
            if (trip.date.includes('T')) {
                tripDateObj = new Date(trip.date);
            } else if (trip.date.includes('/')) {
                const parts = trip.date.split('/');
                if (parts.length === 3) {
                    const p1 = parseInt(parts[0]);
                    const p2 = parseInt(parts[1]);
                    const p3 = parseInt(parts[2]);
                    if (p1 > 12) {
                        tripDateObj = new Date(p3, p2 - 1, p1);
                    } else {
                        tripDateObj = new Date(p3, p1 - 1, p2);
                    }
                } else {
                    tripDateObj = new Date(trip.date);
                }
            } else if (trip.date.includes('-') && trip.date.length === 10) {
                const [y, m, d] = trip.date.split('-').map(Number);
                tripDateObj = new Date(y, m - 1, d);
            } else {
                tripDateObj = new Date(trip.date);
            }
         } else {
            tripDateObj = new Date(trip.date);
         }
         if (isWithinInterval(tripDateObj, { start, end }) && trip.vehicleId) {
             // Normalize plate (remove spaces, uppercase)
             activePlates.add(trip.vehicleId.replace(/[\s-]/g, '').toUpperCase());
         }
     });

     let relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
         const vmStart = new Date(vm.periodStart);
         const vmEnd = new Date(vm.periodEnd);
         // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
         const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
         
         const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
         // Check if this vehicle matches any plate from the driver's trips
         const matchesTripPlate = Array.from(activePlates).some(p => vmPlate.includes(p));
         
         return overlaps && matchesTripPlate;
     }) || [];

     // 2. Fallback: If no trips (so no bridge), try the static profile assignment
     if (relevantVehicleMetrics.length === 0 && driver?.vehicle) {
         let profilePlate = driver.vehicle;
         const parenMatch = profilePlate.match(/\((.*?)\)/);
         if (parenMatch) profilePlate = parenMatch[1];
         profilePlate = profilePlate.replace(/[\s-]/g, '').toUpperCase();

         relevantVehicleMetrics = vehicleMetrics?.filter(vm => {
             const vmStart = new Date(vm.periodStart);
             const vmEnd = new Date(vm.periodEnd);
             // FIX: Allow metrics with missing dates (defaulted to year 2000) or valid overlap
             const overlaps = (vmStart <= end && vmEnd >= start) || vmStart.getFullYear() === 2000;
             
             const vmPlate = (vm.plateNumber || '').replace(/[\s-]/g, '').toUpperCase();
             return overlaps && vmPlate.includes(profilePlate);
         }) || [];
     }

     // --- Phase 4 Wiring: Inject New Metrics into UI Variables ---

     // 1. Define Distance Metrics (Replacing legacy CSV logic)
     const distanceMetrics = reconstructedDistanceMetrics;

     // 2. Define Fuel Metrics (Replacing legacy estimate)
     const fuelMetrics = reconstructedFuelMetrics;

     // 3. Define Trip Ratio (Time Metrics)
     const tripRatio = {
         onTrip: reconstructedTimeMetrics.onTrip,
         toTrip: reconstructedTimeMetrics.toTrip,
         available: reconstructedTimeMetrics.available,
         unavailable: reconstructedTimeMetrics.unavailable,
         totalOnline: reconstructedTimeMetrics.totalOnline
     };
     
     // Note: totalDistance is currently left as "Revenue Distance" (Trip Only).

     const { magnitude: uberCsvCashCollectedMagnitude } = resolveUberPeriodCashCollected({
       csvMetrics,
       rangeFrom: start,
       rangeTo: end,
       trips: allTrips,
       isAllPlatforms,
       uberPlatformStats: platformStats.Uber,
       uberDistanceKm: perPlatformDistance.Uber?.onTrip,
     });

     return {
        periodEarnings,
        prevPeriodEarnings,
        trendPercent: trendPercent.toFixed(1),
        trendUp: periodEarnings >= prevPeriodEarnings,
        totalEarnings,
        lifetimeTrips,
        periodCompletedTrips,
        periodCancelledTrips,
        totalTrips,
        cashCollected,
        totalCashCollected,
        cashReceived, // ── CASH WALLET (from transactions, NOT trips) ──
        approvedFuelCredits, // Phase 5: Fuel reimbursement credits
        floatHeld,          // Phase 5
        pendingClearance,   // Phase 5
        weeklyEarningsData,
        earningsBreakdownData,
        hourlyActivityData,
        daysDiff,
        totalDistance,
        totalDuration,
        avgDistance,
        avgDuration,
        earningsPerKm, // HYBRID: trip-computed earnings ÷ distance (Efficiency tab)
        tripsPerHour,
        completionRate,
        cancellationRate,
        platformStats,
        // Phase 2 New Params
        acceptanceRate,
        currentRating,
        tripRatio, // New
        totalTolls,
        distanceMetrics, // Phase 2 New
         perPlatformDistance, // Per-platform distance breakdown (Roam/Uber/InDrive)
        fuelMetrics, // New Fuel Split
        monthlyEarnings, // Added back
        currentTier, // Added back
        // Phase 2.1: Expose Time Metrics for Debug/Advanced View
        timeMetrics: reconstructedTimeMetrics,
        uberCsvCashCollectedMagnitude,
        uberPaymentCsvRollup,
        /** Period-level fare decomposition (for trip-sourced financial fallback when ledger is empty). */
        totalTips,
        totalBaseFare,
     };
  }, [allTrips, dateRange, csvMetrics, transactions, vehicleMetrics, driver, selectedPlatforms, timeFilter, activeTab]);









  // ── Phase 15: Resolved Financials — prefer ledger, fall back to trips ──
  const resolvedFinancials = useMemo(() => {
    const ledgerHasData = !!ledgerOverview && (() => {
      const period = ledgerOverview.period || {};
      const lifetime = ledgerOverview.lifetime || {};
      const platformStats = ledgerOverview.platformStats || {};
      return (
        (Number(period.tripCount) || 0) > 0 ||
        (Number(lifetime.tripCount) || 0) > 0 ||
        Math.abs(Number(period.earnings) || 0) > 0.0001 ||
        Math.abs(Number(period.cashCollected) || 0) > 0.0001 ||
        Math.abs(Number(period.baseFare) || 0) > 0.0001 ||
        Object.keys(platformStats).length > 0
      );
    })();

    // ── Phase 1 Completeness Guard: detect if ledger covers all platforms with trip data ──
    // If any platform that has completed trips is missing from the ledger, the ledger is
    // incomplete and we must fall back entirely to trips — never create a hybrid.
    // Only require a platform in the ledger if it has COMPLETED trips in the period,
    // because generateTripLedgerEntries() only creates entries for status === 'Completed'.
    // Non-completed trips (Cancelled, In Progress) with non-zero amounts are expected
    // to be absent from the ledger — that is NOT a data gap.
    const tripPlatformsWithData = new Set<string>();
    for (const [platform, stats] of Object.entries(metrics.platformStats) as [string, any][]) {
      if (stats.completed > 0) {
        tripPlatformsWithData.add(platform);
      }
    }
    // TIGHTENED GUARD: Only check PERIOD-level ledger platforms, NOT lifetime.
    // Previously this also included lifetime.platformStats, which caused a bug:
    // if a platform had lifetime ledger entries (from old imports) but the CURRENT
    // period's trips had no ledger entries (e.g. fleet/sync gap), the guard would
    // pass and the period total would silently exclude that platform's earnings.
    const ledgerPlatforms = new Set<string>();
    if (ledgerOverview?.platformStats) {
      for (const rawPlat of Object.keys(ledgerOverview.platformStats)) {
        ledgerPlatforms.add(normalizePlatform(rawPlat));
      }
    }
    const missingFromLedger: string[] = [];
    for (const p of tripPlatformsWithData) {
      // Uber period money follows `trip.date` (same behavior as Roam/InDrive), not canonical ledger windows.
      if (p === 'Uber') continue;
      if (!ledgerPlatforms.has(p)) {
        missingFromLedger.push(p);
      }
    }
    const isLedgerComplete = missingFromLedger.length === 0;
    if (!isLedgerComplete && ledgerHasData) {
      // Ledger incomplete — auto-repair regenerates missing platforms below.
    }
    if (ledgerHasData) {
      // Merge ledger financial fields with trip-computed operational fields
      const platformStats: Record<string, any> = {};
      // Start with trip-computed platforms (keeps distance, ratings, completed counts)
      for (const [platform, stats] of Object.entries(metrics.platformStats)) {
        platformStats[platform] = { ...stats };
      }
      // Override financial fields from ledger for every platform (Uber included — trip ops stay for distance/ratings).
      for (const [rawPlat, stats] of Object.entries(ledgerOverview.platformStats)) {
        const platform = normalizePlatform(rawPlat);
        if (!platformStats[platform]) {
          platformStats[platform] = { earnings: 0, trips: 0, completed: 0, distance: 0, ratingSum: 0, ratingCount: 0, tolls: 0, cashCollected: 0 };
        }
        platformStats[platform].earnings = stats.earnings;
        platformStats[platform].trips = stats.tripCount;
        platformStats[platform].cashCollected = stats.cashCollected;
        platformStats[platform].tolls = stats.tolls;
      }

      // Build chart data from ledger dailyEarnings
      const weeklyEarningsData = ledgerOverview.dailyEarnings.filter((d: any) => !!d.date).map((d: any) => ({
        day: (() => { try { return format(new Date(d.date + 'T00:00:00'), 'MMM d'); } catch { return d.date; } })(),
        fullDate: d.date,
        ...d.byPlatform,
      }));

      // Phase 8: Surface dispute / toll-support refunds in overview breakdown (tolls column).
      const drAmt = Number(ledgerOverview.period.disputeRefunds) || 0;
      if (drAmt > 0) {
        platformStats['Dispute Recoveries'] = {
          earnings: 0, trips: 0, completed: 0, distance: 0,
          ratingSum: 0, ratingCount: 0, cashCollected: 0,
          tolls: drAmt,
        };
      }

      const uberCsvCash = metrics.uberCsvCashCollectedMagnitude;
      const uberLedgerCash = Number(platformStats.Uber?.cashCollected) || 0;
      const uberCashMismatch =
        uberCsvCash != null && Math.abs(uberCsvCash - uberLedgerCash) > 0.01
          ? { csv: uberCsvCash, ledger: uberLedgerCash, delta: uberCsvCash - uberLedgerCash }
          : null;

      // Ledger may count every Roam/InDrive fare as cash — trip evidence is a different cut.
      // Saved-week overlay already set period.cashCollected; do not smash it with chip sum.
      const fromSavedWeek = ledgerOverview.source === 'driver_financial_periods';
      if (!fromSavedWeek && dateRange?.from) {
        const periodStart = startOfDay(dateRange.from);
        const periodEnd = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        for (const [platform, stats] of Object.entries(platformStats)) {
          if (platform === 'Uber' || platform === 'Dispute Recoveries') continue;
          stats.cashCollected = allTrips
            .filter((t) => {
              const d = new Date(t.date);
              if (Number.isNaN(d.getTime())) return false;
              return (
                normalizePlatform(t.platform) === platform &&
                isWithinInterval(startOfDay(d), { start: periodStart, end: periodEnd })
              );
            })
            .reduce((sum, t) => sum + getTripPhysicalCashCollected(t), 0);
        }
      }

      /** Headline = saved week when overlay is on; otherwise fare/tip SSOT. */
      const displayPeriodEarnings = Number(ledgerOverview.period.earnings) || 0;
      const sumMergedCash = (() => {
        let t = 0;
        for (const [name, s] of Object.entries(platformStats)) {
          if (name === 'Dispute Recoveries') continue;
          t += Number((s as any)?.cashCollected) || 0;
        }
        return t;
      })();

      const displayCashCollected = fromSavedWeek
        ? Number(ledgerOverview.period.cashCollected) || 0
        : sumMergedCash;
      const prevEarningsNum = Number(ledgerOverview.prevPeriod.earnings) || 0;
      const trendPercentMerged =
        prevEarningsNum > 0
          ? ((displayPeriodEarnings - prevEarningsNum) / prevEarningsNum) * 100
          : displayPeriodEarnings > 0
            ? 100
            : 0;

      return {
        periodEarnings: displayPeriodEarnings,
        prevPeriodEarnings: ledgerOverview.prevPeriod.earnings,
        trendPercent: trendPercentMerged.toFixed(1),
        trendUp: displayPeriodEarnings >= prevEarningsNum,
        cashCollected: displayCashCollected,
        totalTolls: ledgerOverview.period.tolls,
        disputeRefunds: ledgerOverview.period.disputeRefunds || 0,
        totalTips: ledgerOverview.period.tips,
        totalBaseFare: ledgerOverview.period.baseFare,
        /** Canonical: bank transfer magnitude from `payout_bank` (display as outflow with minus in UI). */
        bankTransferred: ledgerOverview.period.bankTransferred ?? 0,
        uberLedgerReconciliation: ledgerOverview.period.uber || undefined,
        platformFees: ledgerOverview.period.platformFees ?? 0,
        platformFeesByPlatform: ledgerOverview.period.platformFeesByPlatform || {},
        fareGrossMinusNetByPlatform: ledgerOverview.period.fareGrossMinusNetByPlatform || {},
        cashSourceMismatch: uberCashMismatch,
        platformStats,
        weeklyEarningsData,
        tripCount: ledgerOverview.period.tripCount,
        readModelSource: fromSavedWeek
          ? 'driver_financial_periods'
          : ledgerOverview.readModelSource,
        source: 'ledger' as const,
        isLedgerComplete,
        dataIncomplete: !isLedgerComplete,
        missingPlatforms: missingFromLedger,
        lifetimeEarnings: ledgerOverview.lifetime.earnings,
        // Trip Ledger totals use trip:* rows; lifetime.tripCount is fare_earning lines only.
        lifetimeTrips:
          ledgerOverview.lifetime.tripRecordCount != null
            ? ledgerOverview.lifetime.tripRecordCount
            : metrics.lifetimeTrips,
        lifetimeCashCollected: (() => {
          const tripCash = sumTripPhysicalCashCollected(allTrips);
          return tripCash > 0.005 ? tripCash : ledgerOverview.lifetime.cashCollected;
        })(),
        lifetimeTolls: ledgerOverview.lifetime.tolls,
        lifetimeDisputeRefunds: ledgerOverview.lifetime.disputeRefunds || 0,
        lifetimePlatformStats: ledgerOverview.lifetime.platformStats || {},
        tripFallback: false as const,
      };
    }
    // ⚠️ LEGACY FALLBACK — Phase 7 safety net. If this fires, ledger is incomplete.
    // Phase 6 monitoring should detect & auto-repair. Investigate if this persists.
    if (ledgerOverviewLoaded) {
      // Awaiting ledger completeness — auto-repair resolves missing platforms when needed.
    }

    // ── Trip-sourced fallback (production): canonical ledger often empty until backfill; trip logs still match Trip Ledger. ──
    const tripFinancialSignal =
      (metrics.periodCompletedTrips || 0) > 0 ||
      Math.abs(Number(metrics.periodEarnings) || 0) > 0.0001 ||
      Math.abs(Number(metrics.cashCollected) || 0) > 0.0001 ||
      Math.abs(Number(metrics.totalTolls) || 0) > 0.0001;

    if (ledgerOverviewLoaded && !ledgerHasData && tripFinancialSignal) {
      return {
        periodEarnings: metrics.periodEarnings,
        prevPeriodEarnings: metrics.prevPeriodEarnings,
        trendPercent: metrics.trendPercent,
        trendUp: metrics.trendUp,
        cashCollected: metrics.cashCollected,
        totalTolls: metrics.totalTolls,
        disputeRefunds: 0,
        totalTips: metrics.totalTips ?? 0,
        totalBaseFare: metrics.totalBaseFare ?? 0,
        bankTransferred: 0,
        uberLedgerReconciliation: undefined,
        platformFees: 0,
        platformFeesByPlatform: {} as Record<string, number>,
        fareGrossMinusNetByPlatform: {} as Record<string, number>,
        platformStats: metrics.platformStats,
        weeklyEarningsData: metrics.weeklyEarningsData,
        tripCount: metrics.periodCompletedTrips,
        readModelSource: "trip_logs",
        source: "trips" as const,
        tripFallback: true as const,
        isLedgerComplete,
        dataIncomplete: true,
        missingPlatforms: missingFromLedger,
        lifetimeEarnings: metrics.totalEarnings,
        lifetimeTrips: metrics.lifetimeTrips,
        lifetimeCashCollected: metrics.totalCashCollected,
        lifetimeTolls: metrics.lifetimeTolls,
        lifetimeDisputeRefunds: 0,
        lifetimePlatformStats: {} as Record<string, any>,
      };
    }

    return {
      // No ledger and no usable trip signal in range — keep zeros
      periodEarnings: 0,
      prevPeriodEarnings: 0,
      trendPercent: "0.0",
      trendUp: true,
      cashCollected: 0,
      totalTolls: 0,
      disputeRefunds: 0,
      totalTips: 0,
      totalBaseFare: 0,
      bankTransferred: 0,
      uberLedgerReconciliation: undefined,
      platformFees: 0,
      platformFeesByPlatform: {} as Record<string, number>,
      fareGrossMinusNetByPlatform: {} as Record<string, number>,
      platformStats: metrics.platformStats,
      weeklyEarningsData: [],
      tripCount: metrics.periodCompletedTrips,
      readModelSource: undefined,
      source: "trips" as const,
      tripFallback: false as const,
      isLedgerComplete,
      dataIncomplete: true,
      missingPlatforms: missingFromLedger,
      lifetimeEarnings: 0,
      lifetimeTrips: metrics.lifetimeTrips,
      lifetimeCashCollected: 0,
      lifetimeTolls: 0,
      lifetimeDisputeRefunds: 0,
      lifetimePlatformStats: {} as Record<string, any>,
    };
  }, [ledgerOverview, ledgerOverviewLoaded, metrics, allTrips, dateRange]);

  /**
   * Lazy money core: only when Financials or Cash Wallet tab is active.
   * Overview-only visits keep vehicles/finalized/dispute fetches off the wire.
   */
  const sharedFinancialBundle = useDriverFinancialBundle(driverId, driver, {
    enabled: moneyTabActive,
  });

  /** One weekly money pipeline — shared by Cash Wallet + Financials Settlement/Payout. */
  const { periodData: walletPayoutPeriodRows, cashWeeks: walletCashWeeks } = useDriverPayoutPeriodRows({
    driverId,
    driver,
    trips: allTrips,
    transactions,
    csvMetrics: csvMetrics || [],
    periodType: 'weekly',
    financialBundle: sharedFinancialBundle,
    enabled: moneyTabActive,
    startDate: financialDateRangeStrings?.startDate,
    endDate: financialDateRangeStrings?.endDate,
  });

  /** Live Log Cash period list (never a stale Weekly Settlements snapshot). */
  const logCashPeriods = useMemo(
    () =>
      walletCashWeeks.map((w) => ({
        start: w.start,
        end: w.end,
        amountOwed: w.amountOwed,
        amountPaid: w.amountPaid,
        balance: w.balance,
        status: w.status,
      })),
    [walletCashWeeks],
  );

  /** Settlement call-script map (Monday → tell-the-driver amount). Display only. */
  const callOutstandingByMonday = useMemo(
    () => buildWalletCallOutstandingByMonday(walletPayoutPeriodRows),
    [walletPayoutPeriodRows],
  );

  /** Collection desk totals — who owes whom + verified cash logged (open weeks). */
  const walletCollectionTotals = useMemo(() => {
    let passengerCash = 0;
    let cashReturned = 0;
    for (const w of walletCashWeeks) {
      cashReturned += w.amountPaid || 0;
      if ((w.amountOwed || 0) <= 0.005) continue;
      passengerCash += w.amountOwed || 0;
    }
    const collectionGap = Math.max(0, Math.round((passengerCash - cashReturned) * 100) / 100);
    let driverOwes = 0;
    let fleetOwes = 0;
    let cashWithDriver = 0;
    for (const w of walletCashWeeks) {
      if ((w.amountOwed || 0) <= 0.005) continue;
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      if (!call) continue;
      if (call.callDirection === 'driver_owes') driverOwes += call.callAmount;
      else if (call.callDirection === 'fleet_owes') fleetOwes += call.callAmount;
      else cashWithDriver += call.callAmount;
    }
    return {
      passengerCash: Math.round(passengerCash * 100) / 100,
      cashReturned: Math.round(cashReturned * 100) / 100,
      collectionGap,
      driverOwes: Math.round(driverOwes * 100) / 100,
      fleetOwes: Math.round(fleetOwes * 100) / 100,
      cashWithDriver: Math.round(cashWithDriver * 100) / 100,
      /** Phone-friendly total: finalized debts + unfinalized still-held */
      callOutstanding: Math.round((driverOwes + cashWithDriver) * 100) / 100,
    };
  }, [walletCashWeeks, callOutstandingByMonday]);

  /** Prefer newest week with cash still owed (Settlement call amount), not passenger−returned. */
  const openWalletPeriodPrefill = useMemo(() => {
    for (const w of walletCashWeeks) {
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      const owed =
        call && call.callDirection !== 'fleet_owes'
          ? call.callAmount
          : Math.max(0, (w.amountOwed || 0) - (w.amountPaid || 0));
      if (owed > 0.005) {
        return {
          start: w.start,
          end: w.end,
          amount: Math.round(owed * 100) / 100,
        };
      }
    }
    return null;
  }, [walletCashWeeks, callOutstandingByMonday]);

  /** Newest week where fleet owes the driver (Pay Driver desk). */
  const openFleetOwesPrefill = useMemo(() => {
    for (const w of walletCashWeeks) {
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      if (call?.callDirection === 'fleet_owes' && call.callAmount > 0.005) {
        return {
          start: w.start,
          end: w.end,
          amount: Math.round(call.callAmount * 100) / 100,
        };
      }
    }
    return null;
  }, [walletCashWeeks, callOutstandingByMonday]);

  // ── Auto-Repair: When the completeness guard detects missing ledger platforms,
  // automatically trigger a one-time ledger repair for this driver, then re-fetch.
  // Guards: repairResult starts null on mount, so fires once; repairInProgress prevents overlap.
  useEffect(() => {
    if (
      resolvedFinancials.source === 'trips' &&
      resolvedFinancials.missingPlatforms?.length > 0 &&
      ledgerOverviewLoaded &&
      !repairInProgress &&
      repairResult === null
    ) {
      // Trigger ledger repair for missing platforms
      // DISABLED: Auto-repair was firing on every date change. Use manual button instead.
      // handleRepairLedger();
    }
  }, [resolvedFinancials.source, resolvedFinancials.missingPlatforms, ledgerOverviewLoaded, driverId, repairInProgress, repairResult]);




  // ────────────────────────────────────────────────────────────
  // Platform Breakdown for Earnings donut chart (Step 5.6)
  //   Base: completed-trip earnings per platform from merged trip list.
  //   Ledger lifetime per-platform earnings override when > 0 (canonical Uber/statement).
  //   Using ledger-only when it listed just Uber hid InDrive/Roam entirely — never hybrid.
  // ────────────────────────────────────────────────────────────
  const platformBreakdownData = useMemo(() => {
    const colors: Record<string, string> = {
      Uber: '#3b82f6',
      InDrive: '#10b981',
      Roam: '#f59e0b',
      Private: '#ec4899',
      Cash: '#84cc16',
      Other: '#94a3b8'
    };

    const completed = (allTrips || []).filter(t => t.status === 'Completed');
    const platformTotals: Record<string, number> = {};
    completed.forEach(trip => {
      const platform = normalizePlatform(trip.platform);
      platformTotals[platform] = (platformTotals[platform] || 0) + getEffectiveTripEarnings(trip);
    });

    const ltStats = resolvedFinancials.lifetimePlatformStats || {};
    const merged: Record<string, number> = { ...platformTotals };
    for (const [rawPlat, stats] of Object.entries(ltStats)) {
      if (rawPlat === 'Dispute Recoveries') continue;
      const name = normalizePlatform(rawPlat);
      const le = Number((stats as any)?.earnings) || 0;
      if (le > 0) merged[name] = le;
    }

    return Object.entries(merged)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: colors[name] || '#94a3b8' }));
  }, [resolvedFinancials.lifetimePlatformStats, allTrips]);

  const platformTotalEarnings = useMemo(() =>
    platformBreakdownData.reduce((sum, d) => sum + d.value, 0),
    [platformBreakdownData]
  );

  const handlePeriodWeekSelect = (p: PeriodWeekOption) => {
    const [y1, m1, d1] = p.startDate.split('-').map(Number);
    const [y2, m2, d2] = p.endDate.split('-').map(Number);
    setDateRange({
      from: new Date(y1, m1 - 1, d1, 12, 0, 0, 0),
      to: new Date(y2, m2 - 1, d2, 12, 0, 0, 0),
    });
  };

  const handleFinancialPeriodWeekSelect = (p: PeriodWeekOption) => {
    if (!p.startDate || !p.endDate) return;
    const [y1, m1, d1] = p.startDate.split('-').map(Number);
    const [y2, m2, d2] = p.endDate.split('-').map(Number);
    setPeriod({
      from: new Date(y1, m1 - 1, d1, 12, 0, 0, 0),
      to: new Date(y2, m2 - 1, d2, 12, 0, 0, 0),
    });
  };

  // Repair via ensure-from-trip-ids (repair-driver is retired 410).
  const handleRepairLedger = async () => {
    setRepairInProgress(true);
    setRepairResult(null);
    try {
      const clientTripIds = allTrips
        .filter((t) => t?.id && t.status === 'Completed')
        .map((t) => t.id);
      const result = await api.ensureLedgerFromTripIds(clientTripIds);
      setRepairResult({
        success: result.success,
        stats: {
          ledgerCreated: result.stats?.ledgerRowsWritten || 0,
          alreadyExisted: Math.max(
            0,
            (result.stats?.tripsLoaded || 0) - (result.stats?.ledgerRowsWritten || 0),
          ),
          ...result.stats,
        },
        durationMs: result.durationMs,
      });
      setLedgerRefreshKey((k) => k + 1);
      toast.success('Ledger repair finished for this driver’s trips');
    } catch (err: any) {
      console.error('[DriverDetail] Ledger repair failed:', err);
      setRepairResult({ success: false, error: err.message });
      toast.error(err?.message || 'Ledger repair failed');
    } finally {
      setRepairInProgress(false);
    }
  };

  const handleTripLedgerGapDiagnostic = async () => {
    if (!ledgerDateRangeStrings) {
      toast.error('Select a date range first');
      return;
    }
    setTripGapDiagLoading(true);
    setTripGapDiagResult(null);
    try {
      const r = await api.getLedgerTripLedgerGapDiagnostic({
        driverId,
        startDate: ledgerDateRangeStrings.startDate,
        endDate: ledgerDateRangeStrings.endDate,
      });
      setTripGapDiagResult(r);
      setTripGapDiagOpen(true);
      if (!r?.success) toast.error(r?.error || 'Diagnostic failed');
    } catch (err: any) {
      console.error('[TripLedgerGapDiag]', err);
      toast.error(err?.message || 'Diagnostic failed');
    } finally {
      setTripGapDiagLoading(false);
    }
  };

  if (!serverTripsLoaded && (!metrics || metrics.totalTrips === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-medium">Restoring rich performance dashboard...</p>
      </div>
    );
  }

  if (!dateRange?.from) return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Please select a date range to view driver metrics.</div>;

  const isToday = dateRange?.to && format(dateRange.to, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && metrics.daysDiff === 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-2 pl-0 hover:pl-2 transition-all"
          aria-label="Back to Drivers list"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Drivers
        </Button>
        <div className="flex flex-wrap items-center gap-2">
           {/* Platform Filter */}
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="outline" className="w-[180px] justify-between">
                 <div className="flex items-center gap-2">
                   <Filter className="h-4 w-4" />
                   <span className="truncate">
                     {selectedPlatforms.has('All') 
                       ? 'All Platforms' 
                       : Array.from(selectedPlatforms).join(', ')}
                   </span>
                 </div>
                 <ChevronDown className="h-4 w-4 opacity-50" />
               </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end" className="w-[200px]">
               <DropdownMenuItem 
                 onSelect={(e) => {
                   e.preventDefault();
                   setSelectedPlatforms(new Set(['All']));
                 }}
               >
                 <div className="flex items-center gap-2">
                   <Checkbox checked={selectedPlatforms.has('All')} />
                   <span>All Platforms</span>
                 </div>
               </DropdownMenuItem>
               <DropdownMenuSeparator />
               {Object.keys(PLATFORM_COLORS).filter(k => k !== 'Other').map(platform => (
                 <DropdownMenuItem
                   key={platform}
                   onSelect={(e) => {
                     e.preventDefault();
                     const newSet = new Set(selectedPlatforms);
                     if (newSet.has('All')) newSet.delete('All');
                     
                     if (newSet.has(platform)) {
                       newSet.delete(platform);
                     } else {
                       newSet.add(platform);
                     }
                     
                     if (newSet.size === 0) newSet.add('All');
                     setSelectedPlatforms(newSet);
                   }}
                 >
                   <div className="flex items-center gap-2">
                     <Checkbox checked={selectedPlatforms.has(platform)} />
                     <span style={{ color: PLATFORM_COLORS[platform] }}>{platform}</span>
                   </div>
                 </DropdownMenuItem>
               ))}
               <DropdownMenuItem
                   onSelect={(e) => {
                     e.preventDefault();
                     const newSet = new Set(selectedPlatforms);
                     if (newSet.has('All')) newSet.delete('All');
                     
                     if (newSet.has('Other')) {
                       newSet.delete('Other');
                     } else {
                       newSet.add('Other');
                     }
                     
                     if (newSet.size === 0) newSet.add('All');
                     setSelectedPlatforms(newSet);
                   }}
                 >
                   <div className="flex items-center gap-2">
                     <Checkbox checked={selectedPlatforms.has('Other')} />
                     <span style={{ color: PLATFORM_COLORS['Other'] }}>Other</span>
                   </div>
                 </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>

           <TimeFilterDropdown value={timeFilter} onChange={setTimeFilter} inactive={activeTab !== 'overview'} />
           {/* Overview / InDrive date only — Financials uses its own filter inside the tab */}
           {showOverviewDateControls && (
           <div className="flex flex-wrap items-center gap-2">
            {dateRange?.from && (
              <PeriodWeekDropdown
                selectedStart={format(dateRange.from, 'yyyy-MM-dd')}
                selectedEnd={format(dateRange.to || dateRange.from, 'yyyy-MM-dd')}
                onSelect={handlePeriodWeekSelect}
                allowCustomRange
                placeholder="Select week period"
                buttonClassName="h-9"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-amber-700"
              title="Trip ↔ Ledger diagnostic (same date range)"
              onClick={handleTripLedgerGapDiagnostic}
              disabled={tripGapDiagLoading}
            >
              {tripGapDiagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            </Button>
           </div>
           )}

           {/* Export / Message deferred to Phase 6 (notes + real export) — do not show inert CTAs */}

        </div>
      </div>

      {/* Driver Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
        <div className="flex items-start gap-4 col-span-1 md:col-span-2">
          <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
             <AvatarFallback className="text-xl bg-indigo-100 text-indigo-700">{driverName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
             <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{driverName}</h1>
                <Badge className={cn(
                    "px-3 py-0.5 font-bold uppercase tracking-widest text-[10px]",
                    driver?.status === 'Inactive' ? "bg-rose-600 text-white animate-pulse border-none shadow-lg shadow-rose-200" : "bg-emerald-100 text-emerald-700"
                )}>
                    {driver?.status === 'Inactive' ? 'TERMINATED' : driver?.status || 'Active'}
                </Badge>
             </div>
             <div className="text-sm text-slate-500 flex flex-col gap-1">
                <span className="flex items-center gap-2"><CreditCardIcon className="h-3 w-3" /> ID: {driverId}</span>
                {driver?.uberDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">Uber UUID: {driver.uberDriverId}</span>
                )}
                {driver?.inDriveDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">InDrive UUID: {driver.inDriveDriverId}</span>
                )}
                <span className="flex items-center gap-2">
                  <CarIcon className="h-3 w-3" /> Vehicle: {vehicleLabel || '—'}
                </span>
                <span className="flex items-center gap-2">
                  <CalendarIcon className="h-3 w-3" /> Member Since: {memberSinceLabel || '—'}
                </span>
             </div>
          </div>
        </div>
        
        <div className="col-span-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-3">
           <DriverFuelPolicySelect driver={driver} driverId={driverId} />
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Performance Tier</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1">
                 <Award className="h-3 w-3" /> {currentTier?.name.toUpperCase() || 'BRONZE'}
              </Badge>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Total Lifetime Trips</span>
              <span className="font-semibold">{resolvedFinancials.lifetimeTrips}</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Current Rating</span>
              <div className="flex items-center gap-1 text-amber-500 font-bold">
                 {serverTripsLoaded && metrics.currentRating > 0
                   ? <>{metrics.currentRating.toFixed(1)} <Star className="h-4 w-4 fill-current" /></>
                   : <span className="text-slate-400 font-medium">—</span>}
              </div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} className="space-y-4" onValueChange={handleTabChange}>
         <TabsList>
            <TabsTrigger value="overview" aria-label="Overview tab">Overview</TabsTrigger>
            <TabsTrigger value="financial" aria-label="Financials tab">Financials</TabsTrigger>
            <TabsTrigger value="quality" aria-label="Service Quality tab">Service Quality</TabsTrigger>
            <TabsTrigger value="wallet" aria-label="Cash Wallet tab">Cash Wallet</TabsTrigger>
            <TabsTrigger value="indrive-wallet" aria-label="InDrive Wallet tab">InDrive Wallet</TabsTrigger>
            <TabsTrigger value="profile" aria-label="Profile tab">Profile</TabsTrigger>
         </TabsList>

         <TabsContent value="overview" className="space-y-6">
            {driver?.status === 'Inactive' && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-4 animate-pulse">
                    <div className="p-2 bg-rose-100 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest">Driver Terminated</h3>
                        <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">
                            This driver account is inactive. Ensure all fuel cards are collected and deactivated. 
                            Manual ledger operations are restricted for terminated assets to prevent data drift.
                        </p>
                    </div>
                </div>
            )}

             {/* Phase 6.4: Ledger integrity warning banner */}
             {ledgerOverview?.completeness && !ledgerOverview.completeness.isComplete && (
               <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-4">
                 <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full shrink-0">
                   <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Ledger Integrity Gap Detected</h3>
                   <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                     {ledgerOverview.completeness.totalTrips} completed trips found but only {ledgerOverview.completeness.ledgerTrips} have ledger entries ({ledgerOverview.completeness.missingCount} missing).
                     {ledgerOverview.completeness.byPlatform && Object.entries(ledgerOverview.completeness.byPlatform as Record<string, {trips: number; ledger: number}>)
                       .filter(([_, v]) => v.trips !== v.ledger)
                       .map(([p, v]) => ` ${p}: ${v.trips} trips / ${v.ledger} ledger`)
                       .join(';')}
                   </p>
                   {repairResult?.success && (
                     <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
                       <CheckCircle2 className="h-3.5 w-3.5" />
                       Repair complete — {repairResult.stats?.ledgerCreated || 0} entries created, {repairResult.stats?.alreadyExisted || 0} already existed ({repairResult.durationMs}ms)
                     </p>
                   )}
                   {repairResult?.success === false && (
                     <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Repair failed: {repairResult.error}</p>
                   )}
                 </div>
                 <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                   <button
                     type="button"
                     onClick={handleTripLedgerGapDiagnostic}
                     disabled={tripGapDiagLoading}
                     className="px-3 py-1.5 text-xs font-semibold border border-amber-700/40 bg-white dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 rounded-lg hover:bg-amber-100/80 dark:hover:bg-amber-900/50 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                   >
                     {tripGapDiagLoading ? (
                       <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Diagnosing…</>
                     ) : (
                       <><Stethoscope className="h-3.5 w-3.5" /> Diagnose</>
                     )}
                   </button>
                   <button
                     onClick={handleRepairLedger}
                     disabled={repairInProgress}
                     className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                   >
                     {repairInProgress ? (
                       <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Repairing...</>
                     ) : (
                       'Repair Now'
                     )}
                   </button>
                 </div>
               </div>
             )}
              
              <OverviewMetricsGrid
                resolvedFinancials={resolvedFinancials}
                metrics={metrics}
                uberPaymentCsvRollup={metrics.uberPaymentCsvRollup}
                earningsLoading={!ledgerOverviewLoaded}
                tripsLoading={!serverTripsLoaded}
                tollsLoading={!ledgerOverviewLoaded}
                isToday={!!isToday}
                driverId={driverId}
                walletRange={ledgerDateRangeStrings}
                platformFilterAllPlatforms={selectedPlatforms.has('All')}
              />
             
             {/* Platform distance gauges */}
            <DistanceByPlatform perPlatformDistance={metrics.perPlatformDistance} loading={!serverTripsLoaded} />
         </TabsContent>

         <TabsContent value="financial" className="space-y-6">
           <FinancialSubTabs
             driverId={driverId}
             driver={driver}
             transactions={transactions}
             allTrips={allTrips}
             quotaConfig={quotaConfig}
             platformBreakdownData={platformBreakdownData}
             platformTotalEarnings={platformTotalEarnings}
             csvMetrics={csvMetrics}
             uberLedgerReconciliation={financialUberLedger}
             periodFrom={financialDateRange?.from}
             periodTo={financialDateRange?.to}
             onFinancialPeriodSelect={handleFinancialPeriodWeekSelect}
             financialBundle={sharedFinancialBundle}
             weeklyPeriodData={walletPayoutPeriodRows}
             weeklyCashWeeks={walletCashWeeks}
           />
            
          </TabsContent>
          
          <TabsContent value="wallet" className="space-y-6">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverCashWalletTab
                financialDateRange={financialDateRange}
                walletCollectionTotals={walletCollectionTotals}
                pendingClearance={metrics.pendingClearance}
                walletView={walletView}
                setWalletView={setWalletView}
                allTrips={allTrips}
                transactions={transactions}
                csvMetrics={csvMetrics}
                walletCashWeeks={walletCashWeeks}
                callOutstandingByMonday={callOutstandingByMonday}
                canEditTransactions={canEditTransactions}
                onLogPayment={canEditTransactions ? (start, end, amount) => setPaymentModalState({
                  isOpen: true,
                  initialWorkPeriodStart: start.toISOString(),
                  initialWorkPeriodEnd: end.toISOString(),
                  initialAmount: amount,
                }) : undefined}
                onWriteOff={canEditTransactions ? (start, end, maxAmount) => setWriteOffModalState({
                  isOpen: true,
                  workPeriodStart: format(start, 'yyyy-MM-dd'),
                  workPeriodEnd: format(end, 'yyyy-MM-dd'),
                  maxAmount,
                }) : undefined}
                onPayDriver={canEditTransactions ? (start, end, maxAmount) => setPayoutModalState({
                  isOpen: true,
                  workPeriodStart: format(start, 'yyyy-MM-dd'),
                  workPeriodEnd: format(end, 'yyyy-MM-dd'),
                  maxAmount,
                }) : undefined}
                onDeleteWriteOff={canEditTransactions ? (txId) => handleDeleteTransaction(txId) : undefined}
                paymentsLogTab={paymentsLogTab}
                setPaymentsLogTab={setPaymentsLogTab}
                cashReceivedTransactions={cashReceivedTransactions}
                bankTransferTransactions={bankTransferTransactions}
                activePaymentTransactions={activePaymentTransactions}
                groupedPaymentTransactions={groupedPaymentTransactions}
                expandedPaymentGroups={expandedPaymentGroups}
                togglePaymentGroup={togglePaymentGroup}
                openWalletPeriodPrefill={openWalletPeriodPrefill}
                openFleetOwesPrefill={openFleetOwesPrefill}
                onOpenLogPayment={(opts) => setPaymentModalState({ isOpen: true, ...opts })}
                onOpenPayout={(opts) => setPayoutModalState({ isOpen: true, ...opts })}
                onVerifyTransaction={handleVerifyTransaction}
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
              />
            </Suspense>
          </TabsContent>
          


         <TabsContent value="quality" className="space-y-6">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverServiceQualityTab
                metrics={{
                  currentRating: metrics.currentRating,
                  completionRate: metrics.completionRate,
                  periodCancelledTrips: metrics.periodCancelledTrips,
                  acceptanceRate: metrics.acceptanceRate,
                  totalTrips: metrics.totalTrips,
                  cancellationRate: metrics.cancellationRate,
                  platformStats: metrics.platformStats,
                }}
                cancelledTripsInPeriod={cancelledTripsInPeriod}
                serverTripsLoaded={serverTripsLoaded}
              />
            </Suspense>
         </TabsContent>



         <TabsContent value="indrive-wallet" className="space-y-6">
            <DriverIndriveWalletTab
              driverId={driverId}
              range={ledgerDateRangeStrings}
              ledgerRefreshKey={ledgerRefreshKey}
              onWalletLedgerMutated={() => setLedgerRefreshKey((k) => k + 1)}
            />
         </TabsContent>

         <TabsContent value="profile" className="space-y-6">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverProfileTab
                driverId={driverId}
                driverName={driverName}
                driver={driver}
                documents={documents}
                selectedDocument={selectedDocument}
                setSelectedDocument={setSelectedDocument}
                canEditDrivers={canEditDrivers}
              />
            </Suspense>
         </TabsContent>
      </Tabs>

      

      {/* Trip ↔ Ledger gap diagnostic (server: GET /ledger/diagnostic-trip-ledger-gap) */}
      <Dialog open={tripGapDiagOpen} onOpenChange={setTripGapDiagOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-amber-600" />
              Trip ↔ Ledger diagnostic
            </DialogTitle>
            <DialogDescription>
              Same date range as the overview. Compares completed trips with money to <code className="text-xs">fare_earning</code> rows in{' '}
              <code className="text-xs">ledger_event:*</code> (org scope via server filters).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 overflow-auto max-h-[60vh] text-xs font-mono leading-relaxed">
            {tripGapDiagResult ? (
              <pre className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200">
                {JSON.stringify(tripGapDiagResult, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-500">No data</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                tripGapDiagResult &&
                navigator.clipboard.writeText(JSON.stringify(tripGapDiagResult, null, 2)).then(() => toast.success('Copied'))
              }
            >
              Copy JSON
            </Button>
            <Button size="sm" onClick={() => setTripGapDiagOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>


      <PermissionGate permission="transactions.edit" fallback={null}>
      <LogCashPaymentModal 
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false })}
        onSave={handleSavePayment}
        driverName={driverName}
        cashOwed={
          paymentModalState.initialAmount != null
            ? paymentModalState.initialAmount
            : walletCollectionTotals.callOutstanding
        }
        initialWorkPeriodStart={paymentModalState.initialWorkPeriodStart}
        initialWorkPeriodEnd={paymentModalState.initialWorkPeriodEnd}
        initialAmount={paymentModalState.initialAmount}
        initialTransaction={paymentModalState.editingTransaction}
        periods={logCashPeriods}
      />
      <CashWriteOffModal
        isOpen={writeOffModalState.isOpen}
        onClose={() => setWriteOffModalState({ isOpen: false, workPeriodStart: '', workPeriodEnd: '', maxAmount: 0 })}
        onSave={handleSaveCashWriteOff}
        driverName={driverName}
        maxAmount={writeOffModalState.maxAmount}
        workPeriodStart={writeOffModalState.workPeriodStart}
        workPeriodEnd={writeOffModalState.workPeriodEnd}
      />
      <RecordPayoutModal
        isOpen={payoutModalState.isOpen}
        onClose={() => setPayoutModalState({ isOpen: false, workPeriodStart: '', workPeriodEnd: '', maxAmount: 0 })}
        onSave={handleSaveDriverPayout}
        driverName={driverName}
        maxAmount={payoutModalState.maxAmount}
        workPeriodStart={payoutModalState.workPeriodStart}
        workPeriodEnd={payoutModalState.workPeriodEnd}
      />
      </PermissionGate>
        {/* Delete Confirmation Dialog */}
      <PermissionGate permission="transactions.edit" fallback={null}>
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                      {transactionToDelete && isCashWriteOffTransaction(transactions.find((t) => t.id === transactionToDelete))
                        ? 'Undo write-off?'
                        : transactionToDelete && isDriverPayoutTransaction(transactions.find((t) => t.id === transactionToDelete))
                          ? 'Undo payout?'
                          : 'Delete Transaction?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {transactionToDelete && isCashWriteOffTransaction(transactions.find((t) => t.id === transactionToDelete))
                          ? 'This restores the cash still owed for that Settlement Week. Business Finance will update after delete.'
                          : transactionToDelete && isDriverPayoutTransaction(transactions.find((t) => t.id === transactionToDelete))
                            ? 'This restores the fleet-owes balance for that Settlement Week.'
                            : 'Are you sure you want to delete this transaction? This action cannot be undone.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteTransaction} className="bg-red-600 hover:bg-red-700">
                      {transactionToDelete && isCashWriteOffTransaction(transactions.find((t) => t.id === transactionToDelete))
                        ? 'Undo write-off'
                        : 'Delete'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </PermissionGate>
    </div>
  );
}

