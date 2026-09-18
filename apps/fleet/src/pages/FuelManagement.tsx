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
import { FuelIntegrityDesk, type FuelIntegritySubtab } from '../components/fuel/integrity/FuelIntegrityDesk';
import { BucketReconciliationView } from '../components/fuel/BucketReconciliationView';
import { MileageAdjustmentModal } from '../components/fuel/MileageAdjustmentModal';
import { AddFuelChoiceDialog } from '../components/fuel/AddFuelChoiceDialog';
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
import { useFleetTimezone, ymdToLocalDate } from '../utils/timezoneDisplay';
import { type PeriodWeekOption } from '../utils/periodWeekOptions';
import { format } from 'date-fns';
import { DisputeResolutionModal } from '../components/fuel/DisputeResolutionModal';
import { FuelReimbursementTable } from '../components/fuel/FuelReimbursementTable';
import { SubmitExpenseModal } from '../components/fuel/SubmitExpenseModal';
import { usePermissions } from '../hooks/usePermissions';
import { useInvalidateFuelReviewQueueCounts } from '../hooks/useFuelReviewQueueCounts';
import { fuelReviewQueueLookbackRange, FUEL_REVIEW_QUEUE_TX_PAGE_SIZE, FUEL_REVIEW_QUEUE_TX_MAX_PAGES } from '../utils/fuelReviewQueueLookback';
import { fuelService } from '../services/fuelService';
import { settlementService } from '../services/settlementService';
import { finalizeFuelWeekReports } from '../services/fuelFinalizeService';
import { purgeFuelExpense, saveFuelExpense } from '../services/fuelExpenseMutationService';
import { FuelDisputeService } from '../services/fuelDisputeService';
import { api } from '../services/api';
import { FuelReconciliationDashboard } from '../components/fuel/reconciliation/FuelReconciliationDashboard';
import { useFuelSettlementReopenGate } from '../components/fuel/reconciliation/useFuelSettlementReopenGate';
import { useFuelForceClientMoneyDialog } from '../components/fuel/reconciliation/useFuelForceClientMoneyDialog';
import { deriveFuelReconciliationPeriods, enrichLandingPeriodsWithFlagCounts } from '../utils/fuelPeriodStatus';
import { listFuelLeakageReviewedWeeks } from '../utils/fuelLeakageReviewStore';
import { fetchTripsForFuelWeekPaged } from '../utils/fetchTripsForFuelWeek';
import { useFuelPeriods, FUEL_PERIODS_KEY } from '../hooks/useFuelPeriods';
import {
  mergeServerFirstLandingPeriods,
  serverLeakageReviewedWeekStarts,
  serverLockedWeekStarts,
  weekStartYmd,
} from '../utils/fuelPeriodServerMerge';
import { parseDataQualityVehicleReviews, reviewedVehicleIdSet } from '../utils/fuelDataQualityReview';
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
import {
  buildFuelFlagDeskRows,
  isFuelFillFlagWeekCleared,
  resolveOpenFlagCodeForAccept,
  listOpenFlagCodesForEntry,
  classifyFuelFillFlags,
} from '../utils/fuelFillFlagClassify';
import { buildStationMedianOutlierIdSet } from '../utils/fuelAnalyticsAggregates';
import {
  dispositionMapFromRows,
  upsertDispositionIntoMap,
} from '../utils/fuelFlagDisposition';
import { shouldCreateUnverifiedVendor } from '../utils/fuelUnverifiedVendorGate';
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
  /** When true, omit FuelLayout H1 — Week Reconciliation hub owns chrome. */
  embedded?: boolean;
  /** Monday week start (yyyy-MM-dd) from Close Week Review / deep link. */
  initialWeekStart?: string;
}) {
  return (
    <FuelReconBusyProvider>
      <FuelManagementInner {...props} />
    </FuelReconBusyProvider>
  );
}

