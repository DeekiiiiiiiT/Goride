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

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  Suspense,
} from 'react';
import {
  Loader2,
} from "lucide-react";
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Trip, DriverMetrics, FinancialTransaction, QuotaConfig } from '../../types/data';
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import type { CashWriteOffSavePayload } from './CashWriteOffModal';
import type { RecordPayoutSavePayload } from './RecordPayoutModal';
import {
  DriverDetailModals,
  useDriverDetailModals,
} from './DriverDetailModals';
import { DriverDetailToolbar } from './DriverDetailToolbar';
import { usePermissions } from '../../hooks/usePermissions';
import { useVocab } from '../../utils/vocabulary';
import { trackDriverOpsEvent } from '../../utils/driverOpsEvents';
import { useDriverPayoutPeriodRows } from '../../hooks/useDriverPayoutPeriodRows';
import { useDriverFinancialBundle } from '../../hooks/useDriverFinancialBundle';
import { useInvalidateDriverFinancialPeriods } from '../../hooks/useDriverFinancialPeriods';
import {
  useDriverTransactions,
  mergeDriverMoneyTransactions,
} from '../../hooks/useDriverTransactions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDriverTollLogs } from '../../hooks/useDriverTollLogs';
import { useDriverDetailTrips } from '../../hooks/useDriverDetailTrips';
import { useDriverDetailLedger } from '../../hooks/useDriverDetailLedger';
import { useDriverDetailWalletPayments } from '../../hooks/useDriverDetailWalletPayments';
import { buildWalletCallOutstandingByMonday } from '../../utils/walletCallOutstanding';
import { resolveDriverDetailFinancials } from '../../utils/resolveDriverDetailFinancials';
// TollRecoveryCard removed — Phase 8 uses platformStats injection instead
import {
  DriverPeriodProvider,
  useDriverPeriod,
} from './context/DriverPeriodContext';
import {
  isDriverDetailTab,
  type DriverDetailTab,
} from '../../navigation/pageRegistry';
import { DriverIndriveWalletTab } from './DriverIndriveWalletTab';
import { DriverDetailHeader } from './DriverDetailHeader';
import { TimeFilterValue } from './TimeFilterDropdown';
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
import { useDriverOperationalPeriods } from '../../hooks/useDriverOperationalPeriods';
import { getEffectiveTripEarnings } from '../../utils/tripEarnings';
import { normalizePlatform } from '../../utils/normalizePlatform';
import { expandDriverTransactionIds } from '../../utils/expandDriverTransactionIds';
import { isCashWriteOffTransaction } from '../../utils/driverCashPayment';
import {
  buildCashCollectionTx,
  buildCashWriteOffTx,
  buildDriverPayoutTx,
} from '../../utils/driverSettlementTx';

