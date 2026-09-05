import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FuelLayout } from '../components/fuel/FuelLayout';
import { Button } from '../components/ui/button';
import { Plus, RefreshCw, History, Loader2 } from 'lucide-react';
import { FuelCardList } from '../components/fuel/FuelCardList';
import { FuelCardModal } from '../components/fuel/FuelCardModal';
import { FuelCardAssignModal } from '../components/fuel/FuelCardAssignModal';
import { FuelLogModal } from '../components/fuel/FuelLogModal';
import { FuelLogTable } from '../components/fuel/FuelLogTable';
import { FuelConfiguration } from '../components/fuel/FuelConfiguration';
import { BucketReconciliationView } from '../components/fuel/BucketReconciliationView';
import { MileageAdjustmentModal } from '../components/fuel/MileageAdjustmentModal';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../components/ui/sheet';
import {
  toEntryYmd,
  currentFuelWeekRange,
  resolveFuelActivityEarliestMonday,
  buildFuelReconciliationWeekOptions,
  fuelListWindow,
  generateFuelWeekOptions,
} from '../utils/fuelWeekPeriod';
import { useFleetTimezone } from '../utils/timezoneDisplay';
import { type PeriodWeekOption } from '../utils/periodWeekOptions';
import { format } from 'date-fns';
import { DisputeResolutionModal } from '../components/fuel/DisputeResolutionModal';
import { FuelReimbursementTable } from '../components/fuel/FuelReimbursementTable';
import { SubmitExpenseModal } from '../components/fuel/SubmitExpenseModal';
import { fuelService } from '../services/fuelService';
import { settlementService } from '../services/settlementService';
import { finalizeFuelWeekReports } from '../services/fuelFinalizeService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { api } from '../services/api';
import { FuelReconciliationDashboard } from '../components/fuel/reconciliation/FuelReconciliationDashboard';
import { useFuelSettlementReopenGate } from '../components/fuel/reconciliation/useFuelSettlementReopenGate';
import { deriveFuelReconciliationPeriods } from '../utils/fuelPeriodStatus';
import { listFuelLeakageReviewedWeeks } from '../utils/fuelLeakageReviewStore';
import { fetchTripsForFuelWeekPaged } from '../utils/fetchTripsForFuelWeek';
import { useFuelPeriods, FUEL_PERIODS_KEY } from '../hooks/useFuelPeriods';
import {
  mergeServerFirstLandingPeriods,
  serverLeakageReviewedWeekStarts,
  weekStartYmd,
} from '../utils/fuelPeriodServerMerge';
import { fuelPeriodFinalizeIdempotencyKey } from '../utils/fuelPeriodIdempotency';
import { interpretFuelFinalizeJobResult } from '../utils/fuelFinalizeJobResult';
import {
  hasDistinctSecondApprove,
  needsHumanSecondApprover,
  resolveFuelAutoCloseDualApprovalMode,
  resolveFuelDualApprovalUiMode,
  resolveFuelSecondApproverThreshold,
  FUEL_SECOND_APPROVER_THRESHOLD,
} from '../utils/fuelDualApproval';
import { mergeFuelCardWithAssignmentHistory } from '../utils/mergeFuelCardWithAssignmentHistory';
import { supabase } from '../utils/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';
import type { FuelCard, FuelEntry, FuelScenario, MileageAdjustment, FuelDispute, WeeklyFuelReport, FinalizedFuelReport, JaaProgram } from '../types/fuel';
import type { FinancialTransaction } from '../types/data';
import type { Trip } from '../types/data';
import type { Vehicle } from '../types/vehicle';
import { FuelReconBusyProvider, useFuelReconBusy } from '../components/fuel/reconciliation/fuelReconBusyLock';

export function FuelManagement(props: {
  defaultTab?: string;
  onViewDriverLedger?: (driverId: string) => void;
  onTabChange?: (tab: string) => void;
}) {
  return (
    <FuelReconBusyProvider>
      <FuelManagementInner {...props} />
    </FuelReconBusyProvider>
  );
}

