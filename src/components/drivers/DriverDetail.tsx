// ════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE: Driver Detail — Data Flow (Phase 7 Documentation)
// ════════════════════════════════════════════════════════════════════════════
//
// FINANCIAL DATA (earnings, cash collected, tolls, tips, base fare):
//   → Source: ledger:* KV entries, aggregated by server endpoints
//   → Overview tab: GET /ledger/driver-overview  →  `resolvedFinancials`
//   → Financials > Earnings tab: GET /ledger/driver-earnings-history
//   → Financials > Donut chart: `resolvedFinancials.lifetimePlatformStats`
//
// OPERATIONAL DATA (distance, duration, ratings, utilization, fuel):
//   → Source: trip:* KV entries, computed client-side in `metrics` useMemo
//   → Efficiency tab, Trips tab, distance/time breakdowns
//
// CASH WALLET DATA (net outstanding, float, pending clearance):
//   → Source: ledger (lifetime cash) + transaction:* (floats/payments), in `walletMetrics` useMemo
//   → Cash Wallet section on Overview tab
//
// INTEGRITY MONITORING (Phase 6):
//   → Server: /ledger/driver-overview returns `completeness` object
//   → Client: amber warning banner + "Diagnose" (GET /ledger/diagnostic-trip-ledger-gap) + "Repair Now"
//   → Repair: POST /ledger/repair-driver does targeted per-driver re-generation
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
// As of Phase 6, ALL dollar amounts in the app read from ledger:*.
// No financial computation from trip:* remains in any display path.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect } from 'react';
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
  Activity,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Navigation,
  FileText,
  Upload,
  Search,
  Eye,
  Filter,
  Info,
  Fuel,
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
  CornerDownRight,
  RefreshCw,
  Stethoscope
} from "lucide-react";
import { Button } from "../ui/button";
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
import { 
  BarChart as RawBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart as RawPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Label as RechartsLabel
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../ui/SafeResponsiveContainer';
import { Trip, DriverMetrics, FinancialTransaction, QuotaConfig, LedgerDriverOverview } from '../../types/data';
import { classifyTollTransaction } from '../../utils/tollTransactionUtils';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "../ui/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { toast } from "sonner@2.0.3";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { LogCashPaymentModal } from './LogCashPaymentModal';
import { WeeklySettlementView, type WeekSettlementMap } from './WeeklySettlementView';
import { useDriverPayoutPeriodRows } from '../../hooks/useDriverPayoutPeriodRows';
import {
  aggregateFinalizedNetSettlement,
  countPendingEarningsPeriods,
  getPeriodSettlementComponents,
} from '../../utils/driverSettlementMath';
import { DriverEarningsHistory } from './DriverEarningsHistory';
import { DriverExpensesHistory } from './DriverExpensesHistory';
import { DriverPayoutHistory } from './DriverPayoutHistory';
// TollRecoveryCard removed — Phase 8 uses platformStats injection instead
// fetchDriverTrips.ts deleted in Phase 11 — logic inlined in the useEffect below
import { DistanceByPlatform } from './DistanceByPlatform';
import { FinancialSubTabs } from './FinancialSubTabs';
import { OverviewMetricsGrid, MetricCard as ExtractedMetricCard, PLATFORM_COLORS as EXTRACTED_PLATFORM_COLORS, getPlatformColor as extractedGetPlatformColor } from './OverviewMetricsGrid';
import { DriverIndriveWalletTab } from './DriverIndriveWalletTab';
import { FuelWalletView } from './FuelWalletView';
import { TimeFilterDropdown, TimeFilterValue, isHourInTimeFilter } from './TimeFilterDropdown';
import { api } from '../../services/api';
import { isLedgerMoneyReadModelEnabled } from '../../utils/featureFlags';
import { tierService } from '../../services/tierService';
import { TierCalculations } from '../../utils/tierCalculations';
import { TierConfig } from '../../types/data';
import { getEffectiveTripEarnings } from '../../utils/tripEarnings';
import { normalizePlatform } from '../../utils/normalizePlatform';
import { calculateAverageEnroute, estimateEnrouteFallback } from '../../utils/enrouteStrategy';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
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

// Wrapper to auto-add keys to chart children, fixing recharts null-key warning.
// Recharts internally maps JSX children (CartesianGrid, XAxis, YAxis, Tooltip, Bar, Pie, etc.)
// into SVG elements. When any of those children lack an explicit React key, the resulting
// SVG siblings end up with key={null} and React warns about duplicate keys.
// Wrapping each chart type to ensure ALL direct children carry a key eliminates the warning.
const PieChart = ({ children, ...props }: React.ComponentProps<typeof RawPieChart>) => {
  const keyedChildren = React.Children.map(children, (child, i) => {
    if (React.isValidElement(child) && child.key == null) {
      return React.cloneElement(child as React.ReactElement<any>, { key: `pc-child-${i}` });
    }
    return child;
  });
  return <RawPieChart {...props}>{keyedChildren}</RawPieChart>;
};

const BarChart = ({ children, ...props }: React.ComponentProps<typeof RawBarChart>) => {
  const keyedChildren = React.Children.map(children, (child, i) => {
    if (React.isValidElement(child) && child.key == null) {
      return React.cloneElement(child as React.ReactElement<any>, { key: `bc-child-${i}` });
    }
    return child;
  });
  return <RawBarChart {...props}>{keyedChildren}</RawBarChart>;
};

const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  Roam: '#6366f1',


  Private: '#f59e0b',
  Cash: '#84cc16',
  'Dispute Recoveries': '#14b8a6',
  Other: '#64748b'
};

const getPlatformColor = (platform: string) => PLATFORM_COLORS[platform] || PLATFORM_COLORS['Other'];

interface DriverDocument {
  id: string;
  name: string;
  type: string;
  status: 'Verified' | 'Pending' | 'Expired' | 'Rejected';
  expiryDate: string;
  uploadDate: string;
  url?: string;
}

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

export const getSortedTripsInRange = (trips: Trip[], rangeStart: Date, rangeEnd: Date): Trip[] => {
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
        return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
    });
};

const MOCK_DOCUMENTS: DriverDocument[] = [
  { id: '1', name: 'Driver License (Front)', type: 'License', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '6', name: 'Driver License (Back)', type: 'License Back', status: 'Verified', expiryDate: '2025-10-15', uploadDate: '2023-10-12', url: 'https://images.unsplash.com/photo-1633535928821-6556e974659b?auto=format&fit=crop&q=80&w=1000' },
  { id: '5', name: 'Proof of Address (Water Bill)', type: 'Address Proof', status: 'Verified', expiryDate: '2024-03-20', uploadDate: '2023-12-05', url: 'https://images.unsplash.com/photo-1628191011893-6c6e93821033?auto=format&fit=crop&q=80&w=1000' },
  { id: '4', name: 'Background Check Certificate', type: 'Background Check', status: 'Pending', expiryDate: '2024-06-15', uploadDate: '2023-12-01', url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1000' },
];

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  trips: Trip[];
  metrics?: DriverMetrics[];
  vehicleMetrics?: import('../../types/data').VehicleMetrics[];
  onBack: () => void;
  fleetStats?: {
    avgEarningsPerTrip: number;
    avgAcceptanceRate: number;
    avgRating: number;
    avgWeeklyEarnings: number;
  };
}