import type { DriverDocument } from './tabs/DriverProfileTab';
import { TabLoadingSkeleton } from '../ui/TabLoadingSkeleton';

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

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  /** Optional seed trips — detail always fetches its own full set. */
  trips?: Trip[];
  metrics?: DriverMetrics[];
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
  /** Overview + Service Quality need trip history; money tabs must not paginate trips. */
  const tripsTabActive = activeTab === 'overview' || activeTab === 'quality';
  // Fleet-wide vehicle-metrics only on ops tabs — never on money deep-links (ROAM-FLEET-10).
  const { data: vehicleMetrics = [] } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics().catch(() => []),
    enabled: tripsTabActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const {
    paymentModalState,
    setPaymentModalState,
    writeOffModalState,
    setWriteOffModalState,
    payoutModalState,
    setPayoutModalState,
    transactionToDelete,
    setTransactionToDelete,
  } = useDriverDetailModals();
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

  const { totals: operationalTotals } = useDriverOperationalPeriods(
    driverId,
    financialDateRangeStrings?.startDate,
    financialDateRangeStrings?.endDate,
  );
  /** Prefer server ops rollup for period trip counts when it has completed trips. */
  const periodCompletedFromOps =
    operationalTotals.completedCount > 0 ? operationalTotals.completedCount : null;

  // Server trips for the selected period (+ pad) — gated to Overview / Service Quality (P-7).
  const { serverTrips, serverTripsLoaded } = useDriverDetailTrips({
    driverId,
    driverName,
    driver,
    activeTab,
    startDate: financialDateRangeStrings?.startDate,
    endDate: financialDateRangeStrings?.endDate,
  });

  const {
    ledgerOverview,
    ledgerOverviewLoaded,
    ledgerRefreshKey,
    setLedgerRefreshKey,
  } = useDriverDetailLedger({
    driverId,
    startDate: ledgerDateRangeStrings?.startDate,
    endDate: ledgerDateRangeStrings?.endDate,
    selectedPlatforms,
  });

  const [repairInProgress, setRepairInProgress] = useState(false);
  const [repairResult, setRepairResult] = useState<any>(null);
  const [tripGapDiagOpen, setTripGapDiagOpen] = useState(false);
  const [tripGapDiagResult, setTripGapDiagResult] = useState<any>(null);
  const [tripGapDiagLoading, setTripGapDiagLoading] = useState(false);

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

  const {
    paymentsLogTab,
    setPaymentsLogTab,
    cashReceivedTransactions,
    bankTransferTransactions,
    activePaymentTransactions,
    groupedPaymentTransactions,
    expandedPaymentGroups,
    togglePaymentGroup,
  } = useDriverDetailWalletPayments(transactions);

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
      trackDriverOpsEvent('cash_write_off_success', {
        driverId,
        amount: payload.amount,
      });
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
      trackDriverOpsEvent('driver_payout_success', {
        driverId,
        amount: payload.amount,
      });
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
    if (driver?.dispatchBlocked === true) return true;
    const raw = driver?.licenseExpiry;
    if (!raw) return false;
    const d = parseTripDate(String(raw).slice(0, 10));
    if (!d) return false;
    return d < startOfDay(new Date());
  }, [driver?.dispatchBlocked, driver?.licenseExpiry]);

  const dispatchBlockReason =
    (typeof driver?.dispatchBlockReason === 'string' && driver.dispatchBlockReason) ||
    (licenseExpired ? 'License expired' : undefined);

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

  // Skip vehicles/finalized/disputes until money or ops tabs need them (ROAM-FLEET-10).
  const sharedFinancialBundle = useDriverFinancialBundle(driverId, driver, {
    enabled: moneyTabActive || tripsTabActive,
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

  const resolvedFinancials = useMemo(
    () =>
      resolveDriverDetailFinancials({
        ledgerOverview,
        ledgerOverviewLoaded,
        metrics,
        allTrips,
        period,
        periodCompletedFromOps,
      }),
    [ledgerOverview, ledgerOverviewLoaded, metrics, allTrips, period, periodCompletedFromOps],
  );

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

  // U-16: progressive shell — never full-page-block on trip restore; money tabs already skip trips (P-7).
  const performanceLoading =
    tripsTabActive && !serverTripsLoaded && (!metrics || metrics.totalTrips === 0);

  if (!dateRange?.from) return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Please select a date range to view driver metrics.</div>;

  const isToday = dateRange?.to && format(dateRange.to, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && metrics.daysDiff === 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DriverDetailToolbar
        onBack={onBack}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        activeTab={activeTab}
        showOverviewDateControls={showOverviewDateControls}
        dateFrom={dateRange?.from}
        dateTo={dateRange?.to}
        onPeriodWeekSelect={handlePeriodWeekSelect}
        onTripLedgerGapDiagnostic={handleTripLedgerGapDiagnostic}
        tripGapDiagLoading={tripGapDiagLoading}
        onAddNote={() => {
          setProfileSubTab('notes');
          handleTabChange('profile');
        }}
      />

      {/* Driver Header */}
      <DriverDetailHeader
        driverId={driverId}
        driverName={driverName}
        driver={driver}
        vehicleLabel={vehicleLabel}
        memberSinceLabel={memberSinceLabel}
        licenseNumberLabel={licenseNumberLabel}
        licenseExpiryLabel={licenseExpiryLabel}
        licenseExpired={licenseExpired}
        dispatchBlockReason={dispatchBlockReason}
        tierName={currentTier?.name}
        lifetimeTrips={resolvedFinancials.lifetimeTrips}
        performanceLoading={performanceLoading}
        currentRating={metrics.currentRating}
        ratingReady={serverTripsLoaded}
        tripsLabel={v('trips')}
        ratingLabel={v('rating')}
        periodCompletedCount={periodCompletedFromOps}
      />

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
            {performanceLoading ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Loading driver performance…</p>
                <TabLoadingSkeleton />
              </div>
            ) : (
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
            )}
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
            {performanceLoading ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Loading driver performance…</p>
                <TabLoadingSkeleton />
              </div>
            ) : (
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}>
              <DriverServiceQualityTab
                periodFrom={financialDateRange?.from}
                periodTo={financialDateRange?.to}
                onPeriodSelect={handlePeriodWeekSelect}
                metrics={{
                  currentRating: metrics.currentRating,
                  completionRate: metrics.completionRate,
                  periodCancelledTrips:
                    periodCompletedFromOps != null
                      ? operationalTotals.cancelledCount
                      : metrics.periodCancelledTrips,
                  acceptanceRate: metrics.acceptanceRate,
                  totalTrips:
                    periodCompletedFromOps != null
                      ? operationalTotals.tripCount
                      : metrics.totalTrips,
                  cancellationRate: metrics.cancellationRate,
                  platformStats: metrics.platformStats as any,
                }}
                cancelledTripsInPeriod={cancelledTripsInPeriod}
                serverTripsLoaded={serverTripsLoaded}
              />
            </Suspense>
            )}
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
                canEditDrivers={canEditDrivers}
                initialSubTab={profileSubTab}
              />
            </Suspense>
         </TabsContent>
      </Tabs>

      

      <DriverDetailModals
        driverName={driverName}
        callOutstanding={walletCollectionTotals.callOutstanding}
        logCashPeriods={logCashPeriods}
        transactions={transactions}
        paymentModalState={paymentModalState}
        setPaymentModalState={setPaymentModalState}
        writeOffModalState={writeOffModalState}
        setWriteOffModalState={setWriteOffModalState}
        payoutModalState={payoutModalState}
        setPayoutModalState={setPayoutModalState}
        transactionToDelete={transactionToDelete}
        setTransactionToDelete={setTransactionToDelete}
        onSavePayment={handleSavePayment}
        onSaveCashWriteOff={handleSaveCashWriteOff}
        onSaveDriverPayout={handleSaveDriverPayout}
        onConfirmDeleteTransaction={confirmDeleteTransaction}
        tripGapDiagOpen={tripGapDiagOpen}
        setTripGapDiagOpen={setTripGapDiagOpen}
        tripGapDiagResult={tripGapDiagResult}
      />
    </div>
  );
}