function FuelManagementInner({ defaultTab = 'logs', onViewDriverLedger, onTabChange }: {
    defaultTab?: string,
    onViewDriverLedger?: (driverId: string) => void,
    onTabChange?: (tab: string) => void
}) {
  const queryClient = useQueryClient();
  const { runExclusive, setMessage } = useFuelReconBusy();
  const { confirmIfNeeded: confirmSettlementReopen, dialog: settlementReopenDialog } =
    useFuelSettlementReopenGate();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const lastFuelDataLoadAtRef = useRef(0);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const fleetTz = useFleetTimezone();

  // Shared active fuel week (Mon–Sun) — Logs / Recon / Reimbursements default from this.
  // Logs may temporarily diverge via allowCustomRange; recon week change resets logs override.
  const [activeFuelWeek, setActiveFuelWeek] = useState<DateRange | undefined>(() => {
    const range = currentFuelWeekRange();
    return { from: range.from, to: range.to };
  });
  const [logCustomOverride, setLogCustomOverride] = useState(false);
  const [logDateRangeOverride, setLogDateRangeOverride] = useState<DateRange | undefined>(undefined);

  // Align active week to fleet TZ once timezone is known
  useEffect(() => {
    if (!fleetTz) return;
    const range = currentFuelWeekRange(fleetTz);
    setActiveFuelWeek((prev) => {
      if (logCustomOverride) return prev;
      const nextStart = toEntryYmd(range.from);
      const prevStart = prev?.from ? toEntryYmd(prev.from) : '';
      if (nextStart === prevStart) return prev;
      return { from: range.from, to: range.to };
    });
  }, [fleetTz, logCustomOverride]);

  const reconciliationDateRange = activeFuelWeek;
  const reimbursementDateRange = activeFuelWeek;
  const logDateRange = logCustomOverride ? logDateRangeOverride : activeFuelWeek;

  const [activityMinDate, setActivityMinDate] = useState<string | null>(null);

  const fuelFetchWindow = useMemo(() => {
    const week = currentFuelWeekRange(fleetTz || undefined);
    const selectedStart = reconciliationDateRange?.from
      ? toEntryYmd(reconciliationDateRange.from)
      : toEntryYmd(week.from);
    const selectedEnd = reconciliationDateRange?.to
      ? toEntryYmd(reconciliationDateRange.to)
      : toEntryYmd(week.to);
    const currentEnd = toEntryYmd(week.to);

    // Logs/tx window = selected week only (+ fuelListWindow pad). Do NOT expand to
    // activityMinDate — that paged the entire history and saturated HTTP/1.1 (ROAM-FLEET-10).
    // Recon landing uses SQL periods; older weeks do not need every fill in memory.
    const endDate = selectedEnd > currentEnd ? selectedEnd : currentEnd;
    const base = fuelListWindow({ startYmd: selectedStart, endYmd: endDate });

    if (logCustomOverride && logDateRangeOverride?.from) {
      const customStart = toEntryYmd(logDateRangeOverride.from);
      const customEnd = toEntryYmd(logDateRangeOverride.to || logDateRangeOverride.from);
      return {
        startDate: customStart < base.startDate ? customStart : base.startDate,
        endDate: customEnd > base.endDate ? customEnd : base.endDate,
      };
    }
    return base;
  }, [reconciliationDateRange, logCustomOverride, logDateRangeOverride, fleetTz]);

  const setLogDateRange = (range: DateRange | undefined) => {
    const activeStart = activeFuelWeek?.from ? toEntryYmd(activeFuelWeek.from) : '';
    const activeEnd = activeFuelWeek?.to ? toEntryYmd(activeFuelWeek.to) : '';
    const nextStart = range?.from ? toEntryYmd(range.from) : '';
    const nextEnd = range?.to ? toEntryYmd(range.to) : '';
    const matchesActive = nextStart === activeStart && nextEnd === activeEnd;
    if (matchesActive || !range?.from) {
      setLogCustomOverride(false);
      setLogDateRangeOverride(undefined);
      if (range?.from) setActiveFuelWeek(range);
      return;
    }
    setLogCustomOverride(true);
    setLogDateRangeOverride(range);
  };

  const setReimbursementDateRange = (range: DateRange | undefined) => {
    if (range?.from) setActiveFuelWeek(range);
  };

  const reconciliationPeriodStart = reconciliationDateRange?.from
    ? format(reconciliationDateRange.from, 'yyyy-MM-dd')
    : undefined;
  const reconciliationPeriodEnd = reconciliationDateRange?.to
    ? format(reconciliationDateRange.to, 'yyyy-MM-dd')
    : reconciliationPeriodStart;

  const handleReconciliationPeriodSelect = (period: PeriodWeekOption) => {
    if (!period.startDate || !period.endDate) return;
    const [sy, sm, sd] = period.startDate.split('-').map(Number);
    const [ey, em, ed] = period.endDate.split('-').map(Number);
    const next = {
      from: new Date(sy, sm - 1, sd),
      to: new Date(ey, em - 1, ed),
    };
    setActiveFuelWeek(next);
    // Changing recon week resets logs custom override back to shared week
    setLogCustomOverride(false);
    setLogDateRangeOverride(undefined);
  };

  // Fuel Card State
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsLoadError, setCardsLoadError] = useState<string | null>(null);
  const [jaaPrograms, setJaaPrograms] = useState<JaaProgram[]>([]);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FuelCard | null>(null);
  const [assigningCard, setAssigningCard] = useState<FuelCard | null>(null);

  const selfServePrograms = useMemo(
    () => jaaPrograms.filter((p) => p.mode === 'self_serve'),
    [jaaPrograms],
  );

  const isRoamManagedCard = useCallback(
    (card: FuelCard | null | undefined) => {
      if (!card?.jaaCompanyCode) return false;
      const cc = String(card.jaaCompanyCode).replace(/\D/g, '');
      return jaaPrograms.some(
        (p) => p.mode === 'roam_managed' && String(p.companyCode).replace(/\D/g, '') === cc,
      );
    },
    [jaaPrograms],
  );

  // Fuel Log State
  const [logs, setLogs] = useState<FuelEntry[]>([]);
  const [fuelDataTruncated, setFuelDataTruncated] = useState(false);
  const [transactionsTruncated, setTransactionsTruncated] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<FuelEntry | null>(null);

  // Reimbursement State
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [isSubmitExpenseModalOpen, setIsSubmitExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinancialTransaction | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deleteLogConfirmationId, setDeleteLogConfirmationId] = useState<string | null>(null);
  const [cascadeDelete, setCascadeDelete] = useState(true);

  // Adjustment State
  const [adjustments, setAdjustments] = useState<MileageAdjustment[]>([]);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentDefaults, setAdjustmentDefaults] = useState<{ vehicleId?: string, date?: Date }>({});

  // Dispute State
  const [disputes, setDisputes] = useState<FuelDispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<FuelDispute | null>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  /** First fuel-logs fetch finished (even if empty) — avoids empty-state flash on recon. */
  const [fuelLogsHydrated, setFuelLogsHydrated] = useState(false);
  const [fuelLogsLoadError, setFuelLogsLoadError] = useState<string | null>(null);
  const [secondApproverThreshold, setSecondApproverThreshold] = useState(
    FUEL_SECOND_APPROVER_THRESHOLD,
  );
  const [autoCloseDualApprovalMode, setAutoCloseDualApprovalMode] = useState<
    'skip' | 'service_approve'
  >('skip');
  const [dualApprovalUiMode, setDualApprovalUiMode] = useState<'human' | 'service_only'>('human');


  // Assignment Data
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
  const [finalizedReports, setFinalizedReports] = useState<FinalizedFuelReport[]>([]);

  // Week list starts at first real fuel activity (not a hard-coded Dec 2025 launch date)
  const reconciliationWeekOptions = useMemo(() => {
    const earliest = resolveFuelActivityEarliestMonday(
      [activityMinDate, ...logs.map((e) => e.date)],
      finalizedReports.map((f) => f.weekStart),
      fleetTz || undefined,
    );
    return buildFuelReconciliationWeekOptions(earliest, fleetTz || undefined);
  }, [activityMinDate, logs, finalizedReports, fleetTz]);

  // Instant landing: query last ~52 weeks from "now" — do not wait for activity bounds.
  const landingPeriodRange = useMemo(() => {
    const opts = generateFuelWeekOptions(52, fleetTz || undefined);
    return {
      from: opts[opts.length - 1]?.startDate,
      to: opts[0]?.startDate,
    };
  }, [fleetTz]);

  // Recompute first, then enable the periods query once — avoids GET+POST+GET storm (ROAM-FLEET-10).
  const [periodsQueryReady, setPeriodsQueryReady] = useState(false);
  useEffect(() => {
    if (activeTab !== 'reconciliation') {
      setPeriodsQueryReady(false);
      return;
    }
    if (!landingPeriodRange.from || !landingPeriodRange.to) return;
    let cancelled = false;
    setPeriodsQueryReady(false);
    void api
      .recomputeFuelReconciliationPeriods({
        from: landingPeriodRange.from,
        to: landingPeriodRange.to,
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPeriodsQueryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, landingPeriodRange.from, landingPeriodRange.to]);

  const {
    data: serverFuelPeriods = [],
    isPending: serverPeriodsPending,
    isError: serverPeriodsError,
  } = useFuelPeriods({
    from: landingPeriodRange.from,
    to: landingPeriodRange.to,
    // Recon-only — never compete with Transaction Logs page load (HTTP/1.1 overhead).
    enabled:
      activeTab === 'reconciliation' &&
      periodsQueryReady &&
      Boolean(landingPeriodRange.from && landingPeriodRange.to),
  });

  // No browser week-engines on landing mount (was N engines × trips/PA/brain → multi-second trickle).
  // Money/chips: SQL periods first; entry-derived snapshots fill gaps (provisional unexplained).
  const fuelReconPeriods = useMemo(() => {
    const serverByWeek = new Map(
      serverFuelPeriods.map((r) => [weekStartYmd(r.weekStart), r] as const),
    );
    const leakageReviewedWeeks = serverLeakageReviewedWeekStarts(serverFuelPeriods);
    for (const w of listFuelLeakageReviewedWeeks()) {
      if (!serverByWeek.has(w)) leakageReviewedWeeks.add(w);
    }
    const derived =
      vehicles.length > 0 || logs.length > 0
        ? deriveFuelReconciliationPeriods({
            weekOptions: reconciliationWeekOptions,
            vehicles,
            fuelEntries: logs,
            disputes,
            finalizedReports,
            scenarios,
            liveReportsByWeek: undefined,
            leakageReviewedWeeks,
          })
        : [];
    return mergeServerFirstLandingPeriods(serverFuelPeriods, derived);
  }, [
    reconciliationWeekOptions,
    vehicles,
    logs,
    disputes,
    finalizedReports,
    scenarios,
    serverFuelPeriods,
  ]);

  const reconLandingLoading =
    fuelReconPeriods.length === 0 &&
    (activeTab !== 'reconciliation' ||
      !periodsQueryReady ||
      serverPeriodsPending ||
      !fuelLogsHydrated);

  const outstandingFuelPeriods = useMemo(
    () => fuelReconPeriods.filter((p) => p.status === 'outstanding' && !p.locked),
    [fuelReconPeriods],
  );
  const inProgressFuelPeriods = useMemo(
    () => fuelReconPeriods.filter((p) => p.status === 'in_progress' && !p.locked),
    [fuelReconPeriods],
  );
  const completedFuelPeriods = useMemo(
    () => fuelReconPeriods.filter((p) => p.locked || p.status === 'completed'),
    [fuelReconPeriods],
  );

  // Keep finalized-week SQL rows fresh — handled by periodsQueryReady gate above.
  // Dual-approval prefs for landing badges + finalize gate (org-scoped)
  useEffect(() => {
    if (activeTab !== 'reconciliation') return;
    let cancelled = false;
    void api
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        const p = prefs as {
          fuelSecondApproverThreshold?: number;
          fuelAutoCloseDualApprovalMode?: string;
          fuelDualApprovalUiMode?: string;
        };
        setSecondApproverThreshold(
          resolveFuelSecondApproverThreshold(p?.fuelSecondApproverThreshold),
        );
        setAutoCloseDualApprovalMode(
          resolveFuelAutoCloseDualApprovalMode(p?.fuelAutoCloseDualApprovalMode),
        );
        setDualApprovalUiMode(resolveFuelDualApprovalUiMode(p?.fuelDualApprovalUiMode));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // If selection falls outside activity-based options (e.g. old Dec weeks), snap to current week
  useEffect(() => {
    if (!reconciliationWeekOptions.length || !reconciliationPeriodStart) return;
    const ok = reconciliationWeekOptions.some((o) => o.startDate === reconciliationPeriodStart);
    if (ok) return;
    const range = currentFuelWeekRange(fleetTz || undefined);
    setActiveFuelWeek({ from: range.from, to: range.to });
    setLogCustomOverride(false);
    setLogDateRangeOverride(undefined);
  }, [reconciliationWeekOptions, reconciliationPeriodStart, fleetTz]);

  // Phase 3: Bucket View State
  const [selectedBucketVehicle, setSelectedBucketVehicle] = useState<Vehicle | null>(null);
  const [isBucketSheetOpen, setIsBucketSheetOpen] = useState(false);

  // Effect to reload trips when Reconciliation Date Range changes — after periods first paint
  useEffect(() => {
    if (activeTab !== 'reconciliation' || !periodsQueryReady) return;
    const fetchTripsForRange = async () => {
        if (!reconciliationDateRange?.from) return;
        try {
            const startDate = toEntryYmd(reconciliationDateRange.from);
            const endDate = toEntryYmd(reconciliationDateRange.to || reconciliationDateRange.from);
            const { trips: weekTrips, tripsTruncated } = await fetchTripsForFuelWeekPaged(
              startDate,
              endDate,
            );
            setTrips(weekTrips);
            if (tripsTruncated) setFuelDataTruncated(true);
        } catch (e) {
            console.error("Failed to fetch trips for range", e);
            // Don't toast error here to avoid spamming on mount if it fails silently
        }
    };
    fetchTripsForRange();
  }, [activeTab, periodsQueryReady, reconciliationDateRange]);

  const loadLogsAndTransactions = useCallback(async () => {
    const { startDate, endDate } = fuelFetchWindow;
    try {
      const [logsData, txData] = await Promise.all([
        // Paged fetch loads the whole date window (not a single 1500-row page) under
        // the service safety ceiling; on ceiling overflow it surfaces the partial count.
        fuelService.getAllFuelEntriesInRange({ startDate, endDate }).catch((err) => {
          console.error('[FuelManagement] getAllFuelEntriesInRange failed', err);
          if (typeof err?.partialCount === 'number' && typeof err?.totalCount === 'number') {
            toast.warning(
              `Loaded ${err.partialCount} of ${err.totalCount} fills — narrow the period.`,
            );
          } else {
            toast.error('Could not load fuel entries — try logging out and back in.');
          }
          return [] as FuelEntry[];
        }),
        api.getAllTransactionsInRange({ startDate, endDate }).catch((err) => {
          console.error('[FuelManagement] getAllTransactionsInRange failed', err);
          return [] as FinancialTransaction[];
        }),
      ]);
      setLogs(logsData);
      const logsTotal = (logsData as FuelEntry[] & { totalCount?: number }).totalCount;
      setFuelDataTruncated(typeof logsTotal === 'number' && logsData.length < logsTotal);
      setTransactions(txData);
      setTransactionsTruncated(
        (txData as FinancialTransaction[] & { truncated?: boolean }).truncated === true,
      );
      lastFuelDataLoadAtRef.current = Date.now();
      setFuelLogsLoadError(null);
      setFuelLogsHydrated(true);
    } catch (e) {
      console.error('[FuelManagement] Dated fuel/tx load failed', e);
      setFuelLogsLoadError(e instanceof Error ? e.message : 'Failed to load fuel logs.');
      setFuelLogsHydrated(true);
    }
  }, [fuelFetchWindow]);

  useEffect(() => {
    void loadLogsAndTransactions();
  }, [loadLogsAndTransactions]);

  // Silent refresh when switching to Logs / Review if data is stale (>30s)
  useEffect(() => {
    if (activeTab !== 'logs' && activeTab !== 'reimbursements') return;
    const age = Date.now() - lastFuelDataLoadAtRef.current;
    if (lastFuelDataLoadAtRef.current > 0 && age > 30_000) {
      void loadLogsAndTransactions();
    }
  }, [activeTab, loadLogsAndTransactions]);

  const coreLoadedRef = useRef(false);
  const reconLoadedRef = useRef(false);
  const fullLoadedRef = useRef(false);

  const loadData = useCallback(async (
    silent = false,
    opts?: { scope?: 'core' | 'recon' | 'full' },
  ) => {
      const scope =
        opts?.scope ||
        (activeTab === 'logs' || activeTab === 'reimbursements'
          ? 'core'
          : activeTab === 'reconciliation' || activeTab === 'configuration'
            ? 'recon'
            : 'full');
      if (!silent) setIsRefreshing(true);
      try {
          // Names first — Transaction Logs only needs vehicles/drivers for display.
          const vehiclesP = api.getVehicles().catch((err) => {
              console.error('[FuelManagement] getVehicles failed', err);
              toast.error('Could not load vehicles — session may have expired.');
              return [];
          });
          const driversP = api.getDrivers().catch(() => []);

          if (scope === 'core') {
              const [vData, dData] = await Promise.all([vehiclesP, driversP]);
              setVehicles(vData);
              setDrivers(dData);
              setCardsLoading(false);
              coreLoadedRef.current = true;
              if (!silent) toast.success('Data refreshed');
              return;
          }

          // Recon/config need scenarios/disputes/finalized — not card inventory or ensure-posted.
          const scenariosP = fuelService.getFuelScenarios().catch(() => []);
          const adjsP = fuelService.getMileageAdjustments().catch(() => []);
          const disputesP = FuelDisputeService.getAllDisputes().catch(() => []);
          const finalizedFrom = activityMinDate || fuelFetchWindow.startDate;
          const finalizedTo = fuelFetchWindow.endDate;
          const finalizedP = api
            .getFinalizedReports({
              weekStartFrom: finalizedFrom,
              weekStartTo: finalizedTo,
            })
            .catch(() => []);
          const boundsP = fuelService.getFuelActivityBounds().catch(() => ({ minDate: null as string | null }));

          if (scope === 'recon') {
              const [vData, dData, scenariosData, adjsData, disputesData, finalizedData, boundsData] =
                  await Promise.all([
                      vehiclesP,
                      driversP,
                      scenariosP,
                      adjsP,
                      disputesP,
                      finalizedP,
                      boundsP,
                  ]);
              setVehicles(vData);
              setDrivers(dData);
              setScenarios(scenariosData);
              setAdjustments(adjsData);
              setDisputes(disputesData);
              setFinalizedReports(Array.isArray(finalizedData) ? finalizedData : []);
              setActivityMinDate(boundsData.minDate);
              setCardsLoading(false);
              coreLoadedRef.current = true;
              reconLoadedRef.current = true;
              if (!silent) toast.success('Data refreshed');
              return;
          }

          // Heal in background — must not block Card Inventory / first paint
          void fuelService.ensurePostedEntries(40).catch(() => ({ healed: 0, blocked: 0 }));

          const cardsP = fuelService.getFuelCards().then(
              (data) => data,
              (err) => {
                  console.error('[FuelManagement] getFuelCards failed', err);
                  throw err;
              },
          );
          const programsP = fuelService.getJaaPrograms().catch(() => [] as JaaProgram[]);

          // Card Inventory only needs cards (+ drivers/vehicles for Assigned To)
          try {
              const [vData, dData, cardsData, programsData] = await Promise.all([
                  vehiclesP,
                  driversP,
                  cardsP,
                  programsP,
              ]);
              setVehicles(vData);
              setDrivers(dData);
              setCards(cardsData);
              setJaaPrograms(programsData);
              setCardsLoadError(null);
              setCardsLoading(false);
          } catch (cardErr: any) {
              console.error('[FuelManagement] Card inventory load failed', cardErr);
              setCardsLoadError(cardErr?.message || 'Failed to load cards');
              setCardsLoading(false);
              // Keep previous cards if any — never pretend the inventory was empty
          }

          const [scenariosData, adjsData, disputesData, finalizedData, boundsData] =
              await Promise.all([scenariosP, adjsP, disputesP, finalizedP, boundsP]);

          setScenarios(scenariosData);
          setAdjustments(adjsData);
          setDisputes(disputesData);
          setFinalizedReports(Array.isArray(finalizedData) ? finalizedData : []);
          setActivityMinDate(boundsData.minDate);
          coreLoadedRef.current = true;
          reconLoadedRef.current = true;
          fullLoadedRef.current = true;

          if (!silent) toast.success("Data refreshed");
      } catch (e) {
          console.error("Failed to load fuel management data", e);
          toast.error("Failed to load initial data");
          setCardsLoading(false);
      } finally {
          setIsRefreshing(false);
      }
  }, [activeTab, activityMinDate, fuelFetchWindow.endDate, fuelFetchWindow.startDate]);

  // Tab-scoped bootstrap — logs stay light; recon skips cards; cards tab loads full bundle.
  useEffect(() => {
    if (activeTab === 'logs' || activeTab === 'reimbursements') {
      if (coreLoadedRef.current || reconLoadedRef.current || fullLoadedRef.current) return;
      void loadData(true, { scope: 'core' });
      return;
    }
    if (activeTab === 'cards') {
      if (fullLoadedRef.current) return;
      void loadData(true, { scope: 'full' });
      return;
    }
    // reconciliation / configuration
    if (reconLoadedRef.current || fullLoadedRef.current) return;
    void loadData(true, { scope: 'recon' });
  }, [activeTab, loadData]);

  // When opening Add Fill from Logs, warm cards if still empty.
  useEffect(() => {
    if (!isLogModalOpen || cards.length > 0) return;
    void fuelService
      .getFuelCards()
      .then((data) => {
        setCards(data);
        setCardsLoadError(null);
      })
      .catch((err) => {
        console.error('[FuelManagement] Lazy card load failed', err);
      });
  }, [isLogModalOpen, cards.length]);

  // Lightweight refresh for fuel entries only (used after Bulk Assign)
  const refreshLogs = useCallback(async () => {
    await loadLogsAndTransactions();
  }, [loadLogsAndTransactions]);

  // Card Handlers
  const handleSaveCard = useCallback(async (card: FuelCard) => {
      try {
          const previous = cards.find((c) => c.id === card.id) || editingCard || assigningCard || null;
          const withHistory = mergeFuelCardWithAssignmentHistory(previous, card, {
            drivers: drivers as any,
            vehicles: vehicles as any,
          });
          const savedCard = await fuelService.saveFuelCard(withHistory);
          const exists = cards.some((c) => c.id === savedCard.id);
          if (exists || editingCard || assigningCard) {
              setCards(prev => prev.map(c => c.id === savedCard.id ? savedCard : c));
              toast.success(assigningCard ? "Driver assignment saved" : "Fuel card updated");
          } else {
              setCards(prev => [...prev, savedCard]);
              toast.success("Fuel card added");
          }
          setIsCardModalOpen(false);
          setEditingCard(null);
          setAssigningCard(null);
      } catch (e: any) {
          console.error(e);
          toast.error(e?.message || "Failed to save fuel card");
      }
  }, [editingCard, assigningCard, cards, drivers, vehicles]);

  const handleDeleteCard = useCallback(async (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (isRoamManagedCard(card)) {
          toast.error("Roam-managed cards cannot be deleted here. Contact Roam admin.");
          return;
      }
      try {
          await fuelService.deleteFuelCard(id);
          setCards(prev => prev.filter(c => c.id !== id));
          toast.success("Fuel card deleted");
      } catch (e: any) {
          console.error(e);
          toast.error(e?.message || "Failed to delete fuel card");
      }
  }, [cards, isRoamManagedCard]);

  // Log Handlers
  const handleSaveLog = async (entryOrEntries: FuelEntry | FuelEntry[]) => {
      setIsSyncing(true);
      try {
          if (Array.isArray(entryOrEntries)) {
              // Bulk Mode
              const promises = entryOrEntries.map(entry => fuelService.saveFuelEntry(entry));
              const savedLogs = await Promise.all(promises);
              
              // Process settlements for bulk entries
              const scenariosData = await fuelService.getFuelScenarios();
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
              */
              
              // Phase 7: Bulk vendor creation for entries without GPS/verified stations
              const vendorCreationPromises = savedLogs
                  .filter(log => {
                      const hasNoGPS = !log.geofenceMetadata || !log.geofenceMetadata.lat || !log.geofenceMetadata.lng;
                      const hasNoVerifiedStation = !log.matchedStationId;
                      const hasVendorName = log.location && log.location.trim() !== '';
                      return log.transactionId && hasNoGPS && hasNoVerifiedStation && hasVendorName;
                  })
                  .map(log => 
                      api.createUnverifiedVendor({
                          transactionId: log.transactionId!,
                          vendorName: log.location,
                          sourceType: 'no_gps'
                      }).catch(err => {
                          console.warn(`[Vendor Gate] Failed to create vendor for ${log.location}:`, err);
                          return null;
                      })
                  );
              
              if (vendorCreationPromises.length > 0) {
                  await Promise.all(vendorCreationPromises);
                  console.log(`[Vendor Gate] Created ${vendorCreationPromises.length} unverified vendors from bulk entry`);
              }
              
              setLogs(prev => [...savedLogs, ...prev]);
              toast.success(`Successfully recorded ${savedLogs.length} transactions (Pending Reconciliation)`);
          } else {
              // Single Mode
              const entry = entryOrEntries;
              
              // Phase 1: Foundation & Persistence
              // If we are editing, we should mark it as edited in metadata
              const payload = editingLog ? {
                  ...entry,
                  correctionReason:
                      (entry as FuelEntry & { correctionReason?: string }).correctionReason ||
                      entry.metadata?.editReason ||
                      'Admin correction',
                  metadata: {
                      ...entry.metadata,
                      isEdited: true,
                      lastEditedAt: new Date().toISOString(),
                      editReason: entry.metadata?.editReason
                  }
              } : entry;

              const savedLog = await fuelService.saveFuelEntry(payload);
              
              // Process settlement
              const scenariosData = await fuelService.getFuelScenarios();
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
              */

              // Phase 7: Auto-create unverified vendor if entry lacks GPS and verified station match
              if (!editingLog && savedLog.transactionId) {
                  const hasNoGPS = !savedLog.geofenceMetadata || 
                                   !savedLog.geofenceMetadata.lat || 
                                   !savedLog.geofenceMetadata.lng;
                  const hasNoVerifiedStation = !savedLog.matchedStationId;
                  const hasVendorName = savedLog.location && savedLog.location.trim() !== '';
                  
                  if (hasNoGPS && hasNoVerifiedStation && hasVendorName) {
                      try {
                          await api.createUnverifiedVendor({
                              transactionId: savedLog.transactionId,
                              vendorName: savedLog.location,
                              sourceType: 'no_gps'
                          });
                          console.log(`[Vendor Gate] Created unverified vendor for: ${savedLog.location}`);
                      } catch (vendorError: any) {
                          console.warn('[Vendor Gate] Failed to create unverified vendor:', vendorError);
                          // Don't block the main flow - just log the error
                      }
                  }
              }

              if (editingLog) {
                  // Phase 13: Financial Ledger Sync Hardening (Step 13.1)
                  const transactionId = savedLog.transactionId;
                  const existingTx = transactions.find(t => (transactionId && t.id === transactionId) || t.metadata?.sourceId === savedLog.id);
                  
                  if (existingTx) {
                      try {
                          await api.saveTransaction({
                              ...existingTx,
                              // Preserve the sign of the original transaction while updating the magnitude
                              amount: existingTx.amount < 0 ? -Math.abs(savedLog.amount) : Math.abs(savedLog.amount),
                              date: (savedLog.date || entry.date || '').split('T')[0],
                              description: `Fuel: ${savedLog.location || 'Unknown Station'} - ${savedLog.liters}L @ $${(savedLog.amount / (savedLog.liters || 1)).toFixed(3)}/L`,
                              driverId: savedLog.driverId,
                              vehicleId: savedLog.vehicleId,
                              driverName: getDriverName(savedLog.driverId),
                              odometer: savedLog.odometer,
                              quantity: savedLog.liters,
                              metadata: {
                                  ...existingTx.metadata,
                                  isEdited: true,
                                  lastEditedAt: new Date().toISOString(),
                                  editReason: entry.metadata?.editReason,
                                  syncSource: 'fuel_log',
                                  odometer: savedLog.odometer,
                                  fuelVolume: savedLog.liters
                              }
                          });
                      } catch (e) {
                          console.error("Failed to sync changes to associated financial transaction", e);
                      }
                  }
                  
                  setLogs(prev => prev.map(l => l.id === savedLog.id ? savedLog : l));
                  toast.success("Transaction updated & financial ledger synced");
              } else {
                  setLogs(prev => [savedLog, ...prev]);
                  toast.success("Transaction recorded (Pending Reconciliation)");
              }
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
          void loadLogsAndTransactions();
          // Keep names/cards warm without re-running the full recon/cards bundle.
          void loadData(true, { scope: activeTab === 'logs' ? 'core' : 'full' });
      } catch (e) {
          console.error(e);
          toast.error(e instanceof Error ? e.message : "Failed to save transaction(s)");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleDeleteLog = useCallback(async (id: string) => {
      setDeleteLogConfirmationId(id);
      setCascadeDelete(true);
  }, []);

  const handleApproveLogReview = useCallback(async (id: string, odometer: number, notes?: string) => {
      try {
          const updated = await api.approveExpense(id, notes, odometer);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          // Refresh logs to pick up the new fuel_entry created by server
          await loadLogsAndTransactions();
          toast.success("Posted to Transaction Logs");
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve log review");
      }
  }, [loadLogsAndTransactions]);

  // Reimbursement Handlers
  const handleApproveReimbursement = useCallback(async (
      id: string,
      notes?: string,
      stationOpts?: { matchedStationId?: string; stationLocation?: string }
  ) => {
      try {
          const updated = await api.approveExpense(id, notes, undefined, stationOpts);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          
          if (updated.category === 'Fuel' || updated.category === 'Fuel Reimbursement') {
              await fuelService.getFuelScenarios();
              try {
                  await loadLogsAndTransactions();
              } catch {
                  /* non-fatal */
              }
              toast.success("Posted to Transaction Logs");
          } else {
              toast.success("Expense approved");
          }
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve reimbursement");
      }
  }, [loadLogsAndTransactions]);

  const handleRejectReimbursement = useCallback(async (id: string, reason?: string) => {
      try {
          const updated = await api.rejectExpense(id, reason);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          toast.success("Reimbursement Rejected");
      } catch (e) {
          console.error(e);
          toast.error("Failed to reject reimbursement");
      }
  }, []);

    const handleSaveExpense = async (transactionData: any, shouldRefresh = true) => {
        setIsSyncing(true);
        try {
            // Gas Card manual = odometer/station anchor (same as live driver) — no reimbursement TX
            if (transactionData?._saveAsGasCardAnchor && transactionData.fuelEntry) {
                const saved = await fuelService.saveFuelEntry(transactionData.fuelEntry);
                setLogs((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)]);
                if (shouldRefresh) await loadData(true);
                return;
            }

            const savedTx = await api.saveTransaction(transactionData);
            
            // If admin saves as 'Approved' immediately, process settlement
            if (savedTx.status === 'Approved' && (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement')) {
                const scenariosData = await fuelService.getFuelScenarios();
                 /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 */
            }

            if (editingExpense) {
                // Safeguard: if payment source changed away from driver_cash on an approved transaction,
                // delete the orphaned wallet credit that was created during original approval
                const oldPaymentSource = editingExpense.metadata?.paymentSource;
                const newPaymentSource = savedTx.metadata?.paymentSource || savedTx.metadata?.previousPaymentSource;
                const actualNewSource = savedTx.metadata?.paymentSource;
                if (
                    editingExpense.status === 'Approved' &&
                    oldPaymentSource === 'driver_cash' &&
                    actualNewSource && actualNewSource !== 'driver_cash'
                ) {
                    try {
                        const creditId = `fuel-credit-${savedTx.id}`;
                        await api.deleteTransaction(creditId);
                        console.log(`[handleSaveExpense] Deleted orphaned wallet credit ${creditId} — payment source changed from driver_cash to ${actualNewSource}`);
                    } catch (creditErr: any) {
                        // Credit may not exist — that's OK, log and continue
                        console.warn(`[handleSaveExpense] Could not delete wallet credit fuel-credit-${savedTx.id}:`, creditErr?.message || creditErr);
                    }
                }

                // ... logic to sync with logs ...
                if (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement') {
                    const linkedLog = logs.find(l => l.transactionId === savedTx.id || l.id === savedTx.metadata?.sourceId);
                    if (linkedLog) {
                        try {
                            const updatedLog = {
                                ...linkedLog,
                                amount: Math.abs(savedTx.amount),
                                date: savedTx.date.includes('T') ? savedTx.date : `${savedTx.date}T${savedTx.time || '12:00:00'}`,
                                location: savedTx.vendor || savedTx.merchant || linkedLog.location,
                                vendor: savedTx.vendor || savedTx.merchant || linkedLog.vendor,
                                matchedStationId: savedTx.matchedStationId || savedTx.metadata?.matchedStationId || linkedLog.matchedStationId,
                                driverId: savedTx.driverId || linkedLog.driverId,
                                vehicleId: savedTx.vehicleId || linkedLog.vehicleId,
                                odometer: savedTx.odometer || linkedLog.odometer,
                                liters: savedTx.quantity || linkedLog.liters,
                                metadata: {
                                    ...linkedLog.metadata,
                                    isEdited: true,
                                    lastEditedAt: new Date().toISOString(),
                                    syncSource: 'financial_transaction',
                                    editReason: 'Financial record reconciliation sync'
                                }
                            };
                            
                            if (updatedLog.liters && updatedLog.liters > 0) {
                                updatedLog.pricePerLiter = Number((updatedLog.amount / updatedLog.liters).toFixed(3));
                                if (updatedLog.metadata) updatedLog.metadata.pricePerLiter = updatedLog.pricePerLiter;
                            }

                            await fuelService.saveFuelEntry(updatedLog);
                            setLogs(prev => prev.map(l => l.id === updatedLog.id ? updatedLog : l));
                        } catch (e) {
                            console.error("Failed to sync changes back to fuel log", e);
                        }
                    }
                }
                setTransactions(prev => prev.map(t => t.id === savedTx.id ? savedTx : t));
                toast.success("Expense updated and linked fuel records synced");
            } else {
                setTransactions(prev => [savedTx, ...prev]);
                // We don't toast here if it's bulk, the modal will toast at the end
            }
            
            if (shouldRefresh) {
                await loadData(true);
            }
        } catch (e) {
            console.error(e);
            throw e; // Let the modal catch it
        } finally {
            setIsSyncing(false);
        }
    };

  const handleEditExpense = useCallback((tx: FinancialTransaction) => {
      setEditingExpense(tx);
      setIsSubmitExpenseModalOpen(true);
  }, []);

  const confirmDeleteLog = async () => {
      if (!deleteLogConfirmationId) return;
      
      const logEntry = logs.find(l => l.id === deleteLogConfirmationId);
      if (!logEntry) {
        setDeleteLogConfirmationId(null);
        return;
      }

      setIsSyncing(true);
      try {
          // 1. Discover all related records (Step 1.3/2.1)
          const cleanupMap = await fuelService.getCleanupMap(deleteLogConfirmationId);
          const transactionsToDelete = cleanupMap.relatedTransactions;
          
          // 2. Delete ledger rows first, then the fuel log (avoids orphaned links if a txn delete fails)
          if (cascadeDelete && transactionsToDelete.length > 0) {
              await Promise.all(transactionsToDelete.map(tx => api.deleteTransaction(tx.id)));
          }

          await fuelService.deleteFuelEntry(deleteLogConfirmationId);
          
          let deletedTxCount = cascadeDelete ? transactionsToDelete.length : 0;

          // 3. Update Local State
          setLogs(prev => prev.filter(l => l.id !== deleteLogConfirmationId));
          if (cascadeDelete && transactionsToDelete.length > 0) {
              const txIdsToDelete = transactionsToDelete.map(tx => tx.id);
              setTransactions(prev => prev.filter(t => !txIdsToDelete.includes(t.id)));
          }
          
          // 4. Detailed UI Feedback (Step 2.3)
          const detailsText = ` (${logEntry.liters}L, $${logEntry.amount.toFixed(2)})`;
          const successMessage = cascadeDelete && deletedTxCount > 0
              ? `Fuel log and ${deletedTxCount} associated ledger records purged successfully.`
              : `Fuel log entry deleted successfully.`;
          
          toast.success(successMessage, {
              description: cascadeDelete && deletedTxCount > 0 
                  ? "The system has performed a total recall to prevent ledger imbalances."
                  : "Only the fuel log was removed. Financial records may still exist.",
              duration: 5000
          });

      } catch (e) {
          console.error("[FuelManagement] Deletion failure:", e);
          toast.error("Critical failure during atomic deletion. Some records may remain.");
      } finally {
          setIsSyncing(false);
          setDeleteLogConfirmationId(null);
      }
  };

  const handleDeleteExpense = useCallback((id: string) => {
      setDeleteConfirmationId(id);
      setCascadeDelete(true);
  }, []);

  const confirmDeleteExpense = async () => {
      if (!deleteConfirmationId) return;
      
      const txToDelete = transactions.find(t => t.id === deleteConfirmationId);
      if (!txToDelete) {
          setDeleteConfirmationId(null);
          return;
      }

      setIsSyncing(true);
      try {
          // 1. Bi-Directional Discovery (Step 3.1)
          // Find the parent fuel entry that likely spawned this transaction
          const parentEntry = await settlementService.getParentFuelEntry(txToDelete);
          
          let recordsToPurge: { entryId?: string, transactionIds: string[] } = {
              transactionIds: [deleteConfirmationId]
          };

          if (parentEntry && cascadeDelete) {
              // If we found a parent, we do a "Total Recall" of all its children
              const relatedTxs = await settlementService.getRelatedTransactions(parentEntry);
              recordsToPurge = {
                  entryId: parentEntry.id,
                  transactionIds: Array.from(new Set([...relatedTxs.map(t => t.id).filter(Boolean), deleteConfirmationId]))
              };
          }

          const txIds = recordsToPurge.transactionIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

          // Delete ledger rows first; if this fails we do not remove the fuel log (avoids dangling links).
          await Promise.all(txIds.map((tid) => api.deleteTransaction(tid)));

          if (recordsToPurge.entryId) {
              await fuelService.deleteFuelEntry(recordsToPurge.entryId);
          }

          // 3. Sync State
          if (recordsToPurge.entryId) {
              setLogs(prev => prev.filter(l => l.id !== recordsToPurge.entryId));
          }
          setTransactions(prev => prev.filter(t => !txIds.includes(t.id)));

          // 4. Recovery Context Feedback
          const detailsText = ` ($${Math.abs(txToDelete.amount).toFixed(2)})`;
          const count = txIds.length;
          
          toast.success(
            recordsToPurge.entryId && cascadeDelete 
              ? `Ledger records and linked fuel log purged${detailsText}` 
              : `Expense removed${detailsText}`,
            {
              description: recordsToPurge.entryId && cascadeDelete
                ? `Total of ${count} ledger records removed to prevent duplicate re-entry flags.`
                : "The individual record has been removed.",
              duration: 5000
            }
          );
      } catch (e) {
          console.error("[FuelManagement] Expense purge failure:", e);
          const detail = e instanceof Error ? e.message : String(e);
          toast.error("Delete failed", {
              description: detail,
              duration: 8000,
          });
      } finally {
          setIsSyncing(false);
          setDeleteConfirmationId(null);
      }
  };


  const handleSaveAdjustment = async (adj: MileageAdjustment) => {
      // Guard (Step 8): block adjustments dated inside an already-finalized week
      // for this vehicle. Without this, the frozen "Finalized" snapshot silently
      // desyncs from the live Reconciliation table (which always recomputes from
      // all adjustments regardless of finalization state), with no audit trail
      // and no re-finalize prompt.
      const adjDateYmd = adj.date.split('T')[0];
      const conflictingReport = finalizedReports.find(r =>
          r.vehicleId === adj.vehicleId &&
          adjDateYmd >= String(r.weekStart).split('T')[0] &&
          adjDateYmd <= String(r.weekEnd).split('T')[0]
      );
      if (conflictingReport) {
          const [y, m, d] = adjDateYmd.split('-').map(Number);
          toast.error("This week is already finalized", {
              description: `${format(new Date(y, m - 1, d), 'MMM d, yyyy')} falls inside a finalized statement for this vehicle. Re-finalize the week after saving this adjustment, or pick a different date.`,
              duration: 8000,
          });
          return;
      }

      try {
          const savedAdj = await fuelService.saveMileageAdjustment(adj);
          setAdjustments(prev => [...prev, savedAdj]);
          toast.success("Adjustment added");
          setIsAdjustmentModalOpen(false);
      } catch (e) {
          console.error(e);
          toast.error("Failed to save adjustment");
      }
  };

  const handleDisputeUpdated = (updated: FuelDispute) => {
      setDisputes(prev => prev.map(d => d.id === updated.id ? updated : d));
  };

  const handleCreateAdjustmentFromDispute = () => {
      if (!selectedDispute) return;
      setAdjustmentDefaults({
          vehicleId: selectedDispute.vehicleId,
          date: new Date(selectedDispute.weekStart)
      });
      setIsResolutionModalOpen(false);
      setIsAdjustmentModalOpen(true);
  };

  // Helper Lookups
  const getVehicleName = useCallback((id?: string) => {
      if (!id) return '';
      const v = vehicles.find(v => v.id === id);
      return v ? `${v.licensePlate} (${v.model})` : 'Unknown Vehicle';
  }, [vehicles]);

  const getDriverName = useCallback((id?: string) => {
      if (!id) return '';
      // Step 9.2: Correct Driver Lookup Utility - Search by both id and driverId for legacy/mismatch compatibility
      const d = drivers.find(d => d.id === id || d.driverId === id);
      return d ? d.name : 'Unknown Driver';
  }, [drivers]);

  const handleFinalize = async (reports: WeeklyFuelReport[]) => {
      try {
        setMessage('Checking settlement impact…');
        const reopenOk = await confirmSettlementReopen(reports);
        if (!reopenOk) {
          toast.message('Finalize cancelled — settlement left unchanged.');
          return false;
        }
      } catch (e: any) {
        console.error(e);
        toast.error(`Could not check settlement impact: ${e.message}`);
        return false;
      }

      const result = await runExclusive('Finalizing week…', async () => {
      try {
          setIsRefreshing(true);
          setMessage('Finalizing week…');

          const weekStart = String(reports[0]?.weekStart || '').split('T')[0];
          const weekEnd = String(reports[0]?.weekEnd || weekStart).split('T')[0];
          const spendEstimate = reports.reduce(
            (s, r) => s + (Number(r.totalGasCardCost) || 0),
            0,
          );

          // Ensure period + dual-approval BEFORE settlement (avoid orphan money)
          setMessage('Preparing period lock…');
          const periodRow = await api.ensureFuelReconciliationPeriod({
            weekStart,
            weekEnd,
          });
          let threshold = FUEL_SECOND_APPROVER_THRESHOLD;
          let uiMode: 'human' | 'service_only' = dualApprovalUiMode;
          try {
            const prefs = await api.getPreferences();
            threshold = resolveFuelSecondApproverThreshold(
              (prefs as any)?.fuelSecondApproverThreshold,
            );
            uiMode = resolveFuelDualApprovalUiMode((prefs as any)?.fuelDualApprovalUiMode);
          } catch {
            /* default */
          }
          if (needsHumanSecondApprover(spendEstimate, threshold, uiMode)) {
            const pack = await api.getFuelPeriodEvidencePack(periodRow.id);
            const actors = ((pack?.audit || []) as Array<{ action?: string; actor_id?: string }>)
              .filter((a) => a.action === 'second_approve')
              .map((a) => String(a.actor_id || ''));
            const { data: sessionData } = await supabase.auth.getSession();
            const me = sessionData?.session?.user?.id;
            if (!hasDistinctSecondApprove(actors, me)) {
              throw new Error(
                'A different admin must record second approval before this week can lock.',
              );
            }
          }

          const weekResult = await finalizeFuelWeekReports(
            reports,
            {
              vehicles,
              drivers,
              fuelCards: cards,
              fuelEntries: logs,
              scenarios,
              trips,
            },
            {
              onProgress: (msg) => setMessage(msg),
              deferSnapshotPersist: true,
            },
          );

          if (weekResult.snapshotCount === 0) {
            toast.info(weekResult.message || 'No pending items found to finalize.');
            return false;
          }

          setMessage('Locking period on server…');
          const totalSpend = (weekResult.snapshots || []).reduce(
            (s, r) => s + (Number(r.totalGasCardCost) || 0),
            0,
          );
          const jobRes = await api.enqueueFuelPeriodFinalize({
            periodId: periodRow.id,
            version: periodRow.version || 1,
            idempotencyKey: fuelPeriodFinalizeIdempotencyKey(
              periodRow.id,
              periodRow.version || 1,
            ),
            snapshots: weekResult.snapshots || [],
            totalSpend,
            secondApproverThreshold: threshold,
          });
          const jobInterp = interpretFuelFinalizeJobResult(jobRes);
          if (jobInterp.incomplete) {
            toast.warning(jobInterp.toastMessage);
            await queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });
            return false;
          }

          await queryClient.invalidateQueries({ queryKey: ['finalizedReports'] });
          await queryClient.invalidateQueries({ queryKey: ['driverFinancialPeriods'] });
          await queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });

          if (weekResult.failures?.length) {
            toast.warning(
              `Finalize finished with issues — ${weekResult.snapshotCount} prepared, ${weekResult.failures.length} client build failed.`,
            );
          } else if (weekResult.successCount > 0) {
              toast.success(`Week locked — ${weekResult.successCount} statement(s) posted. This period is now Completed.`);
          } else {
              toast.success(`Week locked — ${weekResult.snapshotCount} snapshot(s) saved. This period is now Completed.`);
          }

          return true;
      } catch (e: any) {
          console.error(e);
          toast.error(`Finalization failed: ${e.message}`);
          return false;
      } finally {
          setIsRefreshing(false);
      }
      });
      if (result === undefined) {
        toast.message('Another action is still running — try again when it finishes.');
        return false;
      }
      return result;
  };

  // Determine Page Title and Description based on activeTab
  let pageTitle = "Fleet Integrity Management";
  let pageDescription = "Audit fleet integrity, reconcile fuel consumption, and manage gas cards.";

  if (activeTab === 'reconciliation') {
      pageTitle = "Consumption Reconciliation";
      pageDescription = "Close each Monday–Sunday week, step by step.";
  } else if (activeTab === 'reimbursements') {
      pageTitle = "Review Queue";
      pageDescription = "Open work only — posted fill-ups are in Transaction Logs.";
  } else if (activeTab === 'cards') {
      pageTitle = "Card Inventory";
      pageDescription = "Manage gas cards and their assignments.";
  } else if (activeTab === 'logs') {
      pageTitle = "Transaction Logs";
      pageDescription = "Posted fuel fill-ups. Odometer column shows current km; Δ Prev shows change from last fill.";
  } else if (activeTab === 'configuration') {
      pageTitle = "Fleet Policy Configuration";
      pageDescription = "Manage company and driver expense splits for fuel.";
  }

  return (
    <FuelLayout 
        title={pageTitle}
        description={pageDescription}
        onAddTransaction={(activeTab === 'configuration' || activeTab === 'cards' || activeTab === 'reconciliation') ? undefined : () => {
            setEditingLog(null);
            setIsLogModalOpen(true);
        }}
    >
      {(activeTab !== 'configuration' && activeTab !== 'cards') && (
        <div className="flex justify-end items-center gap-3 mb-4">
            {isSyncing && (
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    SYNCING CROSS-DOMAIN...
                </div>
            )}
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                    void loadData();
                    void loadLogsAndTransactions();
                }} 
                disabled={isRefreshing}
                className="text-slate-600 border-slate-200"
            >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
        </div>
      )}

      {activeTab === 'reimbursements' && (
          <FuelReimbursementTable 
              transactions={transactions}
              logs={logs}
              onApprove={handleApproveReimbursement}
              onReject={handleRejectReimbursement}
              onRequestSubmit={() => { setEditingExpense(null); setIsSubmitExpenseModalOpen(true); }}
              onEdit={handleEditExpense}
              onDelete={handleDeleteExpense}
              onViewDriverLedger={onViewDriverLedger}
              onApproveLogReview={handleApproveLogReview}
              dateRange={reimbursementDateRange}
              onDateRangeChange={setReimbursementDateRange}
              isRefreshing={isRefreshing}
              onViewInTransactionLogs={({ fuelEntryId, date, vehicleId }) => {
                  setActiveTab('logs');
                  onTabChange?.('logs');
                  if (fuelEntryId) {
                      // Soft highlight via session — Logs table can pick up later; refresh ensures row exists
                      sessionStorage.setItem('fuel_logs_focus_entry', fuelEntryId);
                  } else if (date || vehicleId) {
                      sessionStorage.setItem(
                          'fuel_logs_focus_entry',
                          JSON.stringify({ date, vehicleId }),
                      );
                  }
                  void loadData(true);
                  toast.info('Opening Transaction Logs…');
              }}
          />
      )}

      {activeTab === 'reconciliation' && (
        <FuelReconciliationDashboard
          outstanding={outstandingFuelPeriods}
          inProgress={inProgressFuelPeriods}
          completed={completedFuelPeriods}
          loading={reconLandingLoading}
          periodsLoadError={serverPeriodsError}
          vehicles={vehicles}
          trips={trips}
          fuelEntries={logs}
          adjustments={adjustments}
          disputes={disputes}
          scenarios={scenarios}
          drivers={drivers}
          fuelCards={cards}
          finalizedReports={finalizedReports}
          isRefreshing={isRefreshing}
          dataTruncated={fuelDataTruncated}
          secondApproverThreshold={secondApproverThreshold}
          autoCloseDualApprovalMode={autoCloseDualApprovalMode}
          onRefresh={() => loadData(true)}
          onFinalize={handleFinalize}
          onAddAdjustment={() => { setAdjustmentDefaults({}); setIsAdjustmentModalOpen(true); }}
          onResolveDispute={(dispute) => { setSelectedDispute(dispute); setIsResolutionModalOpen(true); }}
          onOpenConfiguration={() => { setActiveTab('configuration'); onTabChange?.('configuration'); }}
          onOpenTransactionLogs={({ fuelEntryId, date, vehicleId }) => {
            setActiveTab('logs');
            onTabChange?.('logs');
            if (fuelEntryId) {
              sessionStorage.setItem('fuel_logs_focus_entry', fuelEntryId);
            } else if (date || vehicleId) {
              sessionStorage.setItem(
                'fuel_logs_focus_entry',
                JSON.stringify({ date, vehicleId }),
              );
            }
            void loadData(true);
            toast.info('Opening Transaction Logs…');
          }}
          onAcceptFuelException={async (entryId, note) => {
            const entry = logs.find((l) => l.id === entryId);
            if (!entry) {
              toast.error('Could not find that fill to resolve.');
              return false;
            }
            const priorTier = entry.metadata?.signalTier;
            const updated: FuelEntry = {
              ...entry,
              correctionReason: note?.trim() || 'Fuel exception acknowledged',
              metadata: {
                ...entry.metadata,
                priorSignalTier: priorTier,
                signalTier: 'observe',
                reconExceptionAck: true,
                exceptionResolvedAt: new Date().toISOString(),
                exceptionResolveAction: 'accepted',
                exceptionResolveNote: note || undefined,
                auditStatus: 'Clear',
              },
            };
            try {
              const saved = await fuelService.saveFuelEntry(updated);
              // Keep ack locally even if remote stamp rewrites signalTier until edge redeploy.
              const merged: FuelEntry = {
                ...updated,
                ...(saved && typeof saved === 'object' ? saved : {}),
                metadata: {
                  ...(saved?.metadata || updated.metadata),
                  reconExceptionAck: true,
                  exceptionResolvedAt:
                    saved?.metadata?.exceptionResolvedAt ||
                    updated.metadata?.exceptionResolvedAt,
                  exceptionResolveAction: 'accepted',
                  exceptionResolveNote: note || undefined,
                  signalTier: 'observe',
                },
              };
              setLogs((prev) => prev.map((l) => (l.id === entryId ? merged : l)));
              toast.success('Exception accepted — Finalize is unlocked for this fill.');
              return true;
            } catch (e: any) {
              console.error('[FuelManagement] accept exception failed', e);
              toast.error(e?.message || 'Failed to accept exception');
              return false;
            }
          }}
          onEditFuelEntry={(entryId) => {
            const entry = logs.find((l) => l.id === entryId);
            if (!entry) {
              toast.error('Could not find that fill to edit.');
              return;
            }
            setEditingLog(entry);
            setIsLogModalOpen(true);
          }}
          onSelectPeriodWeek={(period) => {
            handleReconciliationPeriodSelect({
              startDate: period.startDate,
              endDate: period.endDate,
              label: period.label,
            } as any);
          }}
        />
      )}

      {activeTab === 'cards' && (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="space-y-1 text-sm text-slate-500">
                  {selfServePrograms.length === 0
                    ? 'Statement CSV for Roam Fuels cards is uploaded by Roam.'
                    : 'Self-serve fuel cards: add your cards and upload your own statement CSV in Imports.'}
                </div>
                <Button
                  onClick={() => {
                    setEditingCard(null);
                    setIsCardModalOpen(true);
                  }}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Card
                </Button>
            </div>
            
            <FuelCardList 
                cards={cards}
                loading={cardsLoading}
                loadError={cardsLoadError}
                drivers={drivers}
                onEdit={(card) => { setEditingCard(card); setIsCardModalOpen(true); }}
                onAssignDriver={(card) => setAssigningCard(card)}
                onDelete={handleDeleteCard}
                isRoamManaged={isRoamManagedCard}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
            />
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
            <FuelLogTable 
                entries={logs}
                transactions={transactions}
                vehicles={vehicles}
                onEdit={(log) => { setEditingLog(log); setIsLogModalOpen(true); }}
                onDelete={handleDeleteLog}
                getVehicleName={getVehicleName}
                getDriverName={getDriverName}
                dateRange={logDateRange}
                onDateRangeChange={setLogDateRange}
                dataTruncated={fuelDataTruncated}
                transactionsTruncated={transactionsTruncated}
                isLoading={!fuelLogsHydrated}
                loadError={fuelLogsLoadError}
                onRefresh={refreshLogs}
            />
        </div>
      )}

      {activeTab === 'configuration' && (
          <FuelConfiguration
            scenarios={scenarios}
            onScenariosChange={setScenarios}
          />
      )}

      {/* Modals - Conditionally rendered to prevent mount-time effect cascades */}
      {isCardModalOpen && (
      <FuelCardModal 
            isOpen={isCardModalOpen}
            onClose={() => { setIsCardModalOpen(false); setEditingCard(null); }}
            onSave={handleSaveCard}
            initialData={editingCard}
            vehicles={vehicles}
            drivers={drivers}
            selfServePrograms={selfServePrograms.map((p) => ({
              companyCode: p.companyCode,
              displayName: p.displayName,
            }))}
            lockIdentity={false}
      />
      )}

      {assigningCard && (
        <FuelCardAssignModal
          isOpen={!!assigningCard}
          onClose={() => setAssigningCard(null)}
          onSave={handleSaveCard}
          card={assigningCard}
          drivers={drivers}
          vehicles={vehicles}
        />
      )}

      {isLogModalOpen && (
      <FuelLogModal 
            isOpen={isLogModalOpen}
            onClose={() => { setIsLogModalOpen(false); setEditingLog(null); }}
            onSave={handleSaveLog}
            initialData={editingLog}
            vehicles={vehicles}
            drivers={drivers}
            cards={cards}
            isRoamManagedCard={isRoamManagedCard}
      />
      )}


      {isAdjustmentModalOpen && (
      <MileageAdjustmentModal 
            isOpen={isAdjustmentModalOpen}
            onClose={() => setIsAdjustmentModalOpen(false)}
            onSave={handleSaveAdjustment}
            vehicles={vehicles}
            initialVehicleId={adjustmentDefaults.vehicleId}
            initialDate={adjustmentDefaults.date}
      />
      )}

      {isResolutionModalOpen && (
      <DisputeResolutionModal 
            isOpen={isResolutionModalOpen}
            onClose={() => { setIsResolutionModalOpen(false); setSelectedDispute(null); }}
            dispute={selectedDispute}
            onSave={handleDisputeUpdated}
            onCreateAdjustment={handleCreateAdjustmentFromDispute}
      />
      )}

      {isSubmitExpenseModalOpen && (
      <SubmitExpenseModal 
            isOpen={isSubmitExpenseModalOpen}
            onClose={() => { setIsSubmitExpenseModalOpen(false); setEditingExpense(null); }}
            onSave={handleSaveExpense}
            drivers={drivers}
            vehicles={vehicles}
            initialData={editingExpense}
      />
      )}

      <AlertDialog open={!!deleteConfirmationId} onOpenChange={(open) => !open && setDeleteConfirmationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reimbursement Request?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This action cannot be undone. This will permanently delete the expense record from the financial ledger.</p>
                
                {logs.some(l => l.transactionId === deleteConfirmationId) && (
                  <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-100 rounded-lg mt-2">
                    <Checkbox 
                      id="cascade-log" 
                      checked={cascadeDelete} 
                      onCheckedChange={(checked) => setCascadeDelete(!!checked)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="cascade-log" className="text-sm font-bold text-amber-900 cursor-pointer">
                        Delete linked fuel log entry as well
                      </Label>
                      <p className="text-xs text-amber-700">
                        If checked, the physical fuel consumption record used for mileage auditing will also be removed.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteExpense} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settlementReopenDialog}

      <AlertDialog open={!!deleteLogConfirmationId} onOpenChange={(open) => !open && setDeleteLogConfirmationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fuel Log Entry?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will remove the fuel consumption record from the audit timeline. This may affect "Stop-to-Stop" calculations for this vehicle.</p>
                
                {logs.find(l => l.id === deleteLogConfirmationId)?.transactionId && (
                  <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-100 rounded-lg mt-2">
                    <Checkbox 
                      id="cascade-expense" 
                      checked={cascadeDelete} 
                      onCheckedChange={(checked) => setCascadeDelete(!!checked)}
                      className="mt-1"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="cascade-expense" className="text-sm font-bold text-amber-900 cursor-pointer">
                        Void linked reimbursement request
                      </Label>
                      <p className="text-xs text-amber-700">
                        If checked, the pending payment request in the "Reimbursements" tab will also be deleted.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLog} className="bg-red-600 hover:bg-red-700">
              Delete Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase 3: Odometer Bucket Sheet — widened for Timeline + Trip Manifest drill-down */}
      <Sheet open={isBucketSheetOpen} onOpenChange={setIsBucketSheetOpen}>
        <SheetContent className="sm:max-w-[1100px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Stop-to-Stop Reconciliation
            </SheetTitle>
            <SheetDescription>
              Detailed odometer-anchored analysis for {selectedBucketVehicle?.licensePlate} ({selectedBucketVehicle?.model}). Use Explain gap to open the Unified Timeline for a stop-to-stop window.
            </SheetDescription>
          </SheetHeader>

          {selectedBucketVehicle && (
            <BucketReconciliationView
              vehicle={selectedBucketVehicle}
              fuelEntries={logs}
              trips={trips}
              transactions={transactions}
              adjustments={adjustments}
              dateRange={reconciliationDateRange}
              onClose={() => setIsBucketSheetOpen(false)}
              onRefresh={() => loadData(true)}
            />
          )}
        </SheetContent>
      </Sheet>

    </FuelLayout>
  );
}