export function DriverDetail({ driverId, driverName, driver, trips, metrics: csvMetrics, vehicleMetrics, onBack, fleetStats }: DriverDetailProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [localLoading, setLocalLoading] = useState(true);
  const [tripSearch, setTripSearch] = useState("");
  const [tripPage, setTripPage] = useState(1);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DriverDocument | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
      isOpen: boolean;
      initialWorkPeriodStart?: string;
      initialWorkPeriodEnd?: string;
      initialAmount?: number;
      editingTransaction?: FinancialTransaction;
  }>({ isOpen: false });
  const [settlementWeeks, setSettlementWeeks] = useState<Array<{ start: Date; end: Date; amountOwed: number; amountPaid: number; balance: number; status: string }>>([]);
  const [walletView, setWalletView] = useState<'ledger' | 'settlements'>('settlements');
  const [ledgerView, setLedgerView] = useState<'tolls' | 'payments' | 'fuel'>('tolls');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['All']));
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ preset: 'all' });

  // Date Range State (Default: Last 7 Days) — declared early so all hooks below can reference it
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });

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
  const [ledgerSummary, setLedgerSummary] = useState<any>(null);
  const [ledgerSummaryLoaded, setLedgerSummaryLoaded] = useState(false);
  const [ledgerOverview, setLedgerOverview] = useState<LedgerDriverOverview | null>(null);
  const [ledgerOverviewLoaded, setLedgerOverviewLoaded] = useState(false);
  const [repairInProgress, setRepairInProgress] = useState(false);
  const [repairResult, setRepairResult] = useState<any>(null);
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);
  const [cashDiagResult, setCashDiagResult] = useState<any>(null);
  const [cashDiagLoading, setCashDiagLoading] = useState(false);
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
  }, [driverId]);

  // ── Ledger summary fetch (Phase 10) ──
  useEffect(() => {
    let cancelled = false;
    const fetchLedgerSummary = async () => {
      try {
        const result = await api.getLedgerSummary({ driverId });
        if (!cancelled) {
          setLedgerSummary(result.summary || null);
          console.log(`[DriverDetail] Ledger summary for ${driverId}:`, result);
        }
      } catch (err) {
        console.error('[DriverDetail] Ledger summary fetch failed:', err);
      } finally {
        if (!cancelled) setLedgerSummaryLoaded(true);
      }
    };
    fetchLedgerSummary();
    return () => { cancelled = true; };
  }, [driverId]);



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
  
  // Phase 1: Date Range & Data Context Filtering
  const { minDate, maxDate, tripIds } = useMemo(() => {
      if (!allTrips || allTrips.length === 0) return { minDate: null, maxDate: null, tripIds: new Set<string>() };
      
      const validTrips = allTrips.filter(Boolean);
      const timestamps = validTrips.map(t => new Date(t.date).getTime());
      const ids = new Set(validTrips.map(t => t.id));
      
      return {
          minDate: new Date(Math.min(...timestamps)),
          maxDate: new Date(Math.max(...timestamps)),
          tripIds: ids
      };
  }, [allTrips]);

  const dateFilteredTransactions = useMemo(() => {
      // If no trips loaded, we can't determine context. showing nothing is safer than showing lifetime.
      if (!minDate || !maxDate) return [];

      const start = startOfDay(minDate);
      const end = endOfDay(maxDate);
      
      // Phase 1: Smart Date Buffering for Orphans
      // Allow orphans to appear if they are within 48 hours of the trip window.
      // This catches late-posting tolls that aren't yet linked to a trip.
      const bufferMs = 48 * 60 * 60 * 1000; 
      const bufferedStart = new Date(start.getTime() - bufferMs);
      const bufferedEnd = new Date(end.getTime() + bufferMs);

      return (transactions || []).filter(tx => {
          if (!tx) return false;
          // 1. If explicitly linked to a visible trip, always include
          // This keeps trip-linked items strictly bound to the trip's visibility
          if (tx.tripId && tripIds.has(tx.tripId)) return true;

          // 2. If Orphan (No tripId OR Trip not in view), check BUFFERED date range
          const txDate = new Date(tx.date);
          return txDate >= bufferedStart && txDate <= bufferedEnd;
      });
  }, [transactions, minDate, maxDate, tripIds]);

  // Phase 3: Filtered Cash Tolls (Expenses & Adjustments)
  // Phase 2 Update: Data Segregation (Hidden vs Active)
  const cashTollTransactions = useMemo(() => {
      // Create a Lookup Map for Claims (Source -> Claim)
      const claimMap = new Map<string, any>();
      claims.forEach(c => {
          if (c.transactionId) {
              claimMap.set(c.transactionId, c);
          }
          // Also map resolution transaction IDs back to the claim
          if (c.resolutionTransactionId) {
              claimMap.set(c.resolutionTransactionId, c);
          }
      });

      const processed = (dateFilteredTransactions || []).filter(Boolean).map(t => {
            // Find linked claim
            const claim = claimMap.get(t.id);
            
            // Classify
            const classification = classifyTollTransaction(t, claim);
            
            // Attach metadata for the UI
            return {
                ...t,
                _classification: classification,
                _claimId: claim?.id
            };
        });

      // Split into Active (Valid Financials) and Hidden (Ignored/Pending)
      const active: FinancialTransaction[] = [];
      const hidden: FinancialTransaction[] = [];

      processed.forEach(t => {
          if (!t) return;
          const c = t._classification;
          if (c === 'Ignored' || c === 'Pending_Dispute') {
              // Phase 1: Filter Hidden items to only show relevant Toll activity
              // Prevent Fuel, Cash Collections, etc. from appearing in "Hidden/Ignored"
              const category = (t.category || '').toLowerCase();
              const desc = (t.description || '').toLowerCase();

              const isBlacklisted = 
                  category === 'cash collection' || 
                  category === 'float issue' || 
                  category.includes('fuel') || 
                  category === 'payment' ||
                  t.paymentMethod === 'Tag Balance';

              const isTollRelated = 
                  category.includes('toll') || 
                  desc.includes('toll') || 
                  ['adjustment', 'claim', 'chargeback'].includes(category);

              // Only show if it's explicitly toll-related AND not blacklisted
              // OR if it's a Pending Dispute (which we always want to track)
              if ((isTollRelated && !isBlacklisted) || c === 'Pending_Dispute') {
                  hidden.push(t);
              }
          } else {
              active.push(t);
          }
      });

      return { active, hidden };
  }, [dateFilteredTransactions, claims]);

  // Phase 4: Payment Transactions
  // FIX: Use full `transactions` array instead of `dateFilteredTransactions`.
  // Manually-logged payments don't carry a tripId and fall outside the trip-date
  // window heuristic, causing them to be incorrectly hidden. Financial records
  // like cash collections / floats / adjustments should always be visible.
  const paymentTransactions = useMemo(() => (transactions || []).filter(t => {
      if (!t) return false;
      // Strict Safety: Never show Tag Balance operations in Payment Log
      if (t.paymentMethod === 'Tag Balance') return false;
      if (t.description?.toLowerCase().includes('top-up')) return false;

      // Exclude tolls just in case
      const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
      if (isToll) return false;

      // Exclude fuel from payment log (it has its own tab)
      const isFuel = (t.category || '').toLowerCase().includes('fuel') || (t.description || '').toLowerCase().includes('fuel');
      if (isFuel) return false;

      // Strict Payment Logic: Focus on Cash Collections (Money from Driver)
      const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';
      return isPayment && t.amount > 0;
  }), [transactions]);

  const fuelTransactions = useMemo(() => (dateFilteredTransactions || []).filter(t => {
      if (!t) return false;
      const cat = (t.category || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const type = (t.type || '').toLowerCase();
      const isAutomated = t.metadata?.automated === true;
      
      // Include ALL fuel-related transactions for the Fuel Activity wallet view
      const isFuel = cat.includes('fuel') || desc.includes('fuel') || type.includes('fuel');
      
      return isFuel || isAutomated;
  }), [dateFilteredTransactions]);

  // Calculate Toll Stats for new Metric Card
  const { disputeCharges, netTollReimbursement, fuelSpend } = useMemo(() => {
      let disputes = 0;
      let net = 0;
      let fuel = 0;

      // Use ACTIVE transactions for financial calculations
      cashTollTransactions.active.forEach(t => {
          const classification = t._classification;
          const amount = Math.abs(t.amount);

          if (classification === 'Resolved_Debit') {
              // This is a Charge to the driver (Reduce Reimbursement)
              net -= amount;
              disputes += amount; 
          } else if (classification === 'Standard_Credit' || classification === 'Resolved_Credit') {
              // This is a Reimbursement (Increase Net)
              net += amount;
          }
      });

      // Sum Fuel Spend for the period (Phase 7)
      fuelTransactions.forEach(t => {
          if (t.amount < 0) fuel += Math.abs(t.amount);
      });

      return { disputeCharges: disputes, netTollReimbursement: net, fuelSpend: fuel };
  }, [cashTollTransactions, fuelTransactions]);

  const [filterPlatform, setFilterPlatform] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCashOnly, setFilterCashOnly] = useState<boolean>(false);
  // Phase 3: Hidden Items UI State
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set()); // Phase 2: Debouncing/Locking
  const tripsPerPage = 10;

  // Phase 2: Tier State
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [quotaConfig, setQuotaConfig] = useState<QuotaConfig | null>(null);

  useEffect(() => {
    tierService.getTiers().then(setTiers).catch(console.error);
    tierService.getQuotaSettings().then(setQuotaConfig).catch(console.error);
  }, []);

  // Calculate Monthly Earnings & Current Tier (Independent of Date Range Selection)
  const { monthlyEarnings, currentTier } = useMemo(() => {
      const mEarnings = TierCalculations.calculateMonthlyEarnings(allTrips);
      const cTier = TierCalculations.getTierForEarnings(mEarnings, tiers);
      return { monthlyEarnings: mEarnings, currentTier: cTier };
  }, [allTrips, tiers]);

  // Fetch Transactions & Claims
  const refreshData = React.useCallback(async () => {
      setLocalLoading(true);
      try {
          // Collect all relevant driver IDs to query
          const driverIds = [
              driverId,
              driver?.uberDriverId,
              driver?.inDriveDriverId
          ].filter(Boolean) as string[];

          const [driverTx, allClaims] = await Promise.all([
              api.getTransactions(driverIds),
              api.getClaims(), // Fetch ALL claims to ensure we find links even if driverId filter is tricky
          ]);

          // Server-side filtering is now enabled for getTransactions(driverIds)
          const validTx = Array.isArray(driverTx) ? driverTx.filter(Boolean) : [];
          
          // Diagnostic: Log transaction breakdown to verify data completeness
          const paymentCount = validTx.filter((t: any) => t.category === 'Cash Collection' || t.type === 'Payment_Received').length;
          const tollCount = validTx.filter((t: any) => ['Toll Usage', 'Toll', 'Tolls'].includes(t.category)).length;
          const fuelCount = validTx.filter((t: any) => (t.category || '').toLowerCase().includes('fuel')).length;
          const floatCount = validTx.filter((t: any) => t.category === 'Float Issue').length;
          console.log(`[DriverDetail] Transactions loaded: ${validTx.length} total | ${paymentCount} payments | ${tollCount} tolls | ${fuelCount} fuel | ${floatCount} floats`);
          
          setTransactions(validTx);
          
          // Filter claims locally if needed, or just use all for linking (safer)
          setClaims(Array.isArray(allClaims) ? allClaims : []);
      } catch (e) {
          console.error("Failed to load data", e);
          // Ensure we don't crash if API fails
          // But don't clear data if it's just a refresh failure
          if (!transactions || transactions.length === 0) setTransactions([]);
          if (!claims || claims.length === 0) setClaims([]);
      } finally {
          setLocalLoading(false);
      }
  }, [driverId, driver]);

  React.useEffect(() => {
      refreshData();
  }, [refreshData]);

  // Grouped Transactions Logic (Trip-Centric)
  const groupedTollTransactions = useMemo(() => {
      // 0. Pre-process Claims to link Children -> Parents
      const childToParentMap = new Map<string, string>();
      claims.forEach(c => {
          if (c.transactionId && c.resolutionTransactionId) {
              childToParentMap.set(c.resolutionTransactionId, c.transactionId);
          }
      });

      // Use ACTIVE transactions for the main view
      const activeTransactions = cashTollTransactions.active;

      // Map for quick transaction lookup (needed to find parent's tripId)
      const txMap = new Map(activeTransactions.map(t => [t.id, t]));

      // 1. Index Transactions by TripId
      const txByTrip = new Map<string, FinancialTransaction[]>();
      const orphanTx: FinancialTransaction[] = [];

      (activeTransactions || []).forEach(tx => {
          if (!tx) return;
          let targetTripId = tx.tripId;

          // If no direct tripId, check if it's a child of a transaction that HAS a tripId
          if (!targetTripId && childToParentMap.has(tx.id)) {
              const parentId = childToParentMap.get(tx.id);
              const parentTx = parentId ? txMap.get(parentId) : undefined;
              if (parentTx && parentTx.tripId) {
                  targetTripId = parentTx.tripId;
              }
          }

          if (targetTripId) {
              const current = txByTrip.get(targetTripId) || [];
              current.push(tx);
              txByTrip.set(targetTripId, current);
          } else {
              orphanTx.push(tx);
          }
      });

      // 2. Build Trip Groups
      // We need to find trips that have transactions associated with them
      const tripGroups: { type: 'trip', data: Trip, children: FinancialTransaction[] }[] = [];
      const tripsWithTx = new Set<string>();

      (allTrips || []).forEach(trip => {
          if (!trip) return;
          const children = txByTrip.get(trip.id);
          if (children && children.length > 0) {
              tripGroups.push({
                  type: 'trip',
                  data: trip,
                  children: children
              });
              tripsWithTx.add(trip.id);
          }
      });

      // 3. Handle Orphans (Transactions with tripId that wasn't found in trips list, or no tripId)
      // Note: If we fetched *all* transactions but only *some* trips (pagination?), we might miss some parents.
      // For now, any transaction whose tripId wasn't found in the `trips` array is treated as an orphan.
      (activeTransactions || []).forEach(tx => {
          if (tx && tx.tripId && !tripsWithTx.has(tx.tripId)) {
              // This is a transaction with a tripId, but the trip isn't loaded in the current view.
              // We treat it as an orphan for now.
              orphanTx.push(tx);
          }
      });
      
      // Remove duplicates from orphanTx (since we might have pushed them twice in the logic above if not careful, 
      // but the logic above is: 
      // Loop 1: pushed if NO tripId. 
      // Loop 2: pushed if HAS tripId but trip not found. 
      // So no overlap. logic is safe.)

      // 4. Combine and Sort
      const unifiedList = [
          ...tripGroups,
          ...orphanTx.map(tx => ({ type: 'transaction' as const, data: tx }))
      ];

      const sortedList = unifiedList.sort((a, b) => {
          if (!a.data || !b.data) return 0;
          const dateA = new Date(a.data.date).getTime();
          const dateB = new Date(b.data.date).getTime();
          return dateB - dateA;
      });

      // Phase 4: Append Hidden Items Group
      if (showHidden && cashTollTransactions.hidden.length > 0) {
          const hiddenTrip: Trip = {
              id: 'hidden-items-group',
              driverId: driverId,
              vehicleId: 'system',
              // Place it at the very bottom (oldest date) or top? Plan says bottom.
              // We'll use a date far in the past to ensure sort puts it last, or just push it after sort.
              date: new Date(0).toISOString(), 
              status: 'Archived', 
              platform: 'System',
              amount: 0,
              distance: 0,
              duration: 0,
              startTime: '',
              endTime: '',
              route: 'Archived / Ignored Transactions',
              dropoffLocation: 'Archived / Ignored Transactions'
          };

          sortedList.push({
              type: 'trip',
              data: hiddenTrip,
              children: cashTollTransactions.hidden
          });
      }

      return sortedList;
  }, [cashTollTransactions, allTrips, showHidden, driverId]);

  const toggleRow = (id: string) => {
      const newSet = new Set(expandedRows);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setExpandedRows(newSet);
  };

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
      // Determine fields based on transaction type
      let category = "Cash Collection";
      let type: any = "Revenue";
      let amount = payment.amount;

      if (payment.transactionType === 'float') {
        category = "Float Issue";
        type = "Float_Given";
        // Float increases debt. logic: netOutstanding = (TotalOwed - CashReceived).
        // To increase netOutstanding, CashReceived must decrease. So amount is negative.
        amount = -Math.abs(payment.amount); 
      } else if (payment.transactionType === 'adjustment') {
        category = "Adjustment";
        type = "Adjustment";
        // Assuming positive adjustment reduces debt (like a payment)
      } else {
         // Payment
         category = "Cash Collection";
         type = "Payment_Received";
         amount = Math.abs(payment.amount);
      }

      // Determine Status
      // Cash is always completed immediately.
      // Non-cash payments (Bank Transfer, etc.) are Pending until verified.
      // Outflows (Float) or Adjustments are assumed Completed (Admin action).
      const isCash = payment.paymentMethod === 'Cash';
      const isIncomingPayment = payment.transactionType === 'payment';
      const initialStatus = (isIncomingPayment && !isCash) ? 'Pending' : 'Completed';

      const metadata: any = {};
      if (payment.workPeriodStart && payment.workPeriodEnd) {
          metadata.workPeriodStart = payment.workPeriodStart;
          metadata.workPeriodEnd = payment.workPeriodEnd;
      }

      const newTx: Partial<FinancialTransaction> = {
          driverId,
          amount: amount,
          date: payment.date,
          description: payment.notes || (payment.transactionType === 'float' ? "Cash Float Issued" : "Cash Payment from Driver"),
          category: category,
          type: type,
          paymentMethod: payment.paymentMethod as any,
          referenceNumber: payment.referenceNumber,
          status: initialStatus as any,
          isReconciled: initialStatus === 'Completed',
          time: new Date().toLocaleTimeString(),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      };
      
      if (payment.id) {
          const updatedTx = { ...newTx, id: payment.id };
          await api.saveTransaction(updatedTx);
          setTransactions(prev => prev.map(t => t.id === payment.id ? { ...t, ...updatedTx } as FinancialTransaction : t));
          // toast.success removed here - LogCashPaymentModal handles it
      } else {
          const saved = await api.saveTransaction(newTx);
          // api.saveTransaction already unwraps result.data, so `saved` IS the transaction object.
          // Previously `saved.data` was used here which evaluates to undefined.
          const savedTx = saved?.data || saved;
          console.log('[DriverDetail] New payment saved:', savedTx?.id, savedTx?.category, savedTx?.type, savedTx?.amount);
          setTransactions(prev => [savedTx, ...prev].filter(Boolean));
      }
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
          toast.success("Transaction deleted");
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

  const handleFixTransactionFormat = async (tx: FinancialTransaction) => {
      const toastId = toast.loading("Fixing transaction format...");
      try {
          const updatedTx: FinancialTransaction = {
              ...tx,
              category: 'Adjustment', // Fix Category
              type: 'Adjustment', // Ensure Type is Adjustment for consistency
              amount: -Math.abs(tx.amount), // Ensure it is Negative (Debit)
              metadata: {
                  ...tx.metadata,
                  fixedFormat: true,
                  originalId: tx.id,
                  fixReason: 'Format Error'
              }
          };

          await api.saveTransaction(updatedTx);
          
          // Update local state
          setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));
          
          toast.dismiss(toastId);
          toast.success("Transaction fixed");
      } catch (e) {
          console.error("Fix Transaction Error:", e);
          toast.dismiss(toastId);
          toast.error("Failed to fix transaction");
      }
  };

  const handleRetryCharge = async (tx: any) => {
      // Debug/Validation
      if (!tx._claimId) {
          toast.error("Error: Missing Claim ID. Cannot retry.");
          return;
      }

      // Debounce Check
      if (processingIds.has(tx._claimId)) {
          return;
      }

      setProcessingIds(prev => new Set(prev).add(tx._claimId));
      
      const toastId = toast.loading("Processing charge retry...");
      
      try {
          // Find the claim
          const claim = claims.find(c => c.id === tx._claimId);
          
          if (!claim) {
              toast.dismiss(toastId);
              toast.error("Claim record not found locally. Please refresh.");
              return;
          }

          // 1. Create the missing transaction MANUALLY
          // Since the backend is just a storage layer, we must construct the transaction here.
          // CRITICAL: We use 'Adjustment' category so it appears as a DEBIT (Charge) in the ledger.
          // Using 'Toll' would make it appear as a Credit (Reimbursement).
          const newTransaction: Partial<FinancialTransaction> = {
              driverId: driverId,
              amount: -Math.abs(claim.amount), // Ensure it's a debit (negative)
              date: claim.date || new Date().toISOString(),
              time: claim.time || new Date().toLocaleTimeString(),
              description: claim.description || "Toll Charge (Recovery)",
              category: 'Adjustment', 
              type: 'Adjustment', // Consistent with Fix Format logic
              status: 'Completed',
              tripId: claim.tripId, // CRITICAL: Link to trip
              metadata: {
                  source: 'retry_charge',
                  claimId: claim.id,
                  originalCategory: claim.category
              }
          };

          // 2. Save the transaction
          // api.saveTransaction returns the transaction object directly (it unwraps result.data)
          const savedTx = await api.saveTransaction(newTransaction);
          
          if (!savedTx || !savedTx.id) {
              throw new Error("Failed to receive transaction ID from server");
          }
          
          const newTxId = savedTx.id;

          // 3. Update the claim to link to this new transaction
          const updatedClaim = {
              ...claim,
              status: 'Resolved',
              resolutionReason: 'Charge Driver',
              resolutionTransactionId: newTxId,
              updatedAt: new Date().toISOString()
          };

          // 4. Save the updated claim
          await api.saveClaim(updatedClaim);
          
          toast.dismiss(toastId);
          toast.success("Charge retry processed successfully");
          
          // 5. Refresh data to see the new transaction
          await refreshData();
      } catch (e) {
          console.error("Retry Charge Error:", e);
          toast.dismiss(toastId);
          toast.error("Failed to retry charge. See console for details.");
      } finally {
          setProcessingIds(prev => {
              const next = new Set(prev);
              next.delete(tx._claimId);
              return next;
          });
      }
  };
  
  // Merge Real Documents with Mock Documents
  const documents = useMemo(() => {
     // Clone mocks
     const docs = MOCK_DOCUMENTS.map(d => ({ ...d }));

     if (driver) {
         // 1. License Front
         if (driver.licenseFrontUrl) {
             const idx = docs.findIndex(d => d.type === 'License');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseFrontUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 2. License Back
         if (driver.licenseBackUrl) {
             const idx = docs.findIndex(d => d.type === 'License Back');
             if (idx >= 0) {
                 docs[idx].url = driver.licenseBackUrl;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             }
         }

         // 3. Proof of Address
         if (driver.proofOfAddressUrl) {
             const idx = docs.findIndex(d => d.type === 'Address Proof');
             const docName = `Proof of Address (${driver.proofOfAddressType || 'Document'})`;
             
             if (idx >= 0) {
                 docs[idx].url = driver.proofOfAddressUrl;
                 docs[idx].name = docName;
                 docs[idx].status = 'Verified';
                 docs[idx].uploadDate = new Date().toISOString().split('T')[0];
             } else {
                 // If for some reason it wasn't in mocks (e.g. if we removed it), add it back
                 docs.push({
                     id: 'real-proof-addr',
                     name: docName,
                     type: 'Address Proof',
                     status: 'Verified',
                     expiryDate: '2024-12-31',
                     uploadDate: new Date().toISOString().split('T')[0],
                     url: driver.proofOfAddressUrl
                 });
             }
         }
     }
     return docs;
  }, [driver]);
  
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
          source: isLedgerMoneyReadModelEnabled() ? 'canonical' : undefined,
        });
        if (!cancelled) {
          setLedgerOverview(result);
          console.log(`[DriverDetail LEDGER] Overview loaded for ${driverId} (${startDate}..${endDate}):`, result);
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

  // Calculate Metrics based on Date Range
   // Phase 7 NOTE: This useMemo computes THREE categories of data:
   //   1. LEGACY FINANCIAL — periodEarnings, cashCollected, totalTolls, weeklyEarningsData, etc.
   //      Only consumed by the resolvedFinancials fallback path + metrics.earningsPerKm.
   //      DriverPayoutHistory migrated to ledger in Phase 8 — no longer a consumer.
   //   2. OPERATIONAL — totalDistance, totalDuration, completionRate, distanceMetrics, tripRatio,
   //      fuelMetrics, platformStats.completed/distance/rating. Used by Efficiency + Trips tabs.
   //   3. CASH WALLET — floatHeld, pendingClearance, approvedFuelCredits, cashReceived (still live).
   //      Phase 5: netOutstanding/periodCashReceived/periodNetChange are DEAD CODE. totalCashCollected kept as fallback for walletMetrics.
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
        netOutstanding: 0,
        approvedFuelCredits: 0,
        floatHeld: 0,
        pendingClearance: 0,
        acceptanceRate: 0,
        currentRating: 0,
        completionRate: 0,
        cancellationRate: 0,
        totalTolls: 0,
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
     let totalCashCollected = 0; // Lifetime — Phase 5: now FALLBACK only (walletMetrics uses it when ledger unavailable)
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
         if (selectedPlatforms.has('All') || selectedPlatforms.has(t.platform || 'Other')) { const timeScoped = activeTab === 'overview' || activeTab === 'trips'; if (timeScoped && timeFilter.preset !== 'all') { const h = new Date(t.date).getHours(); if (!isHourInTimeFilter(h, timeFilter)) return false; } return true; } return false;
         // time+platform filter handled above
     });

     filteredTrips.forEach(trip => {
        const tripDateObj = new Date(trip.date);
        if (isNaN(tripDateObj.getTime())) return;
        
        // FIX: Determine effective cash (handling Roam/Private legacy/missing data)
        const platformName = (trip.platform || 'Other').toLowerCase();
        const isCashPlatform = ['goride', 'roam', 'private', 'cash'].includes(platformName);
        const rawCash = Number(trip.cashCollected || 0);
        const effectiveCash = (Math.abs(rawCash) > 0)
           ? rawCash
           : (isCashPlatform ? trip.amount : 0);

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
        const mStart = new Date(m.periodStart);
        const mEnd = new Date(m.periodEnd);
        return mStart <= end && mEnd >= start;
     }) : [];

     // Uber CSV cash override: only use driver_metric rows whose **period overlaps** the selected range.
     // Including every row with `uberPaymentsTransactionCashColumnSum` (ignoring dates) caused one
     // stale import total to appear as Uber cash on **every** date range after partial deletes.
     const relevantCsvMetricsForUberCash = (isAllPlatforms && csvMetrics)
       ? csvMetrics.filter(m => {
           const mStart = new Date(m.periodStart);
           const mEnd = new Date(m.periodEnd);
           return mStart <= end && mEnd >= start;
         })
       : [];

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
     const GAP_THRESHOLD_MINS = 45; // 45 minutes
     const GAP_THRESHOLD_HOURS = GAP_THRESHOLD_MINS / 60;
     const MIN_UNAVAILABLE_BLOCK_HOURS = 4; // 4 hours implies shift end/sleep
     const AVG_OPEN_SPEED = 20; // km/h (Cruising for fares)
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

     const FUEL_EFFICIENCY_KMPL = 12; // Toyota Sienta Hybrid Average
     
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

     // Completion Rate (Calculated from Logs)
     const completionRate = totalTrips > 0 ? (periodCompletedTrips / totalTrips) * 100 : 0;
     
     // Cancellation Rate (Calculated from Logs)
     const cancellationRate = totalTrips > 0 ? (periodCancelledTrips / totalTrips) * 100 : 0;

     // --- PHASE 2 FIX: USE IMPORTED METRICS IF AVAILABLE ---
     // (Calculated in Phase 4)

     const latestCsvMetric = relevantCsvMetrics.length > 0 
        ? [...relevantCsvMetrics].sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]
        : null;

     let acceptanceRate: number | null = null;
     if (latestCsvMetric?.acceptanceRate !== undefined) {
        acceptanceRate = Math.round(latestCsvMetric.acceptanceRate * 100);
     } else if (totalTrips > 0) {
        // Fallback to completion rate if we have trips but no CSV metric
        acceptanceRate = Math.round(completionRate);
     }
     
     const currentRating = latestCsvMetric?.ratingLast4Weeks || latestCsvMetric?.ratingLast500 || 5.0;

     // Phase 5: totalCashCollected override — FALLBACK path (used by walletMetrics when ledger unavailable)
     if (latestCsvMetric?.cashCollected) {
         totalCashCollected = Math.max(totalCashCollected, latestCsvMetric.cashCollected);
     }

     // Phase 4: Cash Logic

     // DEAD CODE (Phase 5): csvPeriodCash / cashCollected override — only fed dead periodNetChange
     // Calculate cash from CSV only if the selected range covers the CSV period
     const csvPeriodCash = relevantCsvMetrics.reduce((sum, m) => {
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
     
     // 1. DEAD CODE (Phase 5): totalFloatIssued — identical to floatHeld, only fed dead netOutstanding
     // In transactions, floats are negative (money leaving fleet). We need the absolute value.
     const totalFloatIssued = Math.abs((transactions || [])
        .filter(t => t && t.category === "Float Issue")
        .reduce((sum, t) => sum + (t?.amount || 0), 0));

     // 2. Calculate Payments Received (Cash returned to fleet)
     // Strictly look for 'Payment_Received' type or 'Cash Collection' category.
     // These are positive values (money entering fleet).
     const totalPaymentsReceived = (transactions || [])
        .filter(t => {
            if (!t) return false;
            // Strict Safety: Never include Tag Balance operations as Driver Payments
            if (t.paymentMethod === 'Tag Balance') return false;
            
            return (t.type === 'Payment_Received' || t.category === 'Cash Collection') && t.amount > 0;
        })
        .reduce((sum, t) => sum + (t?.amount || 0), 0);

     // 3. DEAD CODE (Phase 5): approvedCashTollExpenses — walletMetrics recomputes this
     // These must be CASH payments (receipts) that are RESOLVED or APPROVED (Reimbursed/Written Off).
     // These reduce the liability.
     const approvedCashTollExpenses = (transactions || [])
        .filter(t => {
            if (!t) return false;
            const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
            const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl; // Assumption: Receipts imply cash/personal payment
            const isResolved = t.status === 'Resolved' || t.status === 'Approved'; // Accept both statuses
            return isToll && isCash && isResolved;
        })
        .reduce((sum, t) => sum + Math.abs(t?.amount || 0), 0);

     // 3b. Calculate Approved Fuel Reimbursement Credits
     const approvedFuelCredits = (transactions || [])
        .filter(t => {
            if (!t) return false;
            const isFuelCredit = t.category === 'Fuel Reimbursement Credit' || t.category === 'Fuel Reimbursement';
            return isFuelCredit && t.amount > 0;
        })
        .reduce((sum, t) => sum + (t?.amount || 0), 0);

     // 4. DEAD CODE (Phase 5): Old Net Outstanding — replaced by walletMetrics useMemo
     // netOutstanding, totalFloatIssued, approvedCashTollExpenses, periodCashReceived, periodNetChange below are no longer consumed.
     // Note: totalCashCollected is Lifetime, calculated earlier in the loop.
     const netOutstanding = (totalCashCollected + totalFloatIssued) - (totalPaymentsReceived + approvedCashTollExpenses);

     const cashReceived = totalPaymentsReceived; // Alias for backward compatibility if needed, but we used refined logic above.

     const periodCashReceived = (transactions || [])
        .filter(t => {
            if (!t) return false;
            const d = new Date(t.date);
            if (t.paymentMethod === 'Tag Balance') return false;
            return isWithinInterval(d, { start, end }) && (t.type === 'Payment_Received' || t.category === 'Cash Collection');
        })
        .reduce((sum, t) => sum + (t?.amount || 0), 0);
     
     const periodNetChange = cashCollected - periodCashReceived;

     // Wallet State Logic (Phase 5)
     // Float Held: Total sum of negative transactions categorized as "Float Issue"
     // Note: In transactions, floats are negative.
     const floatHeld = Math.abs((transactions || [])
        .filter(t => t && t.category === "Float Issue")
        .reduce((sum, t) => sum + (t?.amount || 0), 0));

     // Pending Clearance: Sum of transactions with status "Pending"
     // Only count positive payments (inflows) as pending clearance, not floats or adjustments unless positive
     const pendingClearance = (transactions || [])
        .filter(t => t && t.status === 'Pending' && t.amount > 0)
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

     // Uber: statement cash = Excel SUM(payments_transaction Cash Collected) or payments_driver line (matches Uber app).
     let uberCsvCashCollectedMagnitude: number | null = null;
     if (isAllPlatforms && relevantCsvMetricsForUberCash.length > 0) {
       let sumTx = 0;
       let hasTx = false;
       for (const m of relevantCsvMetricsForUberCash) {
         const v = m.uberPaymentsTransactionCashColumnSum;
         if (v != null && v !== 0) {
           sumTx += v;
           hasTx = true;
         }
       }
       if (hasTx) {
         uberCsvCashCollectedMagnitude = Math.abs(sumTx);
       } else {
         let sumDriver = 0;
         let hasDriver = false;
         for (const m of relevantCsvMetricsForUberCash) {
           if (m.dataSources?.includes('payment') && m.cashCollected != null) {
             sumDriver += m.cashCollected;
             hasDriver = true;
           }
         }
         if (hasDriver) uberCsvCashCollectedMagnitude = Math.abs(sumDriver);
       }
     }

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
        netOutstanding,
        approvedFuelCredits, // Phase 5: Fuel reimbursement credits
        periodCashReceived, // New
        periodNetChange,    // New
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
      if (!ledgerPlatforms.has(p)) {
        missingFromLedger.push(p);
      }
    }
    const isLedgerComplete = missingFromLedger.length === 0;
    if (!isLedgerComplete && ledgerHasData) {
      console.log(`[ResolvedFinancials] Ledger incomplete — missing platforms: ${missingFromLedger.join(', ')}. Auto-repair will regenerate.`);
    }
    if (ledgerHasData) {
      // Merge ledger financial fields with trip-computed operational fields
      const platformStats: Record<string, any> = {};
      // Start with trip-computed platforms (keeps distance, ratings, completed counts)
      for (const [platform, stats] of Object.entries(metrics.platformStats)) {
        platformStats[platform] = { ...stats };
      }
      // Override financial fields from ledger
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

      const trendPercent = ledgerOverview.prevPeriod.earnings > 0
        ? ((ledgerOverview.period.earnings - ledgerOverview.prevPeriod.earnings) / ledgerOverview.prevPeriod.earnings) * 100
        : ledgerOverview.period.earnings > 0 ? 100 : 0;

      // Phase 8: Inject "Dispute Recoveries" into metrics.platformStats so the existing
      // JSX breakdown (.filter stats.tolls > 0) naturally picks it up.
      // NOTE: JSX reads metrics.platformStats, NOT resolvedFinancials.platformStats.
      // Controlled mutation is safe — resolvedFinancials depends on metrics and both
      // run in the same render cycle; metrics is recreated on every dep change.
      const drAmt = Number(ledgerOverview.period.disputeRefunds) || 0;
      if (drAmt > 0) {
        metrics.platformStats['Dispute Recoveries'] = {
          earnings: 0, trips: 0, completed: 0, distance: 0,
          ratingSum: 0, ratingCount: 0, cashCollected: 0,
          tolls: drAmt,
        };
      } else {
        delete metrics.platformStats['Dispute Recoveries'];
      }

      // Replace ledger Uber cash with CSV statement total (Excel SUM of Cash Collected) when available.
      let periodCashCollected = ledgerOverview.period.cashCollected;
      const uberCsvCash = metrics.uberCsvCashCollectedMagnitude;
      if (uberCsvCash != null) {
        const ledgerUber = Number(ledgerOverview.platformStats?.Uber?.cashCollected ?? 0);
        periodCashCollected = periodCashCollected - ledgerUber + uberCsvCash;
        if (platformStats.Uber) {
          platformStats.Uber.cashCollected = uberCsvCash;
        } else if (metrics.platformStats?.Uber) {
          platformStats.Uber = { ...metrics.platformStats.Uber, cashCollected: uberCsvCash };
        }
      }

      return {
        periodEarnings: ledgerOverview.period.earnings,
        prevPeriodEarnings: ledgerOverview.prevPeriod.earnings,
        trendPercent: trendPercent.toFixed(1),
        trendUp: ledgerOverview.period.earnings >= ledgerOverview.prevPeriod.earnings,
        cashCollected: periodCashCollected,
        totalTolls: ledgerOverview.period.tolls,
        disputeRefunds: ledgerOverview.period.disputeRefunds || 0,
        totalTips: ledgerOverview.period.tips,
        totalBaseFare: ledgerOverview.period.baseFare,
        uberLedgerReconciliation: ledgerOverview.period.uber || undefined,
        platformFees: ledgerOverview.period.platformFees ?? 0,
        platformFeesByPlatform: ledgerOverview.period.platformFeesByPlatform || {},
        fareGrossMinusNetByPlatform: ledgerOverview.period.fareGrossMinusNetByPlatform || {},
        platformStats,
        weeklyEarningsData,
        tripCount: ledgerOverview.period.tripCount,
        readModelSource: ledgerOverview.readModelSource,
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
        lifetimeCashCollected: ledgerOverview.lifetime.cashCollected,
        lifetimeTolls: ledgerOverview.lifetime.tolls,
        lifetimeDisputeRefunds: ledgerOverview.lifetime.disputeRefunds || 0,
        lifetimePlatformStats: ledgerOverview.lifetime.platformStats || {},
      };
    }
    // ⚠️ LEGACY FALLBACK — Phase 7 safety net. If this fires, ledger is incomplete.
    // Phase 6 monitoring should detect & auto-repair. Investigate if this persists.
    if (ledgerOverviewLoaded) {
      console.log(`[ResolvedFinancials] Awaiting ledger data — ledgerHasData=${!!ledgerHasData}, isLedgerComplete=${isLedgerComplete}, missing=[${missingFromLedger.join(',')}]. Auto-repair will resolve if needed.`);
    }
    return {
      // Phase 6: Return zeros — no trip-sourced financial fallback
      periodEarnings: 0,
      prevPeriodEarnings: 0,
      trendPercent: '0.0',
      trendUp: true,
      cashCollected: 0,
      totalTolls: 0,
      disputeRefunds: 0,
      totalTips: 0,
      totalBaseFare: 0,
      uberLedgerReconciliation: undefined,
      platformFees: 0,
      platformFeesByPlatform: {} as Record<string, number>,
      fareGrossMinusNetByPlatform: {} as Record<string, number>,
      platformStats: metrics.platformStats, // Keep operational fields (distance, completed, rating)
      weeklyEarningsData: [],
      tripCount: metrics.periodCompletedTrips,
      readModelSource: undefined,
      source: 'trips' as const,
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
  }, [ledgerOverview, ledgerOverviewLoaded, metrics]);

  // Phase 6.2: Hybrid earningsPerKm — ledger earnings ÷ trip-sourced distance
  const ledgerEarningsPerKm = useMemo(() => {
    const earnings = resolvedFinancials.periodEarnings || 0;
    const distance = metrics.totalDistance || 0;
    return distance > 0 ? earnings / distance : 0;
  }, [resolvedFinancials.periodEarnings, metrics.totalDistance]);

  // ── Phase 4: Ledger-sourced Cash Wallet metrics ──
  // Uses lifetime cash from the ledger (single source of truth) combined with
  // transaction-derived values (floats, payments, toll expenses, fuel credits).
  const walletMetrics = useMemo(() => {
    const ledgerLifetimeCash = resolvedFinancials.lifetimeCashCollected || metrics.totalCashCollected || 0;
    const floatIssued = metrics.floatHeld;
    const paymentsReceived = metrics.cashReceived || 0;
    const tollExpenses = (transactions || [])
      .filter((t: any) => {
        if (!t) return false;
        const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
        const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl;
        const isResolved = t.status === 'Resolved' || t.status === 'Approved';
        return isToll && isCash && isResolved;
      })
      .reduce((sum: number, t: any) => sum + Math.abs(t?.amount || 0), 0);
    const netOutstanding = (ledgerLifetimeCash + floatIssued) - (paymentsReceived + tollExpenses);
    return { netOutstanding, lifetimeCashCollected: ledgerLifetimeCash };
  }, [resolvedFinancials.lifetimeCashCollected, metrics.totalCashCollected, metrics.floatHeld, metrics.cashReceived, transactions]);

  /** Same ledger + cash weeks pipeline as Financials → Payout (weekly), for net settlement on Cash Wallet. */
  const { periodData: walletPayoutPeriodRows } = useDriverPayoutPeriodRows({
    driverId,
    trips: allTrips,
    transactions,
    csvMetrics,
    periodType: 'weekly',
  });

  const walletNetSettlement = useMemo(
    () => aggregateFinalizedNetSettlement(walletPayoutPeriodRows),
    [walletPayoutPeriodRows]
  );

  const walletPendingEarningsWeeks = useMemo(
    () => countPendingEarningsPeriods(walletPayoutPeriodRows),
    [walletPayoutPeriodRows]
  );

  /** Key = Monday yyyy-MM-dd for matching WeeklySettlementView weeks to Payout rows. */
  const weekSettlementByMonday = useMemo(() => {
    const map: WeekSettlementMap = {};
    for (const row of walletPayoutPeriodRows) {
      const key = format(row.periodStart, 'yyyy-MM-dd');
      if (!row.isFinalized) {
        map[key] = { finalized: false };
        continue;
      }
      const comp = getPeriodSettlementComponents(row);
      map[key] = {
        finalized: true,
        settlement: comp.settlement,
        adjCashBalance: comp.adjCashBalance,
        netPayoutApplied: comp.netPayoutApplied,
        cashBalance: row.cashBalance,
        fuelCredits: row.fuelCredits,
      };
    }
    return map;
  }, [walletPayoutPeriodRows]);

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
      console.log(`[AutoRepair] Triggering ledger repair for driver ${driverId} — missing platforms: ${resolvedFinancials.missingPlatforms.join(', ')}`);
      // DISABLED: Auto-repair was firing on every date change. Use manual button instead.
      // handleRepairLedger();
    }
  }, [resolvedFinancials.source, resolvedFinancials.missingPlatforms, ledgerOverviewLoaded, driverId, repairInProgress, repairResult]);




  // ────────────────────────────────────────────────────────────
  // Platform Breakdown for Earnings donut chart (Step 5.6)
  //   Prefers lifetime per-platform stats from the ledger.
  //   Falls back to raw trips only when ledger has no lifetime platform data.
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

    const ltStats = resolvedFinancials.lifetimePlatformStats;
    if (ltStats && Object.keys(ltStats).length > 0) {
      // Ledger path: use lifetime per-platform earnings from the server
      return Object.entries(ltStats)
        .map(([rawPlat, stats]: [string, any]) => ({
          name: normalizePlatform(rawPlat),
          value: stats.earnings || 0,
          color: colors[normalizePlatform(rawPlat)] || '#94a3b8',
        }))
        .filter(d => d.value > 0);
    }

    // Fallback: compute from raw trips (temporary — until ledger is fully populated)
    const completed = (allTrips || []).filter(t => t.status === 'Completed');
    const platformTotals: Record<string, number> = {};
    completed.forEach(trip => {
      const platform = normalizePlatform(trip.platform);
      const earnings = getEffectiveTripEarnings(trip);
      platformTotals[platform] = (platformTotals[platform] || 0) + earnings;
    });
    return Object.entries(platformTotals)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: colors[name] || '#94a3b8' }));
  }, [resolvedFinancials.lifetimePlatformStats, allTrips]);

  const platformTotalEarnings = useMemo(() =>
    platformBreakdownData.reduce((sum, d) => sum + d.value, 0),
    [platformBreakdownData]
  );

  const handleDateSelect = (newRange: DateRange | undefined) => {
    if (newRange?.from) {
      setDateRange(newRange);
    }
  };

  // Phase 6.4: Repair handler — regenerates missing ledger entries for this driver
  const handleRepairLedger = async () => {
    setRepairInProgress(true);
    setRepairResult(null);
    try {
      // Pass trip IDs from client-side allTrips so the repair endpoint doesn't
      // have to re-discover them (the client already found them via the broader
      // driverIds + driverName OR search in getTripsFiltered).
      const clientTripIds = allTrips
        .filter(t => t?.id && t.status === 'Completed')
        .map(t => t.id);
      console.log(`[DriverDetail] Sending ${clientTripIds.length} client trip IDs to repair endpoint`);
      const result = await api.repairDriverLedger(driverId, clientTripIds, true);
      setRepairResult(result);
      console.log(`[DriverDetail] Ledger repair complete:`, result);
      // Refresh ledger overview after repair (bump key to re-trigger useEffect with current dateRange)
      setLedgerRefreshKey(k => k + 1);
      if (false && dateRange?.from) { // DISABLED: stale-closure bug — replaced by ledgerRefreshKey bump above
        const startDate = format(dateRange.from, 'yyyy-MM-dd');
        const endDate = format(dateRange.to || dateRange.from, 'yyyy-MM-dd');
        const platforms = selectedPlatforms.has('All') ? undefined : Array.from(selectedPlatforms);
        const refreshed = await api.getLedgerDriverOverview({
          driverId,
          startDate,
          endDate,
          platforms,
          source: isLedgerMoneyReadModelEnabled() ? 'canonical' : undefined,
        });
        setLedgerOverview(refreshed);
      }
    } catch (err: any) {
      console.error('[DriverDetail] Ledger repair failed:', err);
      setRepairResult({ success: false, error: err.message });
    } finally {
      setRepairInProgress(false);
    }
  };

  const handleCashDiagnostic = async () => {
    setCashDiagLoading(true);
    setCashDiagResult(null);
    try {
      const result = await api.getCashDiagnostic(driverId);
      setCashDiagResult(result);
      console.log('[CashDiag] Result:', result);
    } catch (err: any) {
      console.error('[CashDiag] Failed:', err);
      setCashDiagResult({ success: false, error: err.message });
    } finally {
      setCashDiagLoading(false);
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

  if (localLoading && (!metrics || metrics.totalTrips === 0)) {
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
        <Button variant="ghost" onClick={onBack} className="gap-2 pl-0 hover:pl-2 transition-all">
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

           <TimeFilterDropdown value={timeFilter} onChange={setTimeFilter} inactive={activeTab !== 'overview' && activeTab !== 'trips'} />{/* Date Picker */}
           <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[260px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleDateSelect}
                  numberOfMonths={2}
                  showOutsideDays={false}
                  required
                />
              </PopoverContent>
            </Popover>
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

           <Button variant="outline" size="sm">
             <Download className="h-4 w-4 mr-2" />
             Export
           </Button>
           <Button variant="default" size="sm">
             <MessageSquare className="h-4 w-4 mr-2" />
             Message
           </Button>
        </div>
      </div>

      {/* Driver Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
        <div className="flex items-start gap-4 col-span-1 md:col-span-2">
          <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
             <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driverId}`} />
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
                <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
             </div>
             <div className="text-sm text-slate-500 flex flex-col gap-1">
                <span className="flex items-center gap-2"><CreditCardIcon className="h-3 w-3" /> ID: {driverId}</span>
                {driver?.uberDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">Uber UUID: {driver.uberDriverId}</span>
                )}
                {driver?.inDriveDriverId && (
                   <span className="text-xs text-slate-400 ml-5 block">InDrive UUID: {driver.inDriveDriverId}</span>
                )}
                <span className="flex items-center gap-2"><CarIcon className="h-3 w-3" /> Vehicle: 2019 Toyota Sienta (5179KZ)</span>
                <span className="flex items-center gap-2"><CalendarIcon className="h-3 w-3" /> Member Since: Oct 12, 2023</span>
             </div>
          </div>
        </div>
        
        <div className="col-span-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-3">
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
                 5.0 <Star className="h-4 w-4 fill-current" />
              </div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4" onValueChange={setActiveTab}>
         <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financial">Financials</TabsTrigger>
            <TabsTrigger value="operations">Efficiency</TabsTrigger>
            <TabsTrigger value="quality">Service Quality</TabsTrigger>
            <TabsTrigger value="trips">Trip History</TabsTrigger>
            <TabsTrigger value="wallet">Cash Wallet</TabsTrigger>
            <TabsTrigger value="indrive-wallet">InDrive Wallet</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
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

             {false && (
             <div className="flex items-center gap-3">
               <button
                 onClick={handleRepairLedger}
                 disabled={repairInProgress}
                 className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
               >
                 {repairInProgress ? (
                   <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Recalculating...</>
                 ) : (
                   <><RefreshCw className="h-3.5 w-3.5" /> Recalculate Ledger</>
                 )}
               </button>
               {repairResult?.success && (
                 <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                   <CheckCircle2 className="h-3.5 w-3.5" />
                   Done — replaced {repairResult.stats?.forceDeleted || 0}, created {repairResult.stats?.ledgerCreated || 0} ({repairResult.durationMs}ms)
                 </span>
               )}
               {repairResult?.success === false && (
                 <span className="text-xs text-rose-600 dark:text-rose-400">Failed: {repairResult.error}</span>
                )}
              </div>
              )}
              {/*  DEAD CODE: original closings + orphan lines absorbed by this comment
                )}
              </div>
              )}
               )}
             </div>

             */}
              {/* ── Phase 1: Repair Ledger + Phase 2: Cash Diagnostic Tool ── */}
              {false && (<div className="mt-2 mb-3 flex items-center gap-2 flex-wrap">
                <button onClick={handleRepairLedger} disabled={repairInProgress} className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors">{repairInProgress ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Repairing Ledger...</>) : (<><RefreshCw className="h-3.5 w-3.5" /> Repair Ledger</>)}</button>
                {repairResult?.success && (<span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Repair complete — {repairResult.stats?.ledgerCreated || 0} created, {repairResult.stats?.alreadyExisted || 0} existed</span>)}
                {repairResult?.success === false && (<span className="text-xs text-rose-600 dark:text-rose-400">Repair failed: {repairResult.error}</span>)}
                {false && (<button
                  onClick={handleCashDiagnostic}
                  disabled={cashDiagLoading}
                  className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                >
                  {cashDiagLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running Cash Diagnostic...</>
                  ) : (
                    <><Search className="h-3.5 w-3.5" /> Cash Diagnostic</>
                  )}
                </button>)}
                {false && cashDiagResult && cashDiagResult.success && (
                  <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-2 max-w-2xl">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">Cash Diagnostic Results</span>
                      <button onClick={() => setCashDiagResult(null)} className="text-slate-400 hover:text-slate-600 text-xs">Dismiss</button>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">Driver: {cashDiagResult.driverName || cashDiagResult.driverId} | {cashDiagResult.completedTrips} completed trips | {cashDiagResult.durationMs}ms</p>
                    {Object.entries(cashDiagResult.platforms || {}).map(([platform, data]: [string, any]) => (
                      <div key={platform} className="border-t border-slate-200 dark:border-slate-700 pt-2">
                        <p className="font-semibold text-slate-600 dark:text-slate-300">{platform} — {data.total} trips</p>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                          <div className="bg-white dark:bg-slate-900 rounded p-1.5 text-center">
                            <p className="text-lg font-bold text-sky-600">{data.withCashCollectedGt0}</p>
                            <p className="text-[10px] text-slate-400">cashCollected &gt; 0</p>
                          </div>
                          <div className="bg-white dark:bg-slate-900 rounded p-1.5 text-center">
                            <p className="text-lg font-bold text-amber-600">{data.withPaymentMethodCash}</p>
                            <p className="text-[10px] text-slate-400">paymentMethod = Cash</p>
                          </div>
                          <div className="bg-white dark:bg-slate-900 rounded p-1.5 text-center">
                            <p className="text-lg font-bold text-emerald-600">{data.withEitherCashSignal}</p>
                            <p className="text-[10px] text-slate-400">Either signal</p>
                          </div>
                        </div>
                        {data.samples && data.samples.length > 0 && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-sky-600 hover:underline text-[11px]">Show {data.samples.length} sample trips</summary>
                            <div className="mt-1 overflow-x-auto">
                              <table className="w-full text-[10px] border-collapse">
                                <thead><tr className="text-left text-slate-400"><th className="pr-2 py-0.5">Date</th><th className="pr-2">Amount</th><th className="pr-2">cashCollected</th><th className="pr-2">paymentMethod</th><th>fareBreakdown.cashCollected</th></tr></thead>
                                <tbody>
                                  {data.samples.map((s: any, i: number) => (
                                    <tr key={s.id || i} className="border-t border-slate-100 dark:border-slate-800">
                                      <td className="pr-2 py-0.5 text-slate-500">{s.date?.substring(0, 10)}</td>
                                      <td className="pr-2">${s.amount}</td>
                                      <td className="pr-2 font-mono">{s.cashCollected === null ? <span className="text-rose-400">null</span> : s.cashCollected}</td>
                                      <td className="pr-2 font-mono">{s.paymentMethod === null ? <span className="text-rose-400">null</span> : s.paymentMethod}</td>
                                      <td className="font-mono">{s.fareBreakdown?.cashCollected === null ? <span className="text-rose-400">null</span> : (s.fareBreakdown?.cashCollected ?? <span className="text-rose-400">n/a</span>)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {false && cashDiagResult && cashDiagResult.success === false && (
                  <p className="mt-1 text-xs text-rose-600">Diagnostic failed: {cashDiagResult.error}</p>
                )}
              </div>)}
              <OverviewMetricsGrid
                resolvedFinancials={resolvedFinancials}
                metrics={metrics}
                uberPaymentCsvRollup={metrics.uberPaymentCsvRollup}
                localLoading={localLoading}
                isToday={!!isToday}
                driverId={driverId}
                walletRange={ledgerDateRangeStrings}
                platformFilterAllPlatforms={selectedPlatforms.has('All')}
                onWalletLoadSuccess={async () => {
                  await refreshData();
                  setLedgerRefreshKey((k) => k + 1);
                }}
              />
             {false && (<div>
               <MetricCard 
                  title={isToday ? "Today's Earnings" : "Period Earnings"} 
                   subtext={
                    resolvedFinancials.source === 'ledger'
                      ? resolvedFinancials.readModelSource === 'canonical_events'
                        ? 'Posted ledger (canonical)'
                        : 'Posted ledger'
                      : 'Trips fallback'
                  }
                  value={`$${resolvedFinancials.periodEarnings.toFixed(2)}`} 
                  trend={`${resolvedFinancials.trendPercent}% vs prev`} 
                  trendUp={resolvedFinancials.trendUp}
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  loading={localLoading}
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.earnings > 0 || stats.completed > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `$${stats.earnings.toFixed(2)}`,
                           color: getPlatformColor(label)
                       }))}
               />
               <MetricCard 
                  title="Cash Collected" 
                  value={`$${resolvedFinancials.cashCollected.toFixed(2)}`} 
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  tooltip="Total cash collected from trips during this period"
                  loading={localLoading}
                  breakdown={[
                      ...Object.entries(resolvedFinancials.platformStats)
                          .filter(([_, stats]: [string, any]) => stats.cashCollected > 0)
                          .map(([label, stats]: [string, any]) => ({
                              label: label, 
                              value: `$${stats.cashCollected.toFixed(2)}`, 
                              color: '#f43f5e' 
                          }))
                  ]}
               />
               <MetricCard 
                  title="Km Driven for Period" 
                  value={`${metrics.totalDistance.toFixed(1)} km`} 
                  icon={<Navigation className="h-4 w-4 text-slate-500" />}
                  loading={localLoading}
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.distance > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `${stats.distance.toFixed(1)} km`,
                           color: getPlatformColor(label)
                       }))}
               />
               <Card>
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-slate-500">Time Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div className="h-[180px] w-full relative">
                        {localLoading && (
                            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                            </div>
                        )}
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Pie
                                 data={[
                                    { name: 'Open Time', value: metrics.tripRatio.available, fill: '#1e3a8a' },
                                    { name: 'Enroute Time', value: metrics.tripRatio.toTrip, fill: '#fbbf24' },
                                    { name: 'On Trip Time', value: metrics.tripRatio.onTrip, fill: '#10b981' },
                                    { name: 'Unavailable Time', value: metrics.tripRatio.unavailable, fill: '#94a3b8' }
                                 ]}
                                 cx="50%"
                                 cy="50%"
                                 innerRadius={55}
                                 outerRadius={75}
                                 paddingAngle={0}
                                 dataKey="value"
                                 startAngle={90}
                                 endAngle={-270}
                                 stroke="none"
                              >
                                 
                                 
                                 
                                 
                              </Pie>
                              <Tooltip key="tt-ts" formatter={(value: number) => [value.toFixed(2) + ' hrs', 'Duration']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                           </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                           <div className="text-2xl font-bold text-slate-900">{metrics.tripRatio.totalOnline.toFixed(2)}</div>
                           <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Hours Online</div>
                        </div>
                     </div>
                     <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
                        <TooltipProvider>
                           <UiTooltip>
                              <TooltipTrigger asChild>
                                 <div className="flex flex-col items-center gap-1 cursor-help">
                                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.available.toFixed(2)} h</span>
                                    <div className="flex items-center gap-1.5">
                                       <div className="w-2 h-2 rounded-full bg-[#1e3a8a]"></div>
                                       <span className="text-xs font-medium text-slate-500">Open</span>
                                    </div>
                                 </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                 <p className="max-w-xs">The amount of time the driver was online and available to accept new trip requests (waiting for a "ping").</p>
                              </TooltipContent>
                           </UiTooltip>
                           
                           <UiTooltip>
                              <TooltipTrigger asChild>
                                 <div className="flex flex-col items-center gap-1 cursor-help">
                                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.toTrip.toFixed(2)} h</span>
                                    <div className="flex items-center gap-1.5">
                                       <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
                                       <span className="text-xs font-medium text-slate-500">Enroute</span>
                                    </div>
                                 </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                 <p className="max-w-xs">The time spent traveling to a pickup location after accepting a request.</p>
                              </TooltipContent>
                           </UiTooltip>

                           <UiTooltip>
                              <TooltipTrigger asChild>
                                 <div className="flex flex-col items-center gap-1 cursor-help">
                                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.onTrip.toFixed(2)} h</span>
                                    <div className="flex items-center gap-1.5">
                                       <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
                                       <span className="text-xs font-medium text-slate-500">On Trip</span>
                                    </div>
                                 </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                 <p className="max-w-xs">The time spent with a passenger or delivery in the vehicle, from pickup to drop-off.</p>
                              </TooltipContent>
                           </UiTooltip>

                           <UiTooltip>
                              <TooltipTrigger asChild>
                                 <div className="flex flex-col items-center gap-1 cursor-help">
                                    <span className="text-sm font-bold text-slate-900">{metrics.tripRatio.unavailable.toFixed(2)} h</span>
                                    <div className="flex items-center gap-1.5">
                                       <div className="w-2 h-2 rounded-full bg-[#94a3b8]"></div>
                                       <span className="text-xs font-medium text-slate-500">Unavail</span>
                                    </div>
                                 </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                 <p className="max-w-xs">The time the driver was logged into the system but marked as "Unavailable" (e.g., taking a break or paused).</p>
                              </TooltipContent>
                           </UiTooltip>
                        </TooltipProvider>
                     </div>
                  </CardContent>
               </Card>
               <MetricCard 
                  title={resolvedFinancials.disputeRefunds > 0 ? "Total Toll Recovery" : "Platform Toll Refunds"}
                  value={`$${(resolvedFinancials.totalTolls + (resolvedFinancials.disputeRefunds || 0)).toFixed(2)}`}
                  subtext={resolvedFinancials.disputeRefunds > 0 ? "Trip refunds + dispute recoveries" : "From trip-level toll charges"}
                   tooltip={resolvedFinancials.disputeRefunds > 0 ? "Trip Toll Refunds: Tolls automatically reimbursed by the platform in trip fares. Dispute Refunds: Additional refunds won by disputing underpaid tolls with Uber Support." : undefined}
                  icon={<DollarSign className="h-4 w-4 text-slate-500" />}
                  loading={localLoading}
                   breakdown={Object.entries(metrics.platformStats)
                       .filter(([_, stats]: [string, any]) => stats.tolls > 0)
                       .map(([label, stats]: [string, any]) => ({
                           label,
                           value: `$${stats.tolls.toFixed(2)}`,
                           color: getPlatformColor(label)
                       }))}
               />
               <Card>
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-slate-500">Distance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                     {metrics.distanceMetrics ? (
                        <>
                           <div className="h-[180px] w-full relative">
                              {localLoading && (
                                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                                  </div>
                              )}
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={[
                                          { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                                          { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                                          { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                                          { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                                          // New Cancellation Segments
                                          { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' }, // Orange
                                          { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' }, // Red
                                          { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' }, // Slate
                                       ].filter(d => d.value > 0)}
                                       cx="50%"
                                       cy="50%"
                                       innerRadius={55}
                                       outerRadius={75}
                                       paddingAngle={0}
                                       dataKey="value"
                                       startAngle={90}
                                       endAngle={-270}
                                       stroke="none"
                                    >
                                       
                                           
                                       {[
                                          { name: 'Open Dist', value: metrics.distanceMetrics.open, fill: '#1e3a8a' },
                                          { name: 'Enroute Dist', value: metrics.distanceMetrics.enroute, fill: '#fbbf24' },
                                          { name: 'On Trip Dist', value: metrics.distanceMetrics.onTrip, fill: '#10b981' },
                                          { name: 'Unavailable Dist', value: metrics.distanceMetrics.unavailable, fill: '#94a3b8' },
                                          { name: 'Rider Cancelled', value: metrics.distanceMetrics.riderCancelled || 0, fill: '#f97316' },
                                          { name: 'Driver Cancelled', value: metrics.distanceMetrics.driverCancelled || 0, fill: '#ef4444' },
                                          { name: 'Delivery Failed', value: metrics.distanceMetrics.deliveryFailed || 0, fill: '#475569' }
                                       ].filter(d => d.value > 0).map((d, i) => (<Cell key={`di-${i}`} fill={d.fill} />
                                          
                                       ))}
                                    </Pie>
                                    <Tooltip key="tt-dist" formatter={(value: number) => [value.toFixed(2) + ' km', 'Distance']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                                 </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                 <div className="text-2xl font-bold text-slate-900">{metrics.distanceMetrics.total.toFixed(2)}</div>
                                 <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total KM</div>
                              </div>
                           </div>
                           <div className="mt-4 grid grid-cols-4 gap-2 px-2 text-center">
                              <TooltipProvider>
                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.open.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#1e3a8a] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Open</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled while the driver was online and waiting for a request.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.enroute.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Enroute</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled while the driver was heading to the pickup location.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.onTrip.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">On Trip</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled during the actual trip (from pickup to destination).</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.distanceMetrics.unavailable.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Unavail</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled while the driver was in an unavailable or offline-equivalent state.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 {/* NEW CANCELLATION STATS */}
                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.riderCancelled || 0).toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#f97316] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Rider Cx</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled on trips cancelled by the rider.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.driverCancelled || 0).toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Driver Cx</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled on trips cancelled by the driver.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{(metrics.distanceMetrics.deliveryFailed || 0).toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#475569] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Failed</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Distance traveled on failed deliveries.</p>
                                    </TooltipContent>
                                 </UiTooltip>
                              </TooltipProvider>
                           </div>
                        </>
                     ) : (
                        <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
                           <Navigation className="h-10 w-10 mb-2 opacity-20" />
                           <p className="text-sm">No distance breakdown</p>
                           <p className="text-xs mt-1">Upload "Time & Distance" Report</p>
                        </div>
                     )}
                  </CardContent>
               </Card>

               {/* Fuel Usage Split Tile */}
               <Card>
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-medium text-slate-500">Fuel Usage Split</CardTitle>
                  </CardHeader>
                  <CardContent>
                     {metrics.fuelMetrics ? (
                        <>
                           <div className="h-[180px] w-full relative">
                              {localLoading && (
                                  <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-10 backdrop-blur-[1px]">
                                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                                  </div>
                              )}
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={[
                                          { name: 'Ride Share', value: metrics.fuelMetrics.rideShare, fill: '#10b981' }, 
                                          { name: 'Company Ops', value: metrics.fuelMetrics.companyOps, fill: '#fbbf24' }, 
                                          { name: 'Personal', value: metrics.fuelMetrics.personal, fill: '#ef4444' }, 
                                          { name: 'Misc/Leakage', value: metrics.fuelMetrics.misc, fill: '#94a3b8' } 
                                       ]}
                                       cx="50%"
                                       cy="50%"
                                       innerRadius={55}
                                       outerRadius={75}
                                       paddingAngle={0}
                                       dataKey="value"
                                       startAngle={90}
                                       endAngle={-270}
                                       stroke="none"
                                    >
                                       
                                       
                                       
                                       
                                    </Pie>
                                    <Tooltip key="tt-fuel" formatter={(value: number) => [value.toFixed(1) + ' L', 'Fuel']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#64748b' }} />
                                 </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                 <div className="text-2xl font-bold text-slate-900">{metrics.fuelMetrics.total.toFixed(0)}</div>
                                 <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Total L</div>
                              </div>
                           </div>
                           <div className="mt-4 grid grid-cols-4 gap-1 text-center px-2">
                              <TooltipProvider>
                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.rideShare.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#10b981] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">RideShare</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Fuel consumed during revenue-generating trips.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.companyOps.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#fbbf24] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Com. Ops</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Fuel consumed for company operations.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.personal.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Personal</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Fuel consumed for personal use.</p>
                                    </TooltipContent>
                                 </UiTooltip>

                                 <UiTooltip>
                                    <TooltipTrigger asChild>
                                       <div className="flex flex-col items-center gap-1 cursor-help">
                                          <span className="text-sm font-bold text-slate-900">{metrics.fuelMetrics.misc.toFixed(2)}</span>
                                          <div className="flex items-center gap-1.5 justify-center w-full">
                                             <div className="w-2 h-2 rounded-full bg-[#94a3b8] shrink-0"></div>
                                             <span className="text-xs font-medium text-slate-500 truncate">Leakage</span>
                                          </div>
                                       </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                       <p className="max-w-xs">Unaccounted fuel consumption or leakage.</p>
                                    </TooltipContent>
                                 </UiTooltip>
                              </TooltipProvider>
                           </div>
                        </>
                     ) : (
                        <div className="h-[250px] flex flex-col items-center justify-center text-slate-400">
                           <Fuel className="h-10 w-10 mb-2 opacity-20" />
                           <p className="text-sm">No fuel data</p>
                           <p className="text-xs mt-1">Requires Time & Distance</p>
                        </div>
                     )}
                  </CardContent>
               </Card>
            </div>

            )}
             {/* Benchmarking Section */}
            <DistanceByPlatform perPlatformDistance={metrics.perPlatformDistance} loading={localLoading} />

            {fleetStats && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-indigo-600" />
                            Performance Benchmarks
                        </CardTitle>
                        <CardDescription>Comparing {driverName} against the fleet average.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Earnings Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Earnings per Trip</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">${(resolvedFinancials.periodEarnings / Math.max(1, resolvedFinancials.tripCount)).toFixed(2)}</span>
                                        <span className="text-xs text-slate-500 ml-2">vs ${fleetStats.avgEarningsPerTrip.toFixed(2)} avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                    {/* Fleet Avg Marker */}
                                    <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: '60%' }} 
                                    />
                                    {/* Driver Bar */}
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            (resolvedFinancials.periodEarnings / Math.max(1, resolvedFinancials.tripCount)) >= fleetStats.avgEarningsPerTrip 
                                                ? "bg-emerald-500" 
                                                : "bg-amber-500"
                                        )}
                                        style={{ width: `${Math.min(100, ((resolvedFinancials.periodEarnings / Math.max(1, resolvedFinancials.tripCount)) / (fleetStats.avgEarningsPerTrip * 1.5)) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                    {(resolvedFinancials.periodEarnings / Math.max(1, resolvedFinancials.tripCount)) >= fleetStats.avgEarningsPerTrip 
                                        ? "Performing above fleet average." 
                                        : "Performing below fleet average."}
                                </p>
                            </div>

                            {/* Acceptance Rate Comparison */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm font-medium text-slate-700">Acceptance Rate</span>
                                    <div className="text-right">
                                        <span className="text-lg font-bold">{metrics.acceptanceRate !== null ? `${metrics.acceptanceRate}%` : '-'}</span>
                                        <span className="text-xs text-slate-500 ml-2">vs {fleetStats.avgAcceptanceRate}% avg</span>
                                    </div>
                                </div>
                                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                     {/* Fleet Avg Marker */}
                                     <div 
                                        className="absolute top-0 bottom-0 w-1 bg-slate-400 z-10" 
                                        style={{ left: `${fleetStats.avgAcceptanceRate}%` }} 
                                    />
                                    <div 
                                        className={cn("h-full rounded-full", 
                                            !metrics.acceptanceRate ? "bg-slate-300" : metrics.acceptanceRate >= fleetStats.avgAcceptanceRate ? "bg-emerald-500" : "bg-rose-500"
                                        )}
                                        style={{ width: `${metrics.acceptanceRate || 0}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                     {!metrics.acceptanceRate 
                                        ? "No data for this period." 
                                        : metrics.acceptanceRate >= fleetStats.avgAcceptanceRate 
                                            ? "Excellent reliability." 
                                            : "Acceptance rate is critical."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               <Card className="lg:col-span-2">
                  <CardHeader>
                     <CardTitle>Financial Performance</CardTitle>
                     <CardDescription>Earnings over selected period.</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={resolvedFinancials.weeklyEarningsData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                           <XAxis 
                              dataKey="fullDate" tickFormatter={(val: string) => { try { return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return val; } }}
                              axisLine={false} 
                              tickLine={false} 
                              interval={metrics.daysDiff > 14 ? 'preserveStartEnd' : 0}
                              tick={{ fontSize: 12 }}
                           />
                           <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                           <Tooltip 
                              cursor={{fill: '#f1f5f9'}}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                           />
                           <Bar key="bar-uber" dataKey="Uber" stackId="a" fill="#3b82f6" />
                           <Bar key="bar-indrive" dataKey="InDrive" stackId="a" fill="#10b981" />
                           <Bar key="bar-other" dataKey="Other" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </CardContent>
               </Card>

               <Card>
                  <CardHeader>
                     <CardTitle className="text-rose-600 flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Immediate Actions
                     </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="space-y-3">
                        <div className="flex items-start gap-3 p-3 bg-rose-50 rounded-lg border border-rose-100">
                           <div className="h-6 w-6 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                           <div>
                              <p className="font-medium text-rose-900 text-sm">Low Trip Count</p>
                              <p className="text-xs text-rose-700 mt-1">Driver has low activity this week.</p>
                           </div>
                        </div>
                     </div>
                     <Button className="w-full mt-2" variant="outline">View Full Action Plan</Button>
                  </CardContent>
               </Card>
            </div>
         </TabsContent>

         <TabsContent value="financial" className="space-y-6">
           <FinancialSubTabs
             driverId={driverId}
             transactions={transactions}
             allTrips={allTrips}
             quotaConfig={quotaConfig}
             platformBreakdownData={platformBreakdownData}
             platformTotalEarnings={platformTotalEarnings}
             csvMetrics={csvMetrics}
             uberLedgerReconciliation={resolvedFinancials.uberLedgerReconciliation}
           />
            {/* ___OLD_FINANCIAL_SUBTABS_BLOCK_1___ <Tabs defaultValue="earnings" className="space-y-4">
             <TabsList className="grid w-full grid-cols-3 max-w-[450px]">
               <TabsTrigger value="earnings">Earnings</TabsTrigger>
               <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="payout">Payout</TabsTrigger>
             </TabsList>

             <TabsContent value="earnings" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
               <Card>
                  <CardHeader>
                     <CardTitle>Earnings Breakdown by Platform</CardTitle>
                     <CardDescription className="text-xs text-slate-500">All-time completed trip earnings across platforms</CardDescription>
                  </CardHeader>
                  <CardContent>
                     {platformBreakdownData.length > 0 ? (
                       <div className="flex flex-col md:flex-row items-center gap-6">
                         <div className="w-full md:w-1/2">
                           <ResponsiveContainer width="100%" height={260}>
                              <PieChart>
                                 <Pie
                                    key="pie-plat-brk"
                                     data={platformBreakdownData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                 >
                                    {platformBreakdownData.map((entry, index) => (
                                       <Cell key={`plat-${index}`} fill={entry.color} />
                                    ))}
                                    <RechartsLabel
                                      position="center"
                                      content={({ viewBox }: any) => {
                                        const { cx, cy } = viewBox || { cx: 130, cy: 130 };
                                        return (
                                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                                          <tspan x={cx} dy="-8" fontSize="18" fontWeight="bold" fill="#1e293b">
                                            {`$${platformTotalEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                          </tspan>
                                          <tspan x={cx} dy="22" fontSize="11" fill="#94a3b8">
                                            Total Earnings
                                          </tspan>
                                        </text>
                                        );
                                      }}
                                    />
                                 </Pie>
                                 <Tooltip
                                   key="tt-plat-brk"
                                    formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Earnings']}
                                 />
                              </PieChart>
                           </ResponsiveContainer>
                         </div>
                         <div className="w-full md:w-1/2 space-y-2">
                           {platformBreakdownData.map(d => {
                             const pct = platformTotalEarnings > 0 ? (d.value / platformTotalEarnings * 100) : 0;
                             return (
                               <div key={d.name} className="flex items-center gap-3">
                                 <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                                 <div className="flex-1 min-w-0">
                                   <div className="flex items-center justify-between">
                                     <span className="text-sm font-medium text-slate-700">{d.name}</span>
                                     <span className="text-sm text-slate-600 font-medium">
                                       {`$${d.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                     </span>
                                   </div>
                                   <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1">
                                     <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                                   </div>
                                 </div>
                                 <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(0)}%</span>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     ) : (
                       <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                         No completed trips found for earnings breakdown.
                       </div>
                     )}
                  </CardContent>
               </Card>
            </div>

            <DriverEarningsHistory
              driverId={driverId}
              quotaConfig={quotaConfig || undefined}
            />
         </TabsContent>

         <TabsContent value="expenses" className="space-y-6">
                <DriverExpensesHistory driverId={driverId} transactions={transactions} trips={allTrips} />
              </TabsContent>
            </Tabs>
          </TabsContent>

              ___OLD_FINANCIAL_SUBTABS_BLOCK_1_END___ */}
          </TabsContent>
          {/* ___OLD_FINANCIAL_SUBTABS_BLOCK_2___
                <DriverPayoutHistory driverId={driverId} transactions={transactions} trips={allTrips} />
              </TabsContent>
            </Tabs>
          </TabsContent>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-6">
             ___OLD_FINANCIAL_SUBTABS_BLOCK_2_END___ */}
          <TabsContent value="wallet" className="space-y-6">
             {/* Summary Cards Row (Phase 5) */}
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                 {/* Card 1: Net settlement (matches Payout period settlement, finalized weeks only) */}
                 <Card className="bg-white border-indigo-100/80 shadow-sm ring-1 ring-indigo-100/60">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Net Settlement</CardTitle>
                         <Landmark className="h-4 w-4 text-indigo-500" />
                     </CardHeader>
                     <CardContent>
                         <div className={cn("text-2xl font-bold", walletNetSettlement > 0.005 ? "text-rose-600" : walletNetSettlement < -0.005 ? "text-blue-600" : "text-emerald-600")}>
                             ${walletNetSettlement.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             {walletNetSettlement > 0.005
                               ? "Driver owes fleet (after net payout)"
                               : walletNetSettlement < -0.005
                                 ? "Fleet owes driver"
                                 : "Balanced"}
                         </p>
                         {walletPendingEarningsWeeks > 0 && (
                           <p className="text-[11px] text-amber-600 mt-1">
                             {walletPendingEarningsWeeks} week{walletPendingEarningsWeeks !== 1 ? 's' : ''} not finalized — excluded from total
                           </p>
                         )}
                     </CardContent>
                 </Card>

                 {/* Card 2: Cash position (gross — before netting earnings) */}
                 <Card className="bg-white">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Cash Position (gross)</CardTitle>
                         <DollarSign className="h-4 w-4 text-slate-500" />
                     </CardHeader>
                     <CardContent>
                         <div className={cn("text-2xl font-bold", walletMetrics.netOutstanding > 0 ? "text-rose-600" : "text-emerald-600")}>
                             ${walletMetrics.netOutstanding.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Ledger cash + float − payments − cash tolls (pre–net payout)
                         </p>
                     </CardContent>
                 </Card>

                 {/* Card 2: Net Reimbursements (Tolls + Fuel Credits) */}
                 <Card className="bg-white">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Net Reimbursements</CardTitle>
                         <TrendingUp className="h-4 w-4 text-emerald-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-emerald-600">
                             ${(netTollReimbursement + metrics.approvedFuelCredits).toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Tolls: <span className="font-medium">${netTollReimbursement.toFixed(2)}</span> | Fuel: <span className="font-medium text-emerald-600">${metrics.approvedFuelCredits.toFixed(2)}</span>
                         </p>
                         {disputeCharges > 0 && (
                             <p className="text-xs text-slate-500 mt-0.5">
                                 Includes <span className="text-red-600 font-medium">-${disputeCharges.toFixed(2)}</span> in disputes
                             </p>
                         )}
                     </CardContent>
                 </Card>

                 {/* Card 3: Float Held */}
                 <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Float Held</CardTitle>
                         <Wallet className="h-4 w-4 text-amber-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-amber-600">
                             ${metrics.floatHeld.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Active cash float
                         </p>
                     </CardContent>
                 </Card>

                  {/* Card 3: Unverified Payments */}
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium text-slate-500">Unverified Payments</CardTitle>
                         <Clock className="h-4 w-4 text-blue-500" />
                     </CardHeader>
                     <CardContent>
                         <div className="text-2xl font-bold text-blue-600">
                             ${metrics.pendingClearance.toFixed(2)}
                         </div>
                         <p className="text-xs text-slate-500 mt-1">
                             Pending bank transfers
                         </p>
                     </CardContent>
                 </Card>
             </div>

             <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900">Financial Records</h3>
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button 
                       className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-all", walletView === 'settlements' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                       onClick={() => setWalletView('settlements')}
                    >
                       Weekly Settlements
                    </button>
                    <button 
                       className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-all", walletView === 'ledger' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900")}
                       onClick={() => setWalletView('ledger')}
                    >
                       Transaction Ledger
                    </button>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    {walletView === 'settlements' ? (
                        <WeeklySettlementView 
                            trips={allTrips}
                            transactions={transactions}
                            csvMetrics={csvMetrics}
                            weekSettlementByMonday={weekSettlementByMonday}
                            onWeeksComputed={setSettlementWeeks}
                            onLogPayment={(start, end, amount) => setPaymentModalState({
                                isOpen: true,
                                initialWorkPeriodStart: start.toISOString(),
                                initialWorkPeriodEnd: end.toISOString(),
                                initialAmount: amount
                            })}
                        />
                    ) : (
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle>Transaction Ledger</CardTitle>
                                        <CardDescription>History of cash payments and adjustments.</CardDescription>
                                    </div>
                                    <div className="flex p-1 bg-slate-100 rounded-lg shrink-0">
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'tolls' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('tolls')}
                                        >
                                            Toll Activity
                                        </button>
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'payments' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('payments')}
                                        >
                                            Payments Log
                                        </button>
                                        <button 
                                            className={cn(
                                                "px-3 py-1.5 text-xs font-medium rounded-md transition-all", 
                                                ledgerView === 'fuel' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
                                            )}
                                            onClick={() => setLedgerView('fuel')}
                                        >
                                            Fuel Activity
                                        </button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {ledgerView === 'tolls' ? (
                                    <div className="space-y-4">
                                        {/* Phase 3: Hidden Items Filter Bar */}
                                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id="show-hidden" 
                                                        checked={showHidden} 
                                                        onCheckedChange={(checked) => setShowHidden(checked as boolean)} 
                                                    />
                                                    <Label 
                                                        htmlFor="show-hidden" 
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                                                    >
                                                        Show Hidden / Ignored
                                                        {cashTollTransactions.hidden.length > 0 && (
                                                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-slate-200 text-slate-600 hover:bg-slate-300">
                                                                {cashTollTransactions.hidden.length}
                                                            </Badge>
                                                        )}
                                                    </Label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-slate-200 overflow-x-auto">
                                            <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[110px]">Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[90px]">Status</TableHead>
                                                    <TableHead className="text-right text-red-700 w-[90px]">Debit</TableHead>
                                                    <TableHead className="text-right text-emerald-700 w-[90px]">Credit</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {groupedTollTransactions.length > 0 ? (
                                                    groupedTollTransactions.map((item) => {
                                                        if (item.type === 'trip') {
                                                            // TRIP ROW (Parent)
                                                            const trip = item.data as Trip;
                                                            const children = item.children;
                                                            const hasChildren = children.length > 0;
                                                            const isExpanded = expandedRows.has(trip.id);

                                                            // Calculate total toll credit from children (Phase 2)
                                                            const totalTollCredit = children
                                                                .filter(child => {
                                                                    const c = (child as any)._classification;
                                                                    return c === 'Standard_Credit' || c === 'Resolved_Credit';
                                                                })
                                                                .reduce((sum, child) => sum + Math.abs(child.amount), 0);

                                                            const totalTollDebit = children
                                                                .filter(child => (child as any)._classification === 'Resolved_Debit')
                                                                .reduce((sum, child) => sum + Math.abs(child.amount), 0);

                                                            return (
                                                                <React.Fragment key={trip.id}>
                                                                    <TableRow 
                                                                        className={cn("transition-colors bg-slate-50 border-b border-slate-200", hasChildren && "cursor-pointer hover:bg-slate-100")}
                                                                        onClick={() => hasChildren && toggleRow(trip.id)}
                                                                    >
                                                                        <TableCell className="font-medium text-slate-600">
                                                                            <div className="flex items-center gap-2">
                                                                                {hasChildren && (
                                                                                    <div className="text-slate-400">
                                                                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                    </div>
                                                                                )}
                                                                                {(() => {
                                                    const d = parseTripDate(trip.date);
                                                    return d ? format(d, 'MMM d, yyyy') : '-';
                                                })()}
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-col max-w-[250px]">
                                                                                <TooltipProvider>
                                                                                    <UiTooltip>
                                                                                        <TooltipTrigger asChild>
                                                                                            <span className="font-medium text-slate-900 truncate">
                                                                                                Trip: {trip.route || trip.dropoffLocation || "Unknown Route"}
                                                                                            </span>
                                                                                        </TooltipTrigger>
                                                                                        <TooltipContent>
                                                                                            <p>Trip: {trip.route || trip.dropoffLocation || "Unknown Route"}</p>
                                                                                        </TooltipContent>
                                                                                    </UiTooltip>
                                                                                </TooltipProvider>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 border-slate-300 text-slate-500">
                                                                                        {normalizePlatform(trip.platform)}
                                                                                    </Badge>
                                                                                    <span className="text-xs text-slate-400 font-mono">
                                                                                        {format(parseTripDate(trip.date) || new Date(), 'HH:mm')}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <Badge variant="secondary" className={cn(
                                                                                "hover:bg-opacity-80",
                                                                                trip.status === 'Completed' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                                                                            )}>
                                                                                {trip.status}
                                                                            </Badge>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            {totalTollDebit > 0 ? (
                                                                                <span className="text-red-600 font-bold">-${totalTollDebit.toFixed(2)}</span>
                                                                            ) : (
                                                                                <span className="text-slate-300">-</span>
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-mono">
                                                                            {totalTollCredit > 0 ? (
                                                                                <span className="text-emerald-600 font-bold">+${totalTollCredit.toFixed(2)}</span>
                                                                            ) : (
                                                                                <span className="text-slate-300">-</span>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>

                                                                    {/* CHILD ROWS (Transactions nested under Trip) */}
                                                                    {hasChildren && isExpanded && children.map(child => {
                                                                        const classification = (child as any)._classification;
                                                                        const isResolvedDebit = classification === 'Resolved_Debit';
                                                                        const isStandardCredit = classification === 'Standard_Credit';
                                                                        const isResolvedCredit = classification === 'Resolved_Credit';
                                                                        const isCredit = isStandardCredit || isResolvedCredit;
                                                                        
                                                                        // Phase 5: Hidden/Archived Logic
                                                                        const isHidden = child.status === 'Ignored' || trip.status === 'Archived';
                                                                         
                                                                         return (
                                                                            <TableRow 
                                                                                key={child.id} 
                                                                                className={cn(
                                                                                    "bg-white hover:bg-slate-50 border-l-4 border-l-slate-200",
                                                                                    isHidden && "opacity-60 bg-slate-50 border-l-slate-300"
                                                                                )}
                                                                            >
                                                                                <TableCell className="pl-12 relative">
                                                                                    {/* Indentation Visuals */}
                                                                                    <div className="absolute left-6 top-0 bottom-1/2 w-px bg-slate-200"></div>
                                                                                    <div className="absolute left-6 top-1/2 w-4 h-px bg-slate-200"></div>
                                                                                    <span className="text-slate-500 text-xs font-mono">
                                                                                        {child.time || (() => { const d = parseTripDate(child.date); return d ? format(d, 'HH:mm') : '-'; })()}
                                                                                    </span>
                                                                                </TableCell>
                                                                                <TableCell>
                                                                                    <div className="flex items-center gap-2 max-w-[250px]">
                                                                                        {child.receiptUrl ? (
                                                                                            <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                                                                                        ) : (
                                                                                            <CornerDownRight className="h-3 w-3 text-slate-400 shrink-0" />
                                                                                        )}
                                                                                        <TooltipProvider>
                                                                                            <UiTooltip>
                                                                                                <TooltipTrigger asChild>
                                                                                                    <span className={cn("text-sm truncate text-slate-700", isHidden && "line-through text-slate-500")}>
                                                                                                        {child.description}
                                                                                                    </span>
                                                                                                </TooltipTrigger>
                                                                                                <TooltipContent>
                                                                                                    <p>{child.description}</p>
                                                                                                </TooltipContent>
                                                                                            </UiTooltip>
                                                                                        </TooltipProvider>
                                                                                    </div>
                                                                                </TableCell>
                                                                                <TableCell>
                                                                                    {isHidden ? (
                                                                                        <TooltipProvider>
                                                                                            <UiTooltip>
                                                                                                <TooltipTrigger asChild>
                                                                                                    <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200 cursor-help">
                                                                                                        {child.status}
                                                                                                    </Badge>
                                                                                                </TooltipTrigger>
                                                                                                <TooltipContent>
                                                                                                    <p>Excluded from calculations (Outside date range or manually ignored).</p>
                                                                                                </TooltipContent>
                                                                                            </UiTooltip>
                                                                                        </TooltipProvider>
                                                                                    ) : (
                                                                                        /* Check for "Zombie" Retry - Needs Fix */
                                                                                        child.metadata?.source === 'retry_charge' && child.category !== 'Adjustment' ? (
                                                                                         <div className="flex items-center gap-2">
                                                                                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                                                Format Error
                                                                                            </Badge>
                                                                                            <button 
                                                                                                type="button"
                                                                                                className="h-6 px-2 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm transition-all cursor-pointer relative z-50 flex items-center active:scale-95"
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    handleFixTransactionFormat(child);
                                                                                                }}
                                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                                            >
                                                                                                Fix Format
                                                                                            </button>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="icon"
                                                                                                className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                                onClick={(e) => {
                                                                                                    e.preventDefault();
                                                                                                    e.stopPropagation();
                                                                                                    handleDeleteTransaction(child.id);
                                                                                                }}
                                                                                                title="Delete Duplicate"
                                                                                            >
                                                                                                <Trash2 className="h-3 w-3" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="flex items-center gap-2">
                                                                                            {isResolvedDebit && (
                                                                                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                                                                    Resolved Charge
                                                                                                </Badge>
                                                                                            )}
                                                                                            {isResolvedCredit && (
                                                                                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                                                    Reimbursed
                                                                                                </Badge>
                                                                                            )}
                                                                                            {isStandardCredit && (
                                                                                                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                                                                                                    Verified
                                                                                                </Badge>
                                                                                            )}
                                                                                            
                                                                                            {(child.category === 'Adjustment' || child.metadata?.source === 'retry_charge') && (
                                                                                                // Only allow deletion of manual Adjustments or Retries
                                                                                                // This prevents accidental deletion of automated Trip transactions
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                                    onClick={(e) => {
                                                                                                        e.preventDefault();
                                                                                                        e.stopPropagation();
                                                                                                        handleDeleteTransaction(child.id);
                                                                                                    }}
                                                                                                    title="Delete Transaction"
                                                                                                >
                                                                                                    <Trash2 className="h-3 w-3" />
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </TableCell>
                                                                                <TableCell className="text-right font-mono">
                                                                                    {!isCredit ? (
                                                                                         <span className="text-red-600 font-medium">-${Math.abs(child.amount).toFixed(2)}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-right font-mono">
                                                                                    {isCredit ? (
                                                                                        <span className="text-emerald-600 font-medium">+${Math.abs(child.amount).toFixed(2)}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </TableCell>
                                                                            </TableRow>
                                                                         );
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        } else {
                                                            // ORPHAN TRANSACTION ROW (Standard Format)
                                                            const tx = item.data as FinancialTransaction;
                                                            const classification = (tx as any)._classification;
                                                            const isResolvedDebit = classification === 'Resolved_Debit';
                                                            const isStandardCredit = classification === 'Standard_Credit';
                                                            const isResolvedCredit = classification === 'Resolved_Credit';
                                                            const isCredit = isStandardCredit || isResolvedCredit;

                                                            return (
                                                                <TableRow key={tx.id} className="hover:bg-slate-50">
                                                                    <TableCell className="font-medium text-slate-600">
                                                                        {(() => { const d = parseTripDate(tx.date); return d ? format(d, 'MMM d, yyyy') : '-'; })()}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="flex flex-col max-w-[250px]">
                                                                            <TooltipProvider>
                                                                                <UiTooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <span className="font-medium truncate text-slate-900">
                                                                                            {tx.description}
                                                                                        </span>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent>
                                                                                        <p>{tx.description}</p>
                                                                                    </TooltipContent>
                                                                                </UiTooltip>
                                                                            </TooltipProvider>
                                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                                <TooltipProvider>
                                                                                    <UiTooltip>
                                                                                        <TooltipTrigger asChild>
                                                                                            <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 bg-amber-100 text-amber-700 cursor-help">
                                                                                                Unlinked
                                                                                            </Badge>
                                                                                        </TooltipTrigger>
                                                                                        <TooltipContent>
                                                                                            <p>This transaction is not associated with a specific trip.</p>
                                                                                        </TooltipContent>
                                                                                    </UiTooltip>
                                                                                </TooltipProvider>
                                                                                {tx.receiptUrl && (
                                                                                    <a 
                                                                                        href={tx.receiptUrl} 
                                                                                        target="_blank" 
                                                                                        rel="noreferrer" 
                                                                                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                    >
                                                                                        <FileText className="h-3 w-3" />
                                                                                        View
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        {/* Check for "Zombie" Retry - Needs Fix */}
                                                                        {tx.metadata?.source === 'retry_charge' && tx.category !== 'Adjustment' ? (
                                                                             <div className="flex items-center gap-2">
                                                                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                                                                    Format Error
                                                                                </Badge>
                                                                                <button 
                                                                                    type="button"
                                                                                    className="h-6 px-2 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded shadow-sm transition-all cursor-pointer relative z-50 flex items-center active:scale-95"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleFixTransactionFormat(tx);
                                                                                    }}
                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                >
                                                                                    Fix Format
                                                                                </button>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleDeleteTransaction(tx.id);
                                                                                    }}
                                                                                    title="Delete Duplicate"
                                                                                >
                                                                                    <Trash2 className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-2">
                                                                                {isResolvedDebit && (
                                                                                    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                                                                        Resolved Charge
                                                                                    </Badge>
                                                                                )}
                                                                                {isResolvedCredit && (
                                                                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                                        Reimbursed
                                                                                    </Badge>
                                                                                )}
                                                                                {isStandardCredit && (
                                                                                    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                                                                                        Verified
                                                                                    </Badge>
                                                                                )}

                                                                                {(tx.category === 'Adjustment' || tx.metadata?.source === 'retry_charge') && (
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            handleDeleteTransaction(tx.id);
                                                                                        }}
                                                                                        title="Delete Transaction"
                                                                                    >
                                                                                        <Trash2 className="h-3 w-3" />
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {!isCredit ? (
                                                                             <span className="text-red-600 font-medium">-${Math.abs(tx.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono">
                                                                        {isCredit ? (
                                                                            <span className="text-emerald-600 font-medium">+${Math.abs(tx.amount).toFixed(2)}</span>
                                                                        ) : (
                                                                            <span className="text-slate-300">-</span>
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        }
                                                    })
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                                            No toll activity found.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    </div>
                                ) : ledgerView === 'payments' ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-end">
                                            <Button 
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                                onClick={() => setPaymentModalState({ isOpen: true })}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Log New Payment
                                            </Button>
                                        </div>

                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[110px]">Date</TableHead>
                                                    <TableHead>Description</TableHead>
                                                    <TableHead className="w-[120px]">Method</TableHead>
                                                    <TableHead className="w-[90px]">Status</TableHead>
                                                    <TableHead className="text-right w-[90px]">Amount</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paymentTransactions.length > 0 ? (
                                                    paymentTransactions.map((tx) => (
                                                        <TableRow key={tx.id}>
                                                            <TableCell className="font-medium text-slate-600">{(() => { const d = parseTripDate(tx.date); return d ? format(d, 'MMM d, yyyy') : '-'; })()}</TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-slate-900">{tx.description}</span>
                                                                    {tx.referenceNumber && (
                                                                        <span className="text-xs text-slate-500 font-mono mt-0.5">
                                                                            Ref: {tx.referenceNumber}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-2 text-slate-600">
                                                                    {tx.paymentMethod === 'Cash' && <DollarSign className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Bank Transfer' && <Landmark className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Mobile Money' && <Wallet className="h-3 w-3" />}
                                                                    {tx.paymentMethod === 'Check' && <FileText className="h-3 w-3" />}
                                                                    <span className="text-sm">{tx.paymentMethod || 'Cash'}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className={cn(
                                                                    "font-normal",
                                                                    tx.status === 'Completed' && "bg-emerald-100 text-emerald-700",
                                                                    tx.status === 'Verified' && "bg-emerald-100 text-emerald-700",
                                                                    tx.status === 'Pending' && "bg-amber-100 text-amber-700",
                                                                    tx.status === 'Failed' && "bg-red-100 text-red-700"
                                                                )}>
                                                                    {tx.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold font-mono text-emerald-600">
                                                                +${tx.amount.toFixed(2)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1 justify-end">
                                                                    {tx.status === 'Pending' && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-amber-600 hover:text-emerald-600 hover:bg-emerald-50"
                                                                            onClick={() => handleVerifyTransaction(tx.id)}
                                                                            title="Verify Transaction"
                                                                        >
                                                                            <CheckCircle2 className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                                <span className="sr-only">Open menu</span>
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem onClick={() => handleEditTransaction(tx)}>
                                                                                <Pencil className="mr-2 h-4 w-4" />
                                                                                Edit
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem onClick={() => handleDeleteTransaction(tx.id)} className="text-red-600 focus:text-red-600">
                                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                                Delete
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                                                            No payments recorded.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-sm text-slate-500">Fuel-related credits and debits affecting this driver's cash balance.</p>
                                        <FuelWalletView 
                                            transactions={dateFilteredTransactions}
                                            onBackfill={async () => {
                                                const result = await api.backfillWalletCredits();
                                                if (result.created > 0) {
                                                    refreshData();
                                                }
                                                return result;
                                            }}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Column: Actions & Risk */}
                <div className="space-y-6">
                     {/* Cash Risk Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Cash Risk Analysis</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                   <span className="text-slate-500">Cash Collected</span>
                                   <span className="font-medium">${resolvedFinancials.cashCollected.toFixed(2)}</span>
                                </div>
                                <Progress 
                                    value={resolvedFinancials.periodEarnings > 0 ? (resolvedFinancials.cashCollected / resolvedFinancials.periodEarnings) * 100 : 0} 
                                    className="h-2 bg-slate-100" 
                                    indicatorClassName="bg-amber-500" 
                                />
                                <p className="text-xs text-amber-600 font-medium">
                                    {resolvedFinancials.periodEarnings > 0 ? ((resolvedFinancials.cashCollected / resolvedFinancials.periodEarnings) * 100).toFixed(1) : 0}% of earnings
                                </p>
                             </div>
                             <div className="pt-2">
                                <div className="p-3 bg-slate-50 rounded-lg space-y-1">
                                    <p className="text-xs text-slate-500">Total Period Earnings</p>
                                    <p className="text-sm font-semibold">${resolvedFinancials.periodEarnings.toFixed(2)}</p>
                                </div>
                             </div>
                             <Separator />
                             <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setPaymentModalState({ isOpen: true })}>
                                 Log Cash Payment</Button></CardContent></Card></div></div></TabsContent>{/* __DEAD_EXPENSES_WRAP_START__
                             </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
             </TabsContent>

             <TabsContent value="expenses" className="space-y-6">
               <Card>
                 <DriverExpensesHistory driverId={driverId} transactions={transactions} trips={allTrips} />
               </TabsContent>
               <TabsContent value="payout" className="space-y-6">
                 <DriverPayoutHistory driverId={driverId} transactions={transactions} trips={allTrips} />
               </TabsContent>
             </Tabs>
           </TabsContent>
          <TabsContent value="wallet" className="space-y-6">__DEAD_EXPENSES_WRAP_END__ */}{/* DEAD_BLOCK_NEUTRALIZED<CardContent className="hidden">
                   {null}
                   {null}
                   {null}
                 </CardContent>
               </Card>
             </TabsContent>
           </Tabs>
         </TabsContent>

         DEAD_BLOCK_END */}

          <TabsContent value="operations" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Earnings per Km" 
                    value={`$${ledgerEarningsPerKm.toFixed(2)}`} 
                    icon={<Zap className="h-4 w-4 text-slate-500" />}
                    subtext="Target: >$1.50"
                 />
                 <MetricCard 
                    title="Avg Duration" 
                    value={`${metrics.avgDuration.toFixed(0)} min`} 
                    icon={<Clock className="h-4 w-4 text-slate-500" />}
                 />
                 <MetricCard 
                    title="Total Distance" 
                    value={`${metrics.totalDistance.toFixed(1)} km`} 
                    icon={<MapPin className="h-4 w-4 text-slate-500" />}
                 />
                 <MetricCard 
                    title="Total Fuel Spend"
                    value={`$${fuelSpend.toFixed(2)}`}
                    subtext="Total out-of-pocket & card fuel"
                    icon={<Fuel className="h-4 w-4 text-slate-500" />}
                 />
             </div>
             
             <Card>
                <CardHeader>
                   <CardTitle>Activity by Hour</CardTitle>
                   <CardDescription>When does this driver drive the most?</CardDescription>
                </CardHeader>
                <CardContent>
                   <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={metrics.hourlyActivityData}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                         <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={12} />
                         <YAxis axisLine={false} tickLine={false} />
                         <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                         <Bar dataKey="trips" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
             </Card>
         </TabsContent>

         <TabsContent value="quality" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <MetricCard 
                    title="Customer Rating" 
                    value={metrics.currentRating.toFixed(1)} 
                    subtext="Last 4 weeks"
                    icon={<Star className="h-4 w-4 text-slate-500" />}
                    loading={localLoading}
                     breakdown={[
                        { label: 'Uber', value: metrics.platformStats.Uber.ratingCount > 0 ? (metrics.platformStats.Uber.ratingSum / metrics.platformStats.Uber.ratingCount).toFixed(1) : metrics.currentRating.toFixed(1), color: '#3b82f6' },
                        { label: 'InDrive', value: metrics.platformStats.InDrive.ratingCount > 0 ? (metrics.platformStats.InDrive.ratingSum / metrics.platformStats.InDrive.ratingCount).toFixed(1) : metrics.currentRating.toFixed(1), color: '#10b981' }
                     ]}
                 />
                 <MetricCard 
                    title="Completion Rate" 
                    value={`${metrics.completionRate.toFixed(1)}%`} 
                    icon={<CheckCircle2 className="h-4 w-4 text-slate-500" />}
                    progress={metrics.completionRate}
                    progressColor="bg-emerald-500"
                    target="Target: 95%"
                    loading={localLoading}
                 />
                 <MetricCard 
                    title="Cancelled Trips" 
                    value={metrics.periodCancelledTrips} 
                    icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
                    subtext="In selected period"
                    loading={localLoading}
                 />
                 <MetricCard 
                    title="Safety Score" 
                    value="98/100" 
                    icon={<Shield className="h-4 w-4 text-slate-500" />}
                    subtext="Based on harsh braking events"
                    loading={localLoading}
                 />
               <MetricCard 
                  title="Acceptance Rate" 
                  value={metrics.acceptanceRate !== null ? `${metrics.acceptanceRate}%` : '-'} 
                  target="Target: >85%"
                  progress={metrics.acceptanceRate || 0}
                  progressColor={!metrics.acceptanceRate ? "bg-slate-200" : metrics.acceptanceRate >= 80 ? "bg-emerald-500" : metrics.acceptanceRate < 40 ? "bg-rose-600" : "bg-amber-500"}
                  icon={(metrics.acceptanceRate !== null && metrics.acceptanceRate < 40) ? <AlertTriangle className="h-4 w-4 text-rose-600 animate-pulse" /> : <ThumbsUp className="h-4 w-4 text-slate-500" />}
                  loading={localLoading}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${Math.round((metrics.platformStats.Uber.completed / metrics.platformStats.Uber.trips) * 100)}%` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${Math.round((metrics.platformStats.InDrive.completed / metrics.platformStats.InDrive.trips) * 100)}%` : '-', color: '#10b981' }
                   ]}
               />
               <MetricCard 
                  title="Cancellation Rate" 
                  value={metrics.totalTrips > 0 ? `${metrics.cancellationRate.toFixed(1)}%` : '-'} 
                  target="Target: <5%"
                  progress={metrics.cancellationRate}
                  progressColor={metrics.cancellationRate < 5 ? "bg-emerald-500" : "bg-rose-500"}
                  tooltip={`Calculated from ${metrics.periodCancelledTrips} cancelled trips out of ${metrics.totalTrips} total trips in the selected period.`}
                  icon={<AlertTriangle className="h-4 w-4 text-slate-500" />}
                  loading={localLoading}
                   breakdown={[
                       { label: 'Uber', value: metrics.platformStats.Uber.trips > 0 ? `${(( (metrics.platformStats.Uber.trips - metrics.platformStats.Uber.completed) / metrics.platformStats.Uber.trips) * 100).toFixed(1)}%` : '-', color: '#3b82f6' },
                       { label: 'InDrive', value: metrics.platformStats.InDrive.trips > 0 ? `${(( (metrics.platformStats.InDrive.trips - metrics.platformStats.InDrive.completed) / metrics.platformStats.InDrive.trips) * 100).toFixed(1)}%` : '-', color: '#10b981' }
                   ]}
               />
             </div>

             <Card>
                <CardHeader>
                   <CardTitle>Recent Trip Issues</CardTitle>
                </CardHeader>
                <CardContent>
                   {metrics.periodCancelledTrips === 0 ? (
                       <div className="text-center py-8 text-slate-500">
                           <CheckCircle2 className="h-12 w-12 text-emerald-100 fill-emerald-500 mx-auto mb-3" />
                           <p>No cancelled trips in this period. Great job!</p>
                       </div>
                   ) : (
                       <div className="space-y-4">
                           <p className="text-sm text-slate-500">Trips that were cancelled or had issues.</p>
                           {/* List cancelled trips here if needed */}
                       </div>
                   )}
                </CardContent>
             </Card>
         </TabsContent>

         <TabsContent value="trips" className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Trip History</CardTitle>
                    <CardDescription>View and manage full trip logs.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search trip ID, date..." 
                                className="pl-9" 
                                value={tripSearch}
                                onChange={(e) => setTripSearch(e.target.value)}
                            />
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly ? "secondary" : "outline"} size="sm" className="gap-2">
                                    <Filter className="h-4 w-4" /> 
                                    Filter
                                    {(filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly) && (
                                        <Badge variant="secondary" className="h-5 px-1.5 rounded-full ml-1 text-[10px]">
                                            {filterPlatform.length + filterStatus.length + (filterCashOnly ? 1 : 0)}
                                        </Badge>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-4" align="end">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Platform</h4>
                                        <div className="flex flex-col gap-2">
                                            {['Uber', 'InDrive', 'Other'].map(p => (
                                                <div key={p} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`filter-${p}`} 
                                                        checked={filterPlatform.includes(p)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) setFilterPlatform([...filterPlatform, p]);
                                                            else setFilterPlatform(filterPlatform.filter(x => x !== p));
                                                        }}
                                                    />
                                                    <Label htmlFor={`filter-${p}`} className="text-sm font-normal cursor-pointer">{p}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Status</h4>
                                        <div className="flex flex-col gap-2">
                                            {['Completed', 'Cancelled'].map(s => (
                                                <div key={s} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`filter-${s}`} 
                                                        checked={filterStatus.includes(s)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) setFilterStatus([...filterStatus, s]);
                                                            else setFilterStatus(filterStatus.filter(x => x !== s));
                                                        }}
                                                    />
                                                    <Label htmlFor={`filter-${s}`} className="text-sm font-normal cursor-pointer">{s}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none text-sm">Payment</h4>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox 
                                                    id="filter-cash" 
                                                    checked={filterCashOnly}
                                                    onCheckedChange={(checked) => setFilterCashOnly(!!checked)}
                                                />
                                                <Label htmlFor="filter-cash" className="text-sm font-normal cursor-pointer">Cash Trips Only</Label>
                                            </div>
                                        </div>
                                    </div>
                                    {(filterPlatform.length > 0 || filterStatus.length > 0 || filterCashOnly) && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="w-full mt-2 h-8 text-xs text-muted-foreground"
                                            onClick={() => {
                                                setFilterPlatform([]);
                                                setFilterStatus([]);
                                                setFilterCashOnly(false);
                                            }}
                                        >
                                            Clear Filters
                                        </Button>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Distance</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Cash Collected</TableHead>
                                <TableHead>Earnings</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trips
                                .filter(t => {
                                    // Search Filter
                                    const matchesSearch = t.id.includes(tripSearch) || 
                                        t.date.includes(tripSearch) ||
                                        (t.status || '').toLowerCase().includes(tripSearch.toLowerCase()) ||
                                        (t.platform || '').toLowerCase().includes(tripSearch.toLowerCase());
                                    
                                    // Platform Filter
                                    const matchesPlatform = filterPlatform.length === 0 || filterPlatform.includes(t.platform || 'Other');
                                    
                                    // Status Filter
                                    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(t.status);

                                    // Cash Filter
                                    const matchesCash = !filterCashOnly || 
                                        (Math.abs(Number(t.cashCollected || 0)) > 0) || 
                                        (t.platform && ['indrive', 'bolt', 'goride', 'roam', 'private', 'cash'].includes(t.platform.toLowerCase())) ||
                                        (t as any).paymentMethod === 'Cash';

                                    return matchesSearch && matchesPlatform && matchesStatus && matchesCash;
                                })
                                .slice((tripPage - 1) * tripsPerPage, tripPage * tripsPerPage)
                                .map((trip) => {
                                    const isPhantom = trip.status === 'Cancelled' && (trip.distance || 0) > 0.1;
                                    return (
                                    <TableRow key={trip.id} className={isPhantom ? "bg-rose-50 hover:bg-rose-100 border-l-2 border-l-rose-500" : ""}>
                                    <TableCell>
                                        <div className="font-medium">{format(parseTripDate(trip.date) || new Date(), 'MMM d, yyyy')}</div>
                                        <div className="text-xs text-slate-500">{format(parseTripDate(trip.date) || new Date(), 'h:mm a')}</div>
                                        {isPhantom && <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Phantom Trip Detected</span>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.platform === 'Uber' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            trip.platform === 'InDrive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {normalizePlatform(trip.platform)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            trip.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            trip.status === 'Cancelled' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                            'bg-slate-50 text-slate-700'
                                        }>
                                            {trip.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{trip.distance ? `${trip.distance.toFixed(1)} km` : '-'}</TableCell>
                                    <TableCell>{trip.duration ? `${trip.duration.toFixed(0)} min` : '-'}</TableCell>
                                    <TableCell className="font-medium text-amber-600">
                                        {Math.abs(Number(trip.cashCollected || 0)) > 0 ? `$${Math.abs(Number(trip.cashCollected)).toFixed(2)}` : 
                                        (trip.platform && ['indrive', 'bolt', 'goride', 'roam', 'private', 'cash'].includes(trip.platform.toLowerCase()) ? `$${(trip.amount ?? 0).toFixed(2)}` : '-')}
                                    </TableCell>
                                    <TableCell className="font-medium">${(trip.amount ?? 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8"
                                            onClick={() => setSelectedTrip(trip)}
                                        >
                                            <Eye className="h-4 w-4 text-slate-400" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                ); })}
                            {trips.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                                        No trips found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    
                    {/* Simple Pagination */}
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => Math.max(1, p - 1))}
                            disabled={tripPage === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTripPage(p => p + 1)}
                            disabled={tripPage * tripsPerPage >= trips.length}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
         </TabsContent>

         <TabsContent value="indrive-wallet" className="space-y-6">
            <DriverIndriveWalletTab
              driverId={driverId}
              range={ledgerDateRangeStrings}
              ledgerRefreshKey={ledgerRefreshKey}
            />
         </TabsContent>

         <TabsContent value="profile" className="space-y-6">
            <Tabs defaultValue="documents" className="w-full">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 mb-6">
                   <TabsTrigger 
                     value="documents"
                     className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
                   >
                     Documents
                   </TabsTrigger>
                   <TabsTrigger 
                     value="personal-info"
                     className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none pb-2 px-4 text-slate-500 data-[state=active]:text-indigo-600"
                   >
                     Personal Information
                   </TabsTrigger>
                </TabsList>

                <TabsContent value="documents">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Driver Documents</CardTitle>
                                <CardDescription>Manage licenses, insurance, and permits.</CardDescription>
                            </div>
                            <Button size="sm"><Upload className="h-4 w-4 mr-2" /> Upload Document</Button>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Document Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Expiry Date</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {documents.map((doc) => (
                                        <TableRow key={doc.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-slate-400" />
                                                    {doc.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>{doc.type}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    doc.status === 'Expired' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    doc.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    'bg-slate-50 text-slate-700'
                                                }>
                                                    {doc.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={
                                                new Date(doc.expiryDate) < new Date() ? 'text-rose-600 font-medium' : ''
                                            }>
                                                {(() => { const d = parseTripDate(doc.expiryDate); return d ? format(d, 'MMM d, yyyy') : '-'; })()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 hover:bg-slate-100"
                                                    onClick={() => setSelectedDocument(doc)}
                                                >
                                                    <Eye className="h-4 w-4 text-slate-500 hover:text-indigo-600" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                             </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="personal-info">
                   <Card>
                      <CardHeader>
                          <CardTitle>Personal Information</CardTitle>
                          <CardDescription>Personal details and contact info.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 max-w-2xl">
                          <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Full Name</Label>
                                      <Input value={driverName} readOnly className="bg-slate-50" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Email Address</Label>
                                      <Input value={driver?.email || 'N/A'} readOnly className="bg-slate-50" />
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Phone Number</Label>
                                      <Input value={driver?.phone || 'N/A'} readOnly className="bg-slate-50" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Driver ID</Label>
                                      <Input value={driverId} readOnly className="bg-slate-50 font-mono" />
                                  </div>
                              </div>
                          </div>

                          <Separator />
                          
                          <div className="space-y-4">
                              <div className="flex items-center gap-2 mb-2">
                                  <CreditCardIcon className="h-4 w-4 text-slate-500" />
                                  <h4 className="font-semibold text-slate-900">Bank Account Information</h4>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                      <Label>Name on Account</Label>
                                      <Input value={driver?.bankInfo?.accountName || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                                  <div className="space-y-2">
                                      <Label>Bank Name</Label>
                                      <Input value={driver?.bankInfo?.bankName || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                      <Label>Branch</Label>
                                      <Input value={driver?.bankInfo?.branch || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                                  <div className="col-span-2 space-y-2">
                                      <Label>Account Number</Label>
                                      <Input value={driver?.bankInfo?.accountNumber || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                                  </div>
                              </div>
                              
                              <div className="space-y-2">
                                  <Label>Account Type</Label>
                                  <Input value={driver?.bankInfo?.accountType || ''} readOnly className="bg-slate-50" placeholder="Not set" />
                              </div>
                          </div>
                      </CardContent>
                   </Card>
                </TabsContent>
            </Tabs>
         </TabsContent>
      </Tabs>

      {/* Document Viewer Modal */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-3xl w-full h-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-4 pb-2">
                <DialogTitle>{selectedDocument?.name}</DialogTitle>
                <DialogDescription>
                    {selectedDocument?.type} • Uploaded on {selectedDocument?.uploadDate && (() => { const d = parseTripDate(selectedDocument.uploadDate); return d ? format(d, 'MMM d, yyyy') : '-'; })()}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 bg-slate-900 flex items-center justify-center p-4 overflow-auto min-h-[400px]">
                {selectedDocument?.url ? (
                    <img 
                        src={selectedDocument.url} 
                        alt={selectedDocument.name} 
                        className="max-w-full max-h-[70vh] object-contain rounded-md"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <FileText className="h-12 w-12 opacity-50" />
                        <p>No preview available</p>
                    </div>
                )}
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setSelectedDocument(null)}>Close</Button>
                 {selectedDocument?.url && (
                    <Button onClick={() => window.open(selectedDocument.url, '_blank')}>
                        <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                 )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Trip ↔ Ledger gap diagnostic (server: GET /ledger/diagnostic-trip-ledger-gap) */}
      <Dialog open={tripGapDiagOpen} onOpenChange={setTripGapDiagOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-amber-600" />
              Trip ↔ Ledger diagnostic
            </DialogTitle>
            <DialogDescription>
              Same date range as the overview. Compares completed trips with money to <code className="text-xs">fare_earning</code> rows (raw KV vs org scope).
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

      {/* Trip Details Modal */}
      <Dialog open={!!selectedTrip} onOpenChange={(open) => !open && setSelectedTrip(null)}>
        <DialogContent className="max-w-xl w-full">
          <DialogHeader>
            <DialogTitle>Trip Details</DialogTitle>
            <DialogDescription>
                Trip ID: {selectedTrip?.id}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTrip && (
              <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Date & Time</Label>
                      <div className="font-medium">
                          {selectedTrip.date ? format(parseTripDate(selectedTrip.date) || new Date(), 'MMM d, yyyy h:mm a') : 'N/A'}
                      </div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Platform</Label>
                      <div className="font-medium flex items-center gap-2">
                          <Badge variant="outline">{selectedTrip.platform}</Badge>
                          <Badge variant={selectedTrip.status === 'Completed' ? 'default' : 'secondary'} className={selectedTrip.status === 'Completed' ? 'bg-emerald-500' : ''}>
                              {selectedTrip.status}
                          </Badge>
                      </div>
                  </div>

                  <div className="col-span-2 space-y-1 pt-2">
                      <Label className="text-slate-500 text-xs">Pickup</Label>
                      <div className="font-medium flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                          <span>{selectedTrip.pickupLocation || 'Unknown Location'}</span>
                      </div>
                  </div>
                  <div className="col-span-2 space-y-1 pb-2 border-b">
                      <Label className="text-slate-500 text-xs">Dropoff</Label>
                      <div className="font-medium flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                          <span>{selectedTrip.dropoffLocation || 'Unknown Location'}</span>
                      </div>
                  </div>

                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Distance</Label>
                      <div className="font-medium">{selectedTrip.distance ? `${selectedTrip.distance.toFixed(1)} km` : '-'}</div>
                  </div>
                  <div className="space-y-1">
                      <Label className="text-slate-500 text-xs">Duration</Label>
                      <div className="font-medium">{selectedTrip.duration ? `${selectedTrip.duration.toFixed(0)} min` : '-'}</div>
                  </div>

                  {/* InDrive trips with fee data: enhanced breakdown */}
                  {selectedTrip.platform === 'InDrive' && selectedTrip.indriveNetIncome ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs">Fare</Label>
                        <div className="font-bold text-lg text-slate-900 dark:text-slate-50">${selectedTrip.amount?.toFixed(2)}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs">Payment Method</Label>
                        <div className="font-medium">
                          {selectedTrip.paymentMethod === 'Card' ? '💳 Card' : '💵 Cash'}
                        </div>
                      </div>

                      <div className="col-span-2 pt-2 border-t mt-2">
                        <Label className="text-slate-500 text-xs mb-2 block">InDrive Fee Breakdown</Label>
                        <div className="text-sm bg-slate-50 dark:bg-slate-900 p-3 rounded-md border space-y-2">
                          {(!selectedTrip.paymentMethod || selectedTrip.paymentMethod === 'Cash') ? (
                            <>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Fare (Cash from Passenger)</span>
                                <span className="font-medium text-slate-900 dark:text-slate-50">${selectedTrip.amount?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-start text-xs text-amber-600 dark:text-amber-400">
                                <div>
                                  <span>InDrive Service Fee{selectedTrip.indriveServiceFeePercent != null ? ` (${selectedTrip.indriveServiceFeePercent.toFixed(1)}%)` : ''}</span>
                                  <p className="text-[10px] text-amber-500/70 dark:text-amber-500/60">Deducted from InDrive Balance</p>
                                </div>
                                <span className="font-medium">-${(selectedTrip.indriveServiceFee ?? 0).toFixed(2)}</span>
                              </div>
                              <Separator />
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Cash in Hand</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">${selectedTrip.amount?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-rose-600 dark:text-rose-400 font-medium">InDrive Balance Impact</span>
                                <span className="text-rose-600 dark:text-rose-400 font-medium">-${(selectedTrip.indriveServiceFee ?? 0).toFixed(2)}</span>
                              </div>
                              <Separator />
                              <div className="flex justify-between items-center text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                <span>True Profit</span>
                                <span>${selectedTrip.indriveNetIncome.toFixed(2)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 dark:text-slate-400">Fare (Collected by InDrive)</span>
                                <span className="font-medium text-slate-900 dark:text-slate-50">${selectedTrip.amount?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-start text-xs text-amber-600 dark:text-amber-400">
                                <div>
                                  <span>InDrive Service Fee{selectedTrip.indriveServiceFeePercent != null ? ` (${selectedTrip.indriveServiceFeePercent.toFixed(1)}%)` : ''}</span>
                                  <p className="text-[10px] text-amber-500/70 dark:text-amber-500/60">Retained by InDrive</p>
                                </div>
                                <span className="font-medium">-${(selectedTrip.indriveServiceFee ?? 0).toFixed(2)}</span>
                              </div>
                              <Separator />
                              <div className="flex justify-between items-center text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                <span>Payout to Driver</span>
                                <span>${selectedTrip.indriveNetIncome.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                          <Label className="text-slate-500 text-xs">Driver Earnings</Label>
                          <div className="font-bold text-lg text-emerald-600">${selectedTrip.amount?.toFixed(2)}</div>
                      </div>
                      <div className="space-y-1">
                          <Label className="text-slate-500 text-xs">Cash Collected</Label>
                          <div className="font-bold text-lg text-amber-600">
                            {Math.abs(Number(selectedTrip.cashCollected || 0)) > 0 
                                ? `$${Math.abs(Number(selectedTrip.cashCollected)).toFixed(2)}` 
                                : (selectedTrip.platform && ['indrive', 'bolt', 'goride', 'roam', 'private', 'cash'].includes(selectedTrip.platform.toLowerCase()) 
                                    ? `$${(selectedTrip.amount ?? 0).toFixed(2)}` 
                                    : '-')}
                          </div>
                      </div>

                      {selectedTrip.fareBreakdown && (
                        <div className="col-span-2 pt-2 border-t mt-2">
                            <Label className="text-slate-500 text-xs mb-2 block">Fare Breakdown</Label>
                            <div className="text-sm bg-slate-50 p-3 rounded-md border space-y-1">
                                {Object.entries(selectedTrip.fareBreakdown).map(([key, value]) => {
                                    if (!value) return null;
                                    // Convert camelCase to Title Case
                                    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                    return (
                                        <div key={key} className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">{label}</span>
                                            <span className="font-medium text-slate-900">${Number(value).toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                      )}
                    </>
                  )}
              </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
               <Button variant="outline" onClick={() => setSelectedTrip(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <LogCashPaymentModal 
        isOpen={paymentModalState.isOpen}
        onClose={() => setPaymentModalState({ isOpen: false })}
        onSave={handleSavePayment}
        driverName={driverName}
        cashOwed={walletMetrics.netOutstanding} // Phase 4: Use ledger-sourced net outstanding
        initialWorkPeriodStart={paymentModalState.initialWorkPeriodStart}
        initialWorkPeriodEnd={paymentModalState.initialWorkPeriodEnd}
        initialAmount={paymentModalState.initialAmount}
        initialTransaction={paymentModalState.editingTransaction}
        periods={settlementWeeks}
      />
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete this transaction? This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDeleteTransaction} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

function MetricCard({ title, value, trend, trendUp, target, progress, progressColor = "bg-indigo-600", subtext, icon, breakdown, action, tooltip, loading }: any) {
   return (
      <Card className={cn(loading && "animate-pulse")}>
         <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
               <div className="flex items-center gap-2">
                   <p className="text-sm font-medium text-slate-500">{title}</p>
                   {tooltip && (
                       <TooltipProvider>
                           <UiTooltip>
                               <TooltipTrigger>
                                   <Info className="h-3 w-3 text-slate-400" />
                               </TooltipTrigger>
                               <TooltipContent>
                                   <p className="max-w-[200px] text-xs">{tooltip}</p>
                               </TooltipContent>
                           </UiTooltip>
                       </TooltipProvider>
                   )}
               </div>
               {icon}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
               {loading ? (
                   <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div>
               ) : (
                   <h2 className="text-2xl font-bold">{value}</h2>
               )}
               {trend && !loading && (
                  <span className={`text-xs font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {trend}
                  </span>
               )}
            </div>
            {(target || progress !== undefined) && (
               <div className="mt-3 space-y-1">
                  {target && <p className="text-xs text-slate-500">{target}</p>}
                  {progress !== undefined && (
                     <Progress value={loading ? 0 : progress} className="h-1.5" indicatorClassName={progressColor} />
                  )}
               </div>
            )}
            {subtext && !loading && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
            {loading && !target && !progress && <div className="h-3 w-32 bg-slate-100 rounded mt-2"></div>}
            
            {breakdown && breakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {loading ? (
                        [1, 2].map(i => <div key={i} className="flex justify-between h-3 bg-slate-50 rounded"></div>)
                    ) : (
                        breakdown.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: item.color }}></span>
                                    {item.label}
                                </span>
                                <span className="font-medium text-slate-700">{item.value}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {action && !loading && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                    {action}
                </div>
            )}
         </CardContent>
      </Card>
   )
}