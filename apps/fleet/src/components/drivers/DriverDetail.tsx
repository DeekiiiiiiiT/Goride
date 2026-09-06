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
  AlertTriangle,
  Calendar as CalendarIcon,
  Award,
  Filter,
  CreditCard as CreditCardIcon,
  Loader2,
  Car as CarIcon,
  ChevronDown,
  Stethoscope,
} from "lucide-react";
import { Button } from "../ui/button";
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Trip, DriverMetrics, FinancialTransaction, QuotaConfig, LedgerDriverOverview } from '../../types/data';
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { cn } from "../ui/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { LogCashPaymentModal } from './LogCashPaymentModal';
import { CashWriteOffModal, type CashWriteOffSavePayload } from './CashWriteOffModal';
import { RecordPayoutModal, type RecordPayoutSavePayload } from './RecordPayoutModal';
import { PermissionGate } from '../auth/PermissionGate';
import { usePermissions } from '../../hooks/usePermissions';
import { useVocab } from '../../utils/vocabulary';
import { useDriverPayoutPeriodRows } from '../../hooks/useDriverPayoutPeriodRows';
import { useDriverFinancialBundle } from '../../hooks/useDriverFinancialBundle';
import { useInvalidateDriverFinancialPeriods } from '../../hooks/useDriverFinancialPeriods';
import {
  useDriverTransactions,
  mergeDriverMoneyTransactions,
} from '../../hooks/useDriverTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { useDriverTollLogs } from '../../hooks/useDriverTollLogs';
import { buildWalletCallOutstandingByMonday } from '../../utils/walletCallOutstanding';
// TollRecoveryCard removed — Phase 8 uses platformStats injection instead
// fetchDriverTrips.ts deleted in Phase 11 — logic inlined in the useEffect below
import {
  DriverPeriodProvider,
  useDriverPeriod,
} from './context/DriverPeriodContext';
import {
  isDriverDetailTab,
  type DriverDetailTab,
} from '../../navigation/pageRegistry';
import { PLATFORM_COLORS } from './OverviewMetricsGrid';
import { DriverIndriveWalletTab } from './DriverIndriveWalletTab';
import { DriverFuelPolicySelect } from './DriverFuelPolicySelect';
import { TimeFilterDropdown, TimeFilterValue } from './TimeFilterDropdown';
import { api } from '../../services/api';
import {
  computeDriverOperationalMetrics,
  parseTripDate,
  getSortedTripsInRange,
  type ReconstructedMetrics,
} from '../../utils/driverOperationalMetrics';
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

export type { ReconstructedMetrics, DriverDocument };
export { parseTripDate, getSortedTripsInRange };