function FuelManagementInner({
  defaultTab = 'logs',
  onViewDriverLedger,
  onTabChange,
  embedded = false,
  initialWeekStart,
}: {
  defaultTab?: string;
  onViewDriverLedger?: (driverId: string) => void;
  onTabChange?: (tab: string) => void;
  embedded?: boolean;
  initialWeekStart?: string;
}) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const invalidateReviewQueueCounts = useInvalidateFuelReviewQueueCounts();
  const { runExclusive, setMessage } = useFuelReconBusy();
  const { confirmIfNeeded: confirmSettlementReopen, dialog: settlementReopenDialog } =
    useFuelSettlementReopenGate();
  const { confirmIfMismatch: confirmForceClientMoney, dialog: forceClientMoneyDialog } =
    useFuelForceClientMoneyDialog();
  const [activeTab, setActiveTab] = useState(
    defaultTab === 'flags' ? 'integrity' : defaultTab,
  );
  const lastFuelDataLoadAtRef = useRef(0);

  useEffect(() => {
    setActiveTab(defaultTab === 'flags' ? 'integrity' : defaultTab);
  }, [defaultTab]);

  const [integritySubtab, setIntegritySubtab] = useState<FuelIntegritySubtab>('fill-flags');
  const [integrityPreferredVehicleId, setIntegrityPreferredVehicleId] = useState<string | null>(
    null,
  );
  const [integrityTripsLoading, setIntegrityTripsLoading] = useState(false);

  const fleetTz = useFleetTimezone();

  // Shared active fuel week (Mon–Sun) — Logs / Recon / Reimbursements default from this.
  // Logs may temporarily diverge via allowCustomRange; recon week change resets logs override.
  const [activeFuelWeek, setActiveFuelWeek] = useState<DateRange | undefined>(() => {
    const hint = String(initialWeekStart || '').split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) {
      const from = ymdToLocalDate(hint);
      const to = ymdToLocalDate(hint);
      to.setDate(to.getDate() + 6);
      return { from, to };
    }
    const range = currentFuelWeekRange();
    return { from: range.from, to: range.to };
  });
  const [logCustomOverride, setLogCustomOverride] = useState(false);
  const [logDateRangeOverride, setLogDateRangeOverride] = useState<DateRange | undefined>(undefined);

  // Close Week / hub deep-link — apply Monday week when hint arrives or changes
  useEffect(() => {
    const hint = String(initialWeekStart || '').split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hint)) return;
    const from = ymdToLocalDate(hint);
    const to = ymdToLocalDate(hint);
    to.setDate(to.getDate() + 6);
    setLogCustomOverride(false);
    setLogDateRangeOverride(undefined);
    setActiveFuelWeek({ from, to });
  }, [initialWeekStart]);

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
  const [flagDispositions, setFlagDispositions] = useState<
    import('../utils/fuelFlagDisposition').FuelFlagDispositionMap
  >(() => new Map());
  const [flagDispositionsTruncated, setFlagDispositionsTruncated] = useState(false);
  const [fuelDataTruncated, setFuelDataTruncated] = useState(false);
  const [transactionsTruncated, setTransactionsTruncated] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<FuelEntry | null>(null);
  /** When Edit is opened from Flags desk — write `corrected` on save for these codes (R-3). */
  const [deskEditOpenCodes, setDeskEditOpenCodes] = useState<{
    entryId: string;
    codes: string[];
  } | null>(null);
  const [isAddFuelChoiceOpen, setIsAddFuelChoiceOpen] = useState(false);

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
    // Flags desk needs lock status; recon also needs periods after recompute.
    enabled:
      Boolean(landingPeriodRange.from && landingPeriodRange.to) &&
      (activeTab === 'integrity' ||
        (activeTab === 'reconciliation' && periodsQueryReady)),
  });

  // P-3: when SQL covers every week option, land server-only (no browser derive).
  const fuelReconPeriods = useMemo(() => {
    const serverByWeek = new Map(
      serverFuelPeriods.map((r) => [weekStartYmd(r.weekStart), r] as const),
    );
    const leakageReviewedWeeks = serverLeakageReviewedWeekStarts(serverFuelPeriods);
    for (const w of listFuelLeakageReviewedWeeks()) {
      if (!serverByWeek.has(w)) leakageReviewedWeeks.add(w);
    }
    const dataQualityReviewedByWeek = new Map<string, Set<string>>();
    for (const r of serverFuelPeriods) {
      const wk = weekStartYmd(r.weekStart);
      const ids = reviewedVehicleIdSet(
        parseDataQualityVehicleReviews(r.dataQualityVehicleReviews),
      );
      if (ids.size) dataQualityReviewedByWeek.set(wk, ids);
    }
    const needDeriveGaps = reconciliationWeekOptions.some(
      (w) => !serverByWeek.has(w.startDate),
    );
    if (!needDeriveGaps) {
      return enrichLandingPeriodsWithFlagCounts(
        mergeServerFirstLandingPeriods(serverFuelPeriods, []),
        logs,
        flagDispositions,
      );
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
            lockedWeekStarts: serverLockedWeekStarts(serverFuelPeriods),
            dataQualityReviewedByWeek,
            dispositions: flagDispositions,
          }).filter((d) => !serverByWeek.has(d.startDate))
        : [];
    return enrichLandingPeriodsWithFlagCounts(
      mergeServerFirstLandingPeriods(serverFuelPeriods, derived),
      logs,
      flagDispositions,
    );
  }, [
    reconciliationWeekOptions,
    vehicles,
    logs,
    disputes,
    finalizedReports,
    scenarios,
    serverFuelPeriods,
    flagDispositions,
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

  const flagsPeriodOptions = useMemo(() => {
    const lockedByWeek = new Map(
      serverFuelPeriods.map((r) => [
        weekStartYmd(r.weekStart),
        isFuelFillFlagWeekCleared(r),
      ] as const),
    );
    return reconciliationWeekOptions.map((w) => ({
      weekStart: w.startDate,
      weekEnd: w.endDate,
      label: w.label,
      locked: lockedByWeek.get(w.startDate) === true,
    }));
  }, [reconciliationWeekOptions, serverFuelPeriods]);

  const [flagsWeekStart, setFlagsWeekStart] = useState<string | null>(null);
  const flagsSelectedWeekStart =
    flagsWeekStart || reconciliationPeriodStart || flagsPeriodOptions[0]?.weekStart || null;

  useEffect(() => {
    if (!flagsWeekStart && flagsPeriodOptions[0]?.weekStart) {
      setFlagsWeekStart(reconciliationPeriodStart || flagsPeriodOptions[0].weekStart);
    }
  }, [flagsPeriodOptions, reconciliationPeriodStart, flagsWeekStart]);

  const flagsDeskRows = useMemo(() => {
    if (!flagsSelectedWeekStart) return [];
    const opt = flagsPeriodOptions.find((p) => p.weekStart === flagsSelectedWeekStart);
    const weekEnd = opt?.weekEnd || reconciliationPeriodEnd || flagsSelectedWeekStart;
    const weekLocked = Boolean(opt?.locked);
    const outlierIds = buildStationMedianOutlierIdSet(
      logs,
      weekEnd,
      undefined,
      flagsSelectedWeekStart,
      weekEnd,
    );
    const plateByVehicleId = new Map<string, string>();
    for (const v of vehicles as Vehicle[]) {
      if (v?.id) {
        plateByVehicleId.set(
          v.id,
          (v as { licensePlate?: string }).licensePlate || v.id.slice(0, 8),
        );
      }
    }
    const driverNameById = new Map<string, string>();
    for (const d of drivers as Array<{
      id?: string;
      driverId?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
    }>) {
      const id = d.id || d.driverId;
      if (!id) continue;
      const name =
        d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown driver';
      driverNameById.set(id, name);
    }
    return buildFuelFlagDeskRows(logs, {
      weekStartYmd: flagsSelectedWeekStart,
      weekEndYmd: weekEnd,
      weekLocked,
      outlierEntryIds: outlierIds,
      dispositions: flagDispositions,
      plateByVehicleId,
      driverNameById,
    });
  }, [
    flagsSelectedWeekStart,
    flagsPeriodOptions,
    reconciliationPeriodEnd,
    logs,
    vehicles,
    drivers,
    flagDispositions,
  ]);

  // Hydrate dispositions scoped to the active week’s entry IDs (R-2 — never org-wide clip).
  useEffect(() => {
    if (activeTab !== 'integrity' && activeTab !== 'reconciliation') return;
    let cancelled = false;
    const weekStart =
      activeTab === 'reconciliation'
        ? reconciliationPeriodStart
        : flagsSelectedWeekStart;
    const weekEndOpt =
      activeTab === 'reconciliation'
        ? reconciliationPeriodEnd
        : flagsPeriodOptions.find((p) => p.weekStart === flagsSelectedWeekStart)?.weekEnd ||
          reconciliationPeriodEnd ||
          flagsSelectedWeekStart;
    if (!weekStart || !weekEndOpt) return;
    const entryIds = logs
      .filter((e) => {
        const d = toEntryYmd(e.date);
        return d >= weekStart && d <= weekEndOpt;
      })
      .map((e) => e.id)
      .filter(Boolean);
    if (entryIds.length === 0) {
      setFlagDispositions(new Map());
      setFlagDispositionsTruncated(false);
      return;
    }
    void api
      .listFuelFlagDispositions({ entryIds })
      .then((res) => {
        if (cancelled) return;
        setFlagDispositions(dispositionMapFromRows(res.dispositions));
        setFlagDispositionsTruncated(Boolean(res.truncated));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    flagsSelectedWeekStart,
    flagsPeriodOptions,
    reconciliationPeriodStart,
    reconciliationPeriodEnd,
    logs,
  ]);

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

  // P-9: defer trips until bucket sheet opens — landing must not wait on trip waterfall.
  // Wizard / finalize fetch trips via buildFuelWeekReportsWithGating when needed.
  useEffect(() => {
    if (activeTab !== 'reconciliation' || !periodsQueryReady || !isBucketSheetOpen) return;
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
        }
    };
    fetchTripsForRange();
  }, [activeTab, periodsQueryReady, reconciliationDateRange, isBucketSheetOpen]);

  const integrityDateRange = useMemo((): DateRange | undefined => {
    if (!flagsSelectedWeekStart) return undefined;
    const opt = flagsPeriodOptions.find((p) => p.weekStart === flagsSelectedWeekStart);
    const weekEnd = opt?.weekEnd || flagsSelectedWeekStart;
    return {
      from: ymdToLocalDate(flagsSelectedWeekStart),
      to: ymdToLocalDate(weekEnd),
    };
  }, [flagsSelectedWeekStart, flagsPeriodOptions]);

  // Integrity Stop-to-stop tab needs trips for the selected week (same fetch as bucket sheet).
  useEffect(() => {
    if (activeTab !== 'integrity' || integritySubtab !== 'stop-to-stop') return;
    if (!flagsSelectedWeekStart) return;
    let cancelled = false;
    const run = async () => {
      setIntegrityTripsLoading(true);
      try {
        const opt = flagsPeriodOptions.find((p) => p.weekStart === flagsSelectedWeekStart);
        const weekEnd =
          opt?.weekEnd || reconciliationPeriodEnd || flagsSelectedWeekStart;
        const { trips: weekTrips, tripsTruncated } = await fetchTripsForFuelWeekPaged(
          flagsSelectedWeekStart,
          weekEnd,
        );
        if (cancelled) return;
        setTrips(weekTrips);
        if (tripsTruncated) setFuelDataTruncated(true);
      } catch (e) {
        console.error('Failed to fetch trips for integrity stop-to-stop', e);
      } finally {
        if (!cancelled) setIntegrityTripsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    integritySubtab,
    flagsSelectedWeekStart,
    flagsPeriodOptions,
    reconciliationPeriodEnd,
  ]);

  const loadLogsAndTransactions = useCallback(async () => {
    const { startDate, endDate } = fuelFetchWindow;
    // R6: Review Queue backlog is not week-bounded — same lookback as the nav badge.
    const txRange =
      activeTab === 'reimbursements' ? fuelReviewQueueLookbackRange() : { startDate, endDate };
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
        api.getAllTransactionsInRange({
          startDate: txRange.startDate,
          endDate: txRange.endDate,
          ...(activeTab === 'reimbursements'
            ? {
                pageSize: FUEL_REVIEW_QUEUE_TX_PAGE_SIZE,
                maxPages: FUEL_REVIEW_QUEUE_TX_MAX_PAGES,
              }
            : {}),
        }).catch((err) => {
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
  }, [fuelFetchWindow, activeTab]);

  useEffect(() => {
    void loadLogsAndTransactions();
  }, [loadLogsAndTransactions]);

  // Silent refresh when switching to Logs / Review / Flags if data is stale (>30s)
  useEffect(() => {
    if (activeTab !== 'logs' && activeTab !== 'reimbursements' && activeTab !== 'integrity') return;
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
        (activeTab === 'logs' || activeTab === 'reimbursements' || activeTab === 'integrity'
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

          // Recon/config need scenarios/disputes — finalized + activity-bounds are deferred
          // until after periods arm so they do not join the mount HTTP/1.1 storm (ROAM-FLEET-10).
          const scenariosP = fuelService.getFuelScenarios().catch(() => []);
          const adjsP = fuelService.getMileageAdjustments().catch(() => []);
          const disputesP = FuelDisputeService.getAllDisputes().catch(() => []);

          if (scope === 'recon') {
              // C-6: cards are required for fill→driver attribution on the recon path.
              const cardsP = fuelService.getFuelCards().then(
                  (data) => data,
                  (err) => {
                      console.error('[FuelManagement] getFuelCards failed (recon)', err);
                      throw err;
                  },
              );
              try {
                  const [vData, dData, scenariosData, adjsData, disputesData, cardsData] =
                      await Promise.all([
                          vehiclesP,
                          driversP,
                          scenariosP,
                          adjsP,
                          disputesP,
                          cardsP,
                      ]);
                  setVehicles(vData);
                  setDrivers(dData);
                  setScenarios(scenariosData);
                  setAdjustments(adjsData);
                  setDisputes(disputesData);
                  setCards(cardsData);
                  setCardsLoadError(null);
              } catch (cardErr: any) {
                  console.error('[FuelManagement] Recon load failed', cardErr);
                  // Still load non-card recon data so the landing is usable.
                  const [vData, dData, scenariosData, adjsData, disputesData] =
                      await Promise.all([
                          vehiclesP,
                          driversP,
                          scenariosP,
                          adjsP,
                          disputesP,
                      ]);
                  setVehicles(vData);
                  setDrivers(dData);
                  setScenarios(scenariosData);
                  setAdjustments(adjsData);
                  setDisputes(disputesData);
                  setCardsLoadError(cardErr?.message || 'Failed to load cards');
              }
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

          const [scenariosData, adjsData, disputesData] =
              await Promise.all([scenariosP, adjsP, disputesP]);

          setScenarios(scenariosData);
          setAdjustments(adjsData);
          setDisputes(disputesData);
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
  }, [activeTab]);

  // Sequential post-paint: activity-bounds → one finalized-reports call (ROAM-FLEET-10).
  // Never parallel with recompute/periods/trips/logs on recon mount.
  useEffect(() => {
    if (activeTab === 'logs' || activeTab === 'reimbursements' || activeTab === 'integrity') return;
    if (activeTab === 'reconciliation' && !periodsQueryReady) return;
    let cancelled = false;
    const delayMs = activeTab === 'reconciliation' ? 900 : 200;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const bounds = await fuelService.getFuelActivityBounds().catch(() => ({
            minDate: null as string | null,
          }));
          if (cancelled) return;
          const minDate = bounds.minDate;
          if (minDate) {
            setActivityMinDate((prev) => (prev === minDate ? prev : minDate));
          }
          const weekStartFrom = minDate || fuelFetchWindow.startDate;
          const data = await api
            .getFinalizedReports({
              weekStartFrom,
              weekStartTo: fuelFetchWindow.endDate,
            })
            .catch(() => []);
          if (!cancelled) setFinalizedReports(Array.isArray(data) ? data : []);
        } catch {
          /* non-blocking */
        }
      })();
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, periodsQueryReady, fuelFetchWindow.startDate, fuelFetchWindow.endDate]);

  // Tab-scoped bootstrap — logs/flags stay light; recon loads cards (C-6); cards tab loads full bundle.
  useEffect(() => {
    if (activeTab === 'logs' || activeTab === 'reimbursements' || activeTab === 'integrity') {
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
  type GasCardAnchorSave = { _saveAsGasCardAnchor: true; fuelEntry: FuelEntry };
  const isGasCardAnchorSave = (
    v: FuelEntry | FuelEntry[] | GasCardAnchorSave,
  ): v is GasCardAnchorSave =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    '_saveAsGasCardAnchor' in v &&
    (v as GasCardAnchorSave)._saveAsGasCardAnchor === true;

  const handleSaveLog = async (entryOrEntries: FuelEntry | FuelEntry[] | GasCardAnchorSave) => {
      setIsSyncing(true);
      try {
          // Narrow once: array → gas-card anchor → single FuelEntry (§12 / R5 handleSaveLog).
          if (Array.isArray(entryOrEntries)) {
              // Bulk Mode
              const promises = entryOrEntries.map(entry => fuelService.saveFuelEntry(entry));
              const savedLogs = await Promise.all(promises);
              
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
                 (No getFuelScenarios fetch — R6-2; that call had no consumers.)
              */
              
              // Phase 7: Bulk vendor creation for entries without GPS/verified stations (R6-1).
              const vendorCreationPromises = savedLogs
                  .filter((log) => shouldCreateUnverifiedVendor(log))
                  .map((log) => {
                      const vendorName = String(log.location).trim();
                      return api.createUnverifiedVendor({
                          transactionId: log.transactionId!,
                          vendorName,
                          sourceType: 'no_gps'
                      }).catch(err => {
                          console.warn(`[Vendor Gate] Failed to create vendor for ${vendorName}:`, err);
                          return null;
                      });
                  });
              
              if (vendorCreationPromises.length > 0) {
                  await Promise.all(vendorCreationPromises);
                  console.log(`[Vendor Gate] Created ${vendorCreationPromises.length} unverified vendors from bulk entry`);
              }
              
              setLogs(prev => [...savedLogs, ...prev]);
              toast.success(`Successfully recorded ${savedLogs.length} transactions (Pending Reconciliation)`);
          } else if (isGasCardAnchorSave(entryOrEntries)) {
              // Gas Card Known fill = odometer anchor only (same as Submit Expense Gas Card)
              const saved = await fuelService.saveFuelEntry(entryOrEntries.fuelEntry);
              const softDupId = (saved as FuelEntry & { softDuplicateOf?: string }).softDuplicateOf;
              if (
                  softDupId ||
                  (saved.id !== entryOrEntries.fuelEntry.id &&
                      String(saved.paymentSource || '') !== 'Gas_Card')
              ) {
                  toast.error(
                      'Gas Card odometer log was blocked as a duplicate of another fill. Deploy the dual-pay fix or check for a true re-submit.',
                  );
                  void loadLogsAndTransactions();
                  return;
              }
              if ((saved as FuelEntry & { gateHeld?: boolean }).gateHeld) {
                  toast.error('Select a verified station so the Gas Card log posts to Transaction Logs.');
                  void loadLogsAndTransactions();
                  return;
              }
              setLogs((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)]);
              toast.success('Gas Card odometer logged — waiting for Roam Fuels statement');
              setIsLogModalOpen(false);
              setEditingLog(null);
              setDeskEditOpenCodes(null);
              void loadLogsAndTransactions();
              return;
          } else {
              // Single Mode — FuelEntry after array / gas-card arms
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

              const softDupId = (savedLog as FuelEntry & { softDuplicateOf?: string }).softDuplicateOf;
              const looksLikeSoftDup =
                  !!softDupId ||
                  (!editingLog &&
                      savedLog.id !== entry.id &&
                      (Number(savedLog.amount) !== Number(entry.amount) ||
                          String(savedLog.paymentSource || '') !== String(entry.paymentSource || '')));
              if (looksLikeSoftDup) {
                  toast.warning(
                      "This fill matches an existing log at the same odometer/time — no second entry was created. If cash and gas card both happened, change the time by a few minutes or check Paid By.",
                  );
                  void loadLogsAndTransactions();
                  return;
              }
              if ((savedLog as FuelEntry & { gateHeld?: boolean }).gateHeld) {
                  toast.warning(
                      "Saved to station review (Learnt) — pick a verified station so it posts to Transaction Logs.",
                  );
                  void loadLogsAndTransactions();
                  return;
              }
              
              /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 Settlement is now handled via the "Finalize" flow in Reconciliation Table.
                 (No getFuelScenarios fetch — R6-2; that call had no consumers.)
              */

              // Phase 7: Auto-create unverified vendor if entry lacks GPS (R6-1).
              if (shouldCreateUnverifiedVendor(savedLog, { skip: Boolean(editingLog) })) {
                  const vendorName = String(savedLog.location).trim();
                  try {
                      await api.createUnverifiedVendor({
                          transactionId: savedLog.transactionId!,
                          vendorName,
                          sourceType: 'no_gps'
                      });
                      console.log(`[Vendor Gate] Created unverified vendor for: ${vendorName}`);
                  } catch (vendorError: any) {
                      console.warn('[Vendor Gate] Failed to create unverified vendor:', vendorError);
                      // Don't block the main flow - just log the error
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
                              odometer: savedLog.odometer ?? undefined,
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
                  // R-3: desk-originated edit writes `corrected` for open codes stashed at open.
                  if (
                    deskEditOpenCodes &&
                    deskEditOpenCodes.entryId === (editingLog.id || savedLog.id) &&
                    deskEditOpenCodes.codes.length > 0
                  ) {
                    const periodId =
                      serverFuelPeriods.find(
                        (r) => weekStartYmd(r.weekStart) === flagsSelectedWeekStart,
                      )?.id || null;
                    // R4-1: one narrow so metadata is typed on the union arm.
                    const src = entry as FuelEntry & { correctionReason?: string };
                    const note =
                      String(
                        src.correctionReason ||
                          src.metadata?.editReason ||
                          'Corrected via Flags desk edit',
                      ).trim() || 'Corrected via Flags desk edit';
                    for (const flagCode of deskEditOpenCodes.codes) {
                      try {
                        const classified = classifyFuelFillFlags(savedLog, {
                          dispositions: flagDispositions,
                        });
                        const severity =
                          classified.reasons.find((r) => r.code === flagCode)?.severity ||
                          'warning';
                        const res = await api.upsertFuelFlagDisposition({
                          entryId: deskEditOpenCodes.entryId,
                          flagCode,
                          action: 'corrected',
                          note,
                          periodId,
                          severity,
                        });
                        const disp = (res as { disposition?: Record<string, unknown> })
                          ?.disposition;
                        setFlagDispositions((prev) =>
                          upsertDispositionIntoMap(prev, {
                            entryId: deskEditOpenCodes.entryId,
                            flagCode: String(disp?.flagCode || flagCode),
                            action: 'corrected',
                            note,
                            actorId: disp?.actorId != null ? String(disp.actorId) : null,
                            at:
                              disp?.at != null
                                ? String(disp.at)
                                : new Date().toISOString(),
                            periodId,
                          }),
                        );
                      } catch (dispErr) {
                        console.warn(
                          '[FuelManagement] corrected disposition failed',
                          flagCode,
                          dispErr,
                        );
                      }
                    }
                    setDeskEditOpenCodes(null);
                  }
                  toast.success("Transaction updated & financial ledger synced");
              } else {
                  setLogs(prev => [savedLog, ...prev]);
                  toast.success("Transaction recorded (Pending Reconciliation)");
              }
          }
          setIsLogModalOpen(false);
          setEditingLog(null);
          setDeskEditOpenCodes(null);
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
          invalidateReviewQueueCounts();
          toast.success("Posted to Transaction Logs");
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve log review");
      }
  }, [loadLogsAndTransactions, invalidateReviewQueueCounts]);

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
              invalidateReviewQueueCounts();
              toast.success("Posted to Transaction Logs");
          } else {
              toast.success("Expense approved");
          }
      } catch (e) {
          console.error(e);
          toast.error("Failed to approve reimbursement");
      }
  }, [loadLogsAndTransactions, invalidateReviewQueueCounts]);

  const handleRejectReimbursement = useCallback(async (id: string, reason?: string) => {
      try {
          const updated = await api.rejectExpense(id, reason);
          setTransactions(prev => prev.map(t => t.id === id ? updated : t));
          invalidateReviewQueueCounts();
          toast.success("Reimbursement Rejected");
      } catch (e) {
          console.error(e);
          toast.error("Failed to reject reimbursement");
      }
  }, [invalidateReviewQueueCounts]);

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

            // Edit path — shared mutation service (credit orphan + linked fill sync)
            if (editingExpense) {
                const { saved, syncedFuelEntryId } = await saveFuelExpense(transactionData, {
                    previous: editingExpense,
                    fuelEntries: logs,
                });
                if (syncedFuelEntryId) {
                    const refreshed = await fuelService.getFuelEntry(syncedFuelEntryId).catch(() => null);
                    if (refreshed) {
                        setLogs((prev) => prev.map((l) => (l.id === refreshed.id ? refreshed : l)));
                    }
                }
                setTransactions((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
                toast.success(
                    syncedFuelEntryId
                        ? 'Expense updated and linked fuel records synced'
                        : 'Expense updated',
                );
                if (shouldRefresh) await loadData(true);
                return;
            }

            const savedTx = await api.saveTransaction(transactionData);

            // Admin create: one-step Save & Approve so cash receipts do not self-queue
            if (
                transactionData?._saveAndApprove &&
                savedTx.status === 'Pending' &&
                (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement')
            ) {
                const odo = Number(savedTx.odometer);
                const approved = await api.approveExpense(
                    savedTx.id,
                    'Admin Save & Approve',
                    Number.isFinite(odo) && odo > 0 ? odo : undefined,
                    savedTx.matchedStationId || savedTx.metadata?.matchedStationId
                        ? {
                            matchedStationId: savedTx.matchedStationId || savedTx.metadata?.matchedStationId,
                            stationLocation:
                                typeof savedTx.metadata?.stationLocation === 'string'
                                    ? savedTx.metadata.stationLocation
                                    : undefined,
                          }
                        : undefined,
                );
                setTransactions((prev) => [approved, ...prev.filter((t) => t.id !== approved.id)]);
                if (shouldRefresh) await loadData(true);
                return;
            }
            
            // If admin saves as 'Approved' immediately, process settlement
            if (savedTx.status === 'Approved' && (savedTx.category === 'Fuel' || savedTx.category === 'Fuel Reimbursement')) {
                const scenariosData = await fuelService.getFuelScenarios();
                 /* 
                 Phase 6: Legacy Auto-Settlement Disabled.
                 */
            }

            setTransactions(prev => [savedTx, ...prev]);
            // We don't toast here if it's bulk, the modal will toast at the end
            
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
          const result = await purgeFuelExpense(txToDelete, { cascade: cascadeDelete });
          const txIds = result.deletedTransactionIds;
          if (result.deletedFuelEntryId) {
              setLogs((prev) => prev.filter((l) => l.id !== result.deletedFuelEntryId));
          }
          setTransactions((prev) => prev.filter((t) => !txIds.includes(t.id)));

          const detailsText = ` ($${Math.abs(txToDelete.amount).toFixed(2)})`;
          const count = txIds.length;
          
          toast.success(
            result.deletedFuelEntryId && cascadeDelete 
              ? `Ledger records and linked fuel log purged${detailsText}` 
              : `Expense removed${detailsText}`,
            {
              description: result.deletedFuelEntryId && cascadeDelete
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

          const priorReports = (await api
            .getFinalizedReports({ weekStartFrom: weekStart, weekStartTo: weekStart })
            .catch(() => [])) as FinalizedFuelReport[];

          const weekResult = await finalizeFuelWeekReports(
            reports,
            {
              vehicles,
              drivers,
              fuelCards: cards,
              fuelEntries: logs,
              scenarios,
              trips,
              transactions,
              disputes,
              periodCounts: (periodRow.counts || undefined) as Record<
                string,
                { actionable?: number }
              >,
              leakageReviewed: Boolean(
                periodRow.leakageReviewedAt ||
                  periodRow.leakage_reviewed_at ||
                  periodRow.status === 'locked',
              ),
              odometerChainReviewed: Boolean(
                periodRow.odometerChainReviewedAt ||
                  periodRow.odometer_chain_reviewed_at ||
                  periodRow.status === 'locked',
              ),
              unattributedReviewed: Boolean(
                periodRow.unattributedReviewedAt ||
                  periodRow.unattributed_reviewed_at ||
                  periodRow.status === 'locked',
              ),
              totalSpend: spendEstimate,
              unexplained: reports.reduce(
                (s, r) => s + (Number(r.miscellaneousCost) || 0),
                0,
              ),
              dispositions: flagDispositions,
            },
            {
              onProgress: (msg) => setMessage(msg),
              deferSnapshotPersist: true,
              priorReports,
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
          const recoverIfAlreadyLocked = async (): Promise<boolean> => {
            const fresh = await api.getFuelReconciliationPeriod(periodRow.id).catch(() => null);
            const locked =
              fresh &&
              (fresh.status === 'locked' || Boolean(fresh.lockedAt || fresh.locked_at));
            if (!locked) return false;
            await queryClient.invalidateQueries({ queryKey: ['finalizedReports'] });
            await queryClient.invalidateQueries({ queryKey: ['driverFinancialPeriods'] });
            await queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });
            toast.success('Week locked — this period is now Completed.');
            return true;
          };

          let jobRes: Awaited<ReturnType<typeof api.enqueueFuelPeriodFinalize>>;
          const enqueueArgs = {
            periodId: periodRow.id,
            version: periodRow.version || 1,
            idempotencyKey: fuelPeriodFinalizeIdempotencyKey(
              periodRow.id,
              periodRow.version || 1,
            ),
            snapshots: weekResult.snapshots || [],
            totalSpend,
            secondApproverThreshold: threshold,
          };
          try {
            jobRes = await api.enqueueFuelPeriodFinalize(enqueueArgs);
          } catch (lockErr: any) {
            if (lockErr?.code === 'SNAPSHOT_MISMATCH') {
              const forceReason = await confirmForceClientMoney(
                Array.isArray(lockErr.mismatches) ? lockErr.mismatches : [],
              );
              if (!forceReason) {
                toast.message(
                  'Finalize blocked — server mismatch. An admin can force close with a reason, or fix the week and retry.',
                );
                return false;
              }
              try {
                jobRes = await api.enqueueFuelPeriodFinalize({
                  ...enqueueArgs,
                  forceReason,
                });
              } catch (forceErr: any) {
                if (await recoverIfAlreadyLocked()) return true;
                throw forceErr;
              }
            } else {
              // Worker may OOM after lock, or retry hits version_conflict — both can mean success.
              if (await recoverIfAlreadyLocked()) return true;
              throw lockErr;
            }
          }
          const jobInterp = interpretFuelFinalizeJobResult(jobRes);
          if (jobInterp.incomplete) {
            if (await recoverIfAlreadyLocked()) return true;
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
      pageDescription = "Approve or reject driver fuel receipts. Create fill-ups from Transaction Logs.";
  } else if (activeTab === 'cards') {
      pageTitle = "Card Inventory";
      pageDescription = "Manage gas cards and their assignments.";
  } else if (activeTab === 'logs') {
      pageTitle = "Transaction Logs";
      pageDescription = "Posted fuel fill-ups. Use Add fuel to create. Odometer shows current km; Δ Prev shows change from last fill.";
  } else if (activeTab === 'integrity') {
      pageTitle = "Fuel Integrity";
      pageDescription =
        "Investigate problem fills and stop-to-stop tank/odometer gaps for the selected week.";
  } else if (activeTab === 'configuration') {
      pageTitle = "Fleet Policy Configuration";
      pageDescription = "Manage company and driver expense splits for fuel.";
  }

  return (
    <FuelLayout 
        title={pageTitle}
        description={pageDescription}
        hideDescriptionOnMobile={activeTab === 'logs'}
        embedded={embedded}
        headerActions={
          activeTab === 'logs' && !embedded ? (
            <Button
              size="sm"
              onClick={() => setIsAddFuelChoiceOpen(true)}
              className="hidden md:inline-flex bg-slate-900 text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add fuel
            </Button>
          ) : undefined
        }
    >
      {(activeTab !== 'configuration' && activeTab !== 'cards' && activeTab !== 'integrity') && (
        <div
          className={`flex justify-end items-center gap-3 mb-4 flex-wrap${
            activeTab === 'logs' && !embedded ? ' md:justify-end' : ''
          }${
            activeTab === 'logs' && !isSyncing ? ' hidden md:flex' : ''
          }`}
        >
            {activeTab === 'logs' && embedded ? (
              <Button
                size="sm"
                onClick={() => setIsAddFuelChoiceOpen(true)}
                className="hidden md:inline-flex bg-slate-900 text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add fuel
              </Button>
            ) : null}
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
                className={`text-slate-600 border-slate-200${
                  activeTab === 'logs' ? ' hidden md:inline-flex' : ''
                }`}
            >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
            </Button>
        </div>
      )}

      {activeTab === 'reimbursements' && (
        <>
          {transactionsTruncated && (
            <div
              className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
            >
              Review Queue loaded the maximum window of transactions. Older Pending items may be
              missing from this list and the nav badge — narrow activity or raise the lookback only
              with care.
            </div>
          )}
          <FuelReimbursementTable 
              transactions={transactions}
              logs={logs}
              onApprove={handleApproveReimbursement}
              onReject={handleRejectReimbursement}
              onEdit={can('fuel.edit_entry') ? handleEditExpense : undefined}
              onDelete={can('fuel.delete_entry') ? handleDeleteExpense : undefined}
              onViewDriverLedger={onViewDriverLedger}
              onApproveLogReview={handleApproveLogReview}
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
        </>
      )}

      {activeTab === 'reconciliation' && (
        <FuelReconciliationDashboard
          outstanding={outstandingFuelPeriods}
          inProgress={inProgressFuelPeriods}
          completed={completedFuelPeriods}
          loading={reconLandingLoading}
          periodsLoadError={serverPeriodsError}
          vehicles={vehicles}
          fuelEntries={logs}
          adjustments={adjustments}
          disputes={disputes}
          scenarios={scenarios}
          drivers={drivers}
          fuelCards={cards}
          finalizedReports={finalizedReports}
          transactions={transactions}
          isRefreshing={isRefreshing}
          dataTruncated={fuelDataTruncated}
          secondApproverThreshold={secondApproverThreshold}
          autoCloseDualApprovalMode={autoCloseDualApprovalMode}
          initialWeekStart={initialWeekStart}
          dispositions={flagDispositions}
          onOpenIntegrityStopToStop={({ weekStart, vehicleId }) => {
            setFlagsWeekStart(weekStart);
            if (vehicleId) setIntegrityPreferredVehicleId(vehicleId);
            setIntegritySubtab('stop-to-stop');
            setActiveTab('integrity');
            onTabChange?.('integrity');
            toast.info('Opening Fuel Integrity → Stop-to-stop…');
          }}
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
          onOpenReviewQueue={() => {
            setActiveTab('reimbursements');
            onTabChange?.('reimbursements');
            toast.info('Opening Review Queue…');
          }}
          onAcceptFuelException={async (entryId, note) => {
            const entry = logs.find((l) => l.id === entryId);
            if (!entry) {
              toast.error('Could not find that fill to resolve.');
              return false;
            }
            const noteTrim = note?.trim() || '';
            if (noteTrim.length < 8) {
              toast.error('Add a short note (at least 8 characters) to accept a critical flag.');
              return false;
            }
            // Desk parity — write the actual open critical code, never hardcode signal_exception.
            const flagCode = resolveOpenFlagCodeForAccept(entry, flagDispositions);
            if (!flagCode) {
              toast.error('No open critical flag left on this fill.');
              return false;
            }
            const periodId =
              serverFuelPeriods.find(
                (r) => weekStartYmd(r.weekStart) === reconciliationPeriodStart,
              )?.id || null;
            try {
              const res = await api.upsertFuelFlagDisposition({
                entryId,
                flagCode,
                action: 'accepted',
                note: noteTrim,
                periodId,
                severity: 'critical',
              });
              const disp = (res as { disposition?: Record<string, unknown> })?.disposition;
              if (disp) {
                setFlagDispositions((prev) =>
                  upsertDispositionIntoMap(prev, {
                    entryId: String(disp.entryId || entryId),
                    flagCode: String(disp.flagCode || flagCode),
                    action: 'accepted',
                    note: noteTrim,
                    actorId: disp.actorId != null ? String(disp.actorId) : null,
                    at: disp.at != null ? String(disp.at) : new Date().toISOString(),
                    periodId: periodId,
                  }),
                );
              } else {
                setFlagDispositions((prev) =>
                  upsertDispositionIntoMap(prev, {
                    entryId,
                    flagCode,
                    action: 'accepted',
                    note: noteTrim,
                    at: new Date().toISOString(),
                    periodId,
                  }),
                );
              }
              // Dual-read legacy ack only for signal_exception (same as desk).
              if (flagCode !== 'signal_exception') {
                toast.success('Flag accepted — Finalize is unlocked for this fill.');
                return true;
              }
              const updated: FuelEntry = {
                ...entry,
                correctionReason: noteTrim || 'Fuel exception acknowledged',
                metadata: {
                  ...entry.metadata,
                  reconExceptionAck: true,
                  exceptionResolvedAt: new Date().toISOString(),
                  exceptionResolveAction: 'accepted',
                  exceptionResolveNote: noteTrim || undefined,
                  auditStatus: 'Clear',
                },
              };
              const saved = await fuelService.saveFuelEntry(updated);
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
                  exceptionResolveNote: noteTrim || undefined,
                  // Preserve original signalTier — disposition is the source of truth.
                  signalTier: entry.metadata?.signalTier,
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
            setDeskEditOpenCodes(null);
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

      {activeTab === 'integrity' && (
        <FuelIntegrityDesk
          periods={flagsPeriodOptions}
          selectedWeekStart={flagsSelectedWeekStart}
          onSelectWeekStart={(weekStart) => {
            setFlagsWeekStart(weekStart);
          }}
          subtab={integritySubtab}
          onSubtabChange={setIntegritySubtab}
          rows={flagsDeskRows}
          loading={!fuelLogsHydrated || (activeTab === 'integrity' && serverPeriodsPending)}
          dispositionsTruncated={flagDispositionsTruncated}
          canDisposition={can('fuel.edit_entry')}
          canAcceptCritical={can('fuel.accept_unexplained')}
          vehicles={vehicles as Vehicle[]}
          fuelEntries={logs}
          trips={trips}
          adjustments={adjustments}
          transactions={transactions}
          dateRange={integrityDateRange}
          periodLocked={Boolean(
            flagsPeriodOptions.find((p) => p.weekStart === flagsSelectedWeekStart)?.locked,
          )}
          preferredVehicleId={integrityPreferredVehicleId}
          tripsLoading={integrityTripsLoading}
          onRefreshStopToStop={() => {
            void loadData(true);
          }}
          onReconcileWeek={(weekStart) => {
            const hit = flagsPeriodOptions.find((p) => p.weekStart === weekStart);
            if (!hit) return;
            handleReconciliationPeriodSelect({
              id: hit.weekStart,
              startDate: hit.weekStart,
              endDate: hit.weekEnd,
              label: hit.label,
            });
            setActiveTab('reconciliation');
            onTabChange?.('reconciliation');
          }}
          onEditFill={(entryId) => {
            const entry = logs.find((l) => l.id === entryId);
            if (!entry) {
              toast.error('Could not find that fill to edit.');
              return;
            }
            setDeskEditOpenCodes({
              entryId,
              codes: listOpenFlagCodesForEntry(entry, flagDispositions),
            });
            setEditingLog(entry);
            setIsLogModalOpen(true);
          }}
          onAcceptFlag={async (row, flagCode, note, action = 'accepted', opts) => {
            if (action === 'accepted' && row.reasons.some((r) => r.code === flagCode && r.severity === 'critical') && note.trim().length < 8) {
              toast.error('Add a note (8+ characters) to accept a critical flag.');
              return;
            }
            const periodId =
              serverFuelPeriods.find(
                (r) => weekStartYmd(r.weekStart) === flagsSelectedWeekStart,
              )?.id || null;
            const severity =
              row.reasons.find((r) => r.code === flagCode)?.severity || 'warning';
            try {
              const res = await api.upsertFuelFlagDisposition({
                entryId: row.entryId,
                flagCode,
                action,
                note: note.trim() || undefined,
                periodId,
                severity,
              });
              const disp = (res as { disposition?: Record<string, unknown> })?.disposition;
              if (disp) {
                setFlagDispositions((prev) =>
                  upsertDispositionIntoMap(prev, {
                    entryId: String(disp.entryId || row.entryId),
                    flagCode: String(disp.flagCode || flagCode),
                    action:
                      action === 'escalated'
                        ? 'escalated'
                        : action === 'corrected'
                          ? 'corrected'
                          : 'accepted',
                    note: note.trim() || null,
                    actorId: disp.actorId != null ? String(disp.actorId) : null,
                    at: disp.at != null ? String(disp.at) : new Date().toISOString(),
                    periodId,
                  }),
                );
              }
              if (action === 'accepted' && flagCode === 'signal_exception') {
                const entry = logs.find((l) => l.id === row.entryId);
                if (entry) {
                  const updated: FuelEntry = {
                    ...entry,
                    metadata: {
                      ...entry.metadata,
                      reconExceptionAck: true,
                      exceptionResolvedAt: new Date().toISOString(),
                      exceptionResolveAction: 'accepted',
                      exceptionResolveNote: note.trim() || undefined,
                    },
                  };
                  await fuelService.saveFuelEntry(updated);
                  setLogs((prev) => prev.map((l) => (l.id === row.entryId ? updated : l)));
                }
              }
              if (!opts?.quiet) {
                toast.success(action === 'escalated' ? 'Flag escalated' : 'Flag accepted');
              }
            } catch (e: any) {
              if (!opts?.quiet) {
                toast.error(e?.message || 'Could not save disposition');
              }
              throw e;
            }
          }}
        />
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
                onAddFuel={() => setIsAddFuelChoiceOpen(true)}
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

      <AddFuelChoiceDialog
        open={isAddFuelChoiceOpen}
        onOpenChange={setIsAddFuelChoiceOpen}
        onChooseDriverClaim={() => {
          setEditingExpense(null);
          setIsSubmitExpenseModalOpen(true);
        }}
        onChooseKnownFill={() => {
          setEditingLog(null);
          setIsLogModalOpen(true);
        }}
      />

      {isLogModalOpen && (
      <FuelLogModal 
            isOpen={isLogModalOpen}
            onClose={() => {
              setIsLogModalOpen(false);
              setEditingLog(null);
              setDeskEditOpenCodes(null);
            }}
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
            canApproveFuel={can('fuel.approve')}
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
      {forceClientMoneyDialog}

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