const DriverProfileTab = React.lazy(() =>
  import('./tabs/DriverProfileTab').then((m) => ({ default: m.DriverProfileTab })),
);
const DriverServiceQualityTab = React.lazy(() =>
  import('./tabs/DriverServiceQualityTab').then((m) => ({ default: m.DriverServiceQualityTab })),
);
const DriverCashWalletTab = React.lazy(() =>
  import('./tabs/DriverCashWalletTab').then((m) => ({ default: m.DriverCashWalletTab })),
);
const DriverOverviewTab = React.lazy(() =>
  import('./tabs/DriverOverviewTab').then((m) => ({ default: m.DriverOverviewTab })),
);
const DriverFinancialsTab = React.lazy(() =>
  import('./tabs/DriverFinancialsTab').then((m) => ({ default: m.DriverFinancialsTab })),
);

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
  const { v } = useVocab();
  const { can } = usePermissions();
  const canEditTransactions = can('transactions.edit');
  const canBackfill = can('data.backfill');
  const canRepairLedger = canEditTransactions || canBackfill;
  const canEditDrivers = can('drivers.edit');
  const { period, setPeriod } = useDriverPeriod();
  const [activeTab, setActiveTab] = useState<string>(() =>
    isDriverDetailTab(initialTab) ? initialTab : 'overview',
  );
  const [profileSubTab, setProfileSubTab] = useState<'documents' | 'personal-info' | 'notes'>('documents');

  useEffect(() => {
    if (isDriverDetailTab(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'profile') setProfileSubTab('documents');
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
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['All']));
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ preset: 'all' });

  /** One shared period for Overview, Financials, Cash Wallet, Service Quality, InDrive. */
  const financialDateRange = period;
  const dateRange = period;

  const financialDateRangeStrings = useMemo(() => {
    if (!financialDateRange?.from) return null;
    return {
      startDate: format(financialDateRange.from, 'yyyy-MM-dd'),
      endDate: format(financialDateRange.to || financialDateRange.from, 'yyyy-MM-dd'),
    };
  }, [financialDateRange]);

  const showOverviewDateControls =
    activeTab === 'overview' || activeTab === 'indrive-wallet';

  const didInitDateRangeFromCsv = useRef(false);
  useEffect(() => {
    didInitDateRangeFromCsv.current = false;
  }, [driverId]);

  useEffect(() => {
    if (didInitDateRangeFromCsv.current) return;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') && params.get('to')) {
        didInitDateRangeFromCsv.current = true;
        return;
      }
    }
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
      setPeriod({ from, to });
      didInitDateRangeFromCsv.current = true;
    } catch {
      /* ignore */
    }
  }, [csvMetrics, driverId, setPeriod]);

  const ledgerDateRangeStrings = financialDateRangeStrings;

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

  const queryClient = useQueryClient();
  // P-3: server date window (~400d lookback from period end) + lower maxRows for money tabs.
  const txFetchRange = React.useMemo((): {
    startDate?: string;
    endDate?: string;
    maxRows: number;
  } => {
    if (!financialDateRangeStrings?.endDate) {
      return { maxRows: 15_000 };
    }
    const end = financialDateRangeStrings.endDate;
    const lookback = new Date(`${end}T00:00:00Z`);
    lookback.setUTCDate(lookback.getUTCDate() - 400);
    return {
      startDate: lookback.toISOString().slice(0, 10),
      endDate: end,
      maxRows: 15_000,
    };
  }, [financialDateRangeStrings]);

  const {
    transactions: rqTransactions,
    queryKey: txQueryKey,
  } = useDriverTransactions(moneyExpandedIds, {
    enabled: moneyTabActive,
    startDate: txFetchRange.startDate,
    endDate: txFetchRange.endDate,
    maxRows: txFetchRange.maxRows,
  });
  const { tollLogs: rqTollLogs } = useDriverTollLogs(moneyExpandedIds, {
    enabled: moneyTabActive,
  });

  /** RQ is the only cache — merge toll logs for display; no useState mirror. */
  const transactions = React.useMemo(
    () => mergeDriverMoneyTransactions(rqTransactions, rqTollLogs as FinancialTransaction[]),
    [rqTransactions, rqTollLogs],
  );

  const patchTransactionsCache = (
    updater: (prev: FinancialTransaction[]) => FinancialTransaction[],
  ) => {
    queryClient.setQueryData(txQueryKey, (prev: FinancialTransaction[] | undefined) =>
      updater(Array.isArray(prev) ? prev.filter(Boolean) : []),
    );
  };

  /** Invalidate only — RQ refetch is driven by invalidateQueries (no double-fire). */
  const refreshData = () => {
    void queryClient.invalidateQueries({ queryKey: txQueryKey });
    void queryClient.invalidateQueries({ queryKey: ['driverTollLogs'] });
    void queryClient.invalidateQueries({ queryKey: ['driverFinancialBundle', driverId] });
  };
  void refreshData; // available for header refresh wiring without unused-lint noise until UI binds it

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
    loadResolvedEarningsBundleForDriverWeek(driverId, undefined, serviceLineParam as 'rideshare' | 'rush_delivery' | undefined)
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
          patchTransactionsCache((prev) =>
            prev.map((t) => (t.id === payment.id ? ({ ...t, ...updatedTx } as FinancialTransaction) : t)),
          );
      } else {
          const saved = await api.saveTransaction(newTx);
          const savedTx = saved?.data || saved;
          patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
      }
      void queryClient.invalidateQueries({ queryKey: txQueryKey });
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
      patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
      void queryClient.invalidateQueries({ queryKey: txQueryKey });
      void invalidateFinancialPeriods(driverId);
      void api.appendDriverAudit(driverId, {
        action: 'cash_write_off',
        reason: payload.notes,
        after: savedTx,
      }).catch(() => {});
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
      patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
      void queryClient.invalidateQueries({ queryKey: txQueryKey });
      void invalidateFinancialPeriods(driverId);
      void api.appendDriverAudit(driverId, {
        action: 'driver_payout',
        reason: payload.notes,
        after: savedTx,
      }).catch(() => {});
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
          const updatedTx = { ...tx, status: 'Verified' as const };
          patchTransactionsCache((prev) => prev.map((t) => (t.id === id ? updatedTx : t)));

          await api.saveTransaction(updatedTx);
          void queryClient.invalidateQueries({ queryKey: txQueryKey });
          void invalidateFinancialPeriods(driverId);
          toast.success("Transaction verified");
      } catch (e) {
          console.error("Failed to verify transaction", e);
          toast.error("Failed to verify transaction");
          patchTransactionsCache((prev) => prev.map((t) => (t.id === id ? tx : t)));
      }
  };

  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  const confirmDeleteTransaction = async () => {
      if (!transactionToDelete) return;

      const deletedTx = transactions.find((t) => t.id === transactionToDelete);
      const tollIds = new Set((rqTollLogs || []).map((t: any) => t?.id).filter(Boolean));
      const originalRqSlice = transactions.filter((t) => t?.id && !tollIds.has(t.id));
      patchTransactionsCache((prev) => prev.filter((t) => t.id !== transactionToDelete));

      try {
          await api.deleteTransaction(transactionToDelete);
          void queryClient.invalidateQueries({ queryKey: txQueryKey });
          void invalidateFinancialPeriods(driverId);
          void api.appendDriverAudit(driverId, {
            action: 'transaction_delete',
            before: deletedTx,
          }).catch(() => {});
          toast.success(
            isCashWriteOffTransaction(deletedTx)
              ? 'Write-off undone'
              : 'Transaction deleted',
          );
      } catch (e) {
          queryClient.setQueryData(txQueryKey, originalRqSlice);
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

  const licenseExpiryLabel = useMemo(() => {
    const raw = driver?.licenseExpiry;
    if (!raw) return null;
    const d = parseTripDate(String(raw).slice(0, 10));
    return d ? format(d, 'MMM d, yyyy') : String(raw).slice(0, 10);
  }, [driver?.licenseExpiry]);

  const licenseNumberLabel = useMemo(() => {
    const n = String(driver?.licenseNumber || '').trim();
    return n || null;
  }, [driver?.licenseNumber]);

  const licenseExpired = useMemo(() => {
    const raw = driver?.licenseExpiry;
    if (!raw) return false;
    const d = parseTripDate(String(raw).slice(0, 10));
    if (!d) return false;
    return d < startOfDay(new Date());
  }, [driver?.licenseExpiry]);

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

  const sharedFinancialBundle = useDriverFinancialBundle(driverId, driver, {
    enabled: true,
  });

  const metrics = useMemo(
    () =>
      computeDriverOperationalMetrics({
        allTrips,
        dateRange: period,
        csvMetrics,
        transactions,
        vehicleMetrics,
        driverVehicles: sharedFinancialBundle.vehicles,
        driver,
        selectedPlatforms,
        timeFilter,
        activeTab,
        monthlyEarnings,
        currentTier,
      }),
    [allTrips, period, csvMetrics, transactions, vehicleMetrics, sharedFinancialBundle.vehicles, driver, selectedPlatforms, timeFilter, activeTab, monthlyEarnings, currentTier],
  );

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
        lifetimePlatformStats: (ledgerOverview.lifetime as any).platformStats || {},
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
  }, [ledgerOverview, ledgerOverviewLoaded, metrics, allTrips, period]);

  // sharedFinancialBundle declared above

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
    if (!p.startDate || !p.endDate) return;
    const [y1, m1, d1] = p.startDate.split('-').map(Number);
    const [y2, m2, d2] = p.endDate.split('-').map(Number);
    setPeriod({
      from: new Date(y1, m1 - 1, d1, 12, 0, 0, 0),
      to: new Date(y2, m2 - 1, d2, 12, 0, 0, 0),
    });
  };

  const handleFinancialPeriodWeekSelect = handlePeriodWeekSelect;

  // Repair via ensure-from-trip-ids (repair-driver is retired 410).
  const handleRepairLedger = async () => {
    setRepairInProgress(true);
    setRepairResult(null);
    try {
      const clientTripIds = allTrips
        .filter((t) => t?.id && t.status === 'Completed')
        .map((t) => t.id);
      const result = await api.ensureLedgerFromTripIds(clientTripIds);
      const written = Number(result.stats?.ledgerRowsWritten) || 0;
      const loaded = Number(result.stats?.tripsLoaded) || 0;
      setRepairResult({
        success: result.success,
        stats: {
          ledgerRowsWritten: written,
          tripsLoaded: loaded,
          skippedNoMoney: Number(result.stats?.skippedNoMoney) || 0,
          ...result.stats,
        },
        durationMs: result.durationMs,
      });
      setLedgerRefreshKey((k) => k + 1);
      toast.success(
        written > 0
          ? `Ledger ensure wrote ${written} row(s) from ${loaded} trip(s)`
          : `Ledger ensure complete — 0 new rows (${loaded} trip(s) checked)`,
      );
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

           {/* Add note → Profile > Notes (Message CTA removed as inert) */}
           <Button
             type="button"
             variant="outline"
             size="sm"
             className="h-9"
             onClick={() => {
               setProfileSubTab('notes');
               handleTabChange('profile');
             }}
           >
             Add note
           </Button>

        </div>
      </div>

      {/* Driver Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
        <div className="flex items-start gap-4 col-span-1 md:col-span-2">
          <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
             <AvatarFallback className="text-xl bg-indigo-100 text-indigo-700">{driverName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
             <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{driverName}</h1>
                <Badge className={cn(
                    "px-3 py-0.5 font-bold uppercase tracking-widest text-[10px]",
                    driver?.status === 'Inactive' ? "bg-rose-600 text-white animate-pulse border-none shadow-lg shadow-rose-200" : "bg-emerald-100 text-emerald-700"
                )}>
                    {driver?.status === 'Inactive' ? 'TERMINATED' : driver?.status || 'Active'}
                </Badge>
                {licenseExpired && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="h-3 w-3" />
                    Cannot dispatch — licence expired
                  </Badge>
                )}
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
                {licenseNumberLabel && (
                  <span className="flex items-center gap-2 text-xs">
                    License #: {licenseNumberLabel}
                  </span>
                )}
                {licenseExpiryLabel && (
                  <span className={cn('flex items-center gap-2 text-xs', licenseExpired && 'text-rose-600 font-medium')}>
                    License expiry: {licenseExpiryLabel}
                  </span>
                )}
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
              <span className="text-sm text-slate-500">Total Lifetime {v('trips')}</span>
              <span className="font-semibold">{resolvedFinancials.lifetimeTrips}</span>
           </div>
           <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Current {v('rating')}</span>
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
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverOverviewTab
                driverStatus={driver?.status}
                ledgerOverview={ledgerOverview}
                ledgerOverviewLoaded={ledgerOverviewLoaded}
                serverTripsLoaded={serverTripsLoaded}
                repairInProgress={repairInProgress}
                repairResult={repairResult}
                tripGapDiagLoading={tripGapDiagLoading}
                onTripLedgerGapDiagnostic={handleTripLedgerGapDiagnostic}
                canRepairLedger={canRepairLedger}
                onRepairLedger={handleRepairLedger}
                resolvedFinancials={resolvedFinancials}
                metrics={metrics}
                isToday={!!isToday}
                driverId={driverId}
                walletRange={ledgerDateRangeStrings}
                platformFilterAllPlatforms={selectedPlatforms.has('All')}
              />
            </Suspense>
         </TabsContent>

         <TabsContent value="financial" className="space-y-6">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverFinancialsTab
                driverId={driverId}
                driver={driver}
                transactions={transactions}
                allTrips={allTrips}
                quotaConfig={quotaConfig}
                platformBreakdownData={platformBreakdownData}
                platformTotalEarnings={platformTotalEarnings}
                csvMetrics={csvMetrics}
                periodFrom={financialDateRange?.from}
                periodTo={financialDateRange?.to}
                onFinancialPeriodSelect={handleFinancialPeriodWeekSelect}
                financialBundle={sharedFinancialBundle}
                weeklyPeriodData={walletPayoutPeriodRows}
                weeklyCashWeeks={walletCashWeeks}
              />
            </Suspense>
          </TabsContent>
          
          <TabsContent value="wallet" className="space-y-6">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverCashWalletTab
                financialDateRange={financialDateRange}
                periodFrom={financialDateRange?.from}
                periodTo={financialDateRange?.to}
                onPeriodSelect={handlePeriodWeekSelect}
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
                periodFrom={financialDateRange?.from}
                periodTo={financialDateRange?.to}
                onPeriodSelect={handlePeriodWeekSelect}
                metrics={{
                  currentRating: metrics.currentRating,
                  completionRate: metrics.completionRate,
                  periodCancelledTrips: metrics.periodCancelledTrips,
                  acceptanceRate: metrics.acceptanceRate,
                  totalTrips: metrics.totalTrips,
                  cancellationRate: metrics.cancellationRate,
                  platformStats: metrics.platformStats as any,
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
                initialSubTab={profileSubTab}
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

