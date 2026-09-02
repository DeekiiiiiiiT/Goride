import React, { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { FuelPeriodStepper } from './FuelPeriodStepper';
import { FuelWeekMoneyStrip } from './FuelWeekMoneyStrip';
import { FuelDataQualityStep } from './FuelDataQualityStep';
import { FuelExceptionBlockersPanel } from './FuelExceptionBlockersPanel';
import { useFuelWeekReports } from '../../../hooks/useFuelWeekReports';
import {
  evaluateFuelFinalizeGating,
  type FuelExceptionBlocker,
} from '../../../utils/fuelFinalizeGating';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import {
  canAdvanceFuelStep,
  computeFuelGatedStepStates,
  FUEL_STEP_LABELS,
  FUEL_STEP_ORDER,
  pickInitialFuelStep,
  type FuelStepId,
} from '../../../utils/fuelPeriodGating';
import { buildFuelStepCounts, type FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { isEntryInInclusiveYmdRange } from '../../../utils/fuelWeekPeriod';
import { sumGasCardSpendForReport, sumPaidByDriverForReport } from '../../../utils/fuelPaidByDriver';
import {
  buildFuelVehicleSnapshots,
  liveReportsToPrimaryClaimedSlices,
} from '../../../utils/fuelPeriodDerive';
import { FuelSettlementPreviewStep } from './FuelSettlementPreviewStep';
import { FuelFinalizeStep } from './FuelFinalizeStep';
import { FuelDisputesStep } from './FuelDisputesStep';
import { FuelPolicyCheckStep } from './FuelPolicyCheckStep';
import { FuelLeakageStep } from './FuelLeakageStep';
import { FuelWizardStepHero } from './FuelWizardStepHero';
import {
  FuelPeriodWizardBodyGate,
  FuelPeriodWizardContinueFooter,
  FuelPeriodWizardHeader,
} from './FuelPeriodWizardShell';
import { useFuelWizardKeyboard } from './useFuelWizardKeyboard';
import {
  applyLocalLeakageReview,
  downloadWizardEvidencePack,
  persistLeakageReviewToServer,
  persistWizardStep,
  recordWizardSecondApproval,
  refreshSecondApproveActors,
  settlementPreviewStepIndex,
} from './useFuelWizardActions';
import {
  buildBreakdownRows,
  buildLeakageRows,
  buildMoneyStrip,
  buildPolicyRows,
  buildPriorMedian,
  buildQualityRows,
  buildSettlementRows,
  type FuelWizardDriver,
} from './buildFuelWizardRows';
import {
  hasDistinctSecondApprove,
  needsHumanSecondApprover,
  needsSecondApprover,
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelDualApprovalUiMode,
  resolveFuelSecondApproverThreshold,
  type FuelDualApprovalUiMode,
} from '../../../utils/fuelDualApproval';
import { downloadCSV } from '../../../utils/export';
import { api } from '../../../services/api';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

/**
 * Period wizard — production Consumption Reconciliation walkthrough.
 */
import type {
  FinalizedFuelReport,
  FuelCard,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  MileageAdjustment,
  WeeklyFuelReport,
} from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { FUEL_STEP_ICONS } from '../../../utils/fuelStepIcons';
import { loadFuelLeakageReview } from '../../../utils/fuelLeakageReviewStore';

export type { FuelWizardDriver };

interface FuelPeriodWizardProps {
  period: FuelReconciliationPeriod;
  vehicles: Vehicle[];
  trips: Trip[];
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  disputes: FuelDispute[];
  scenarios: FuelScenario[];
  drivers: FuelWizardDriver[];
  fuelCards?: FuelCard[];
  finalizedReports: FinalizedFuelReport[];
  dateRange: DateRange;
  isRefreshing?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onFinalize: (reports: WeeklyFuelReport[]) => Promise<boolean | void> | boolean | void;
  onAddAdjustment: () => void;
  onResolveDispute: (dispute: FuelDispute) => void;
  onOpenConfiguration?: () => void;
  onResetPeriod?: () => void;
  /** Jump to Transaction Logs and highlight a fill (optional). */
  onOpenTransactionLogs?: (opts: {
    fuelEntryId?: string;
    date?: string;
    vehicleId?: string;
  }) => void;
  /** Accept exception in-place so Finalize can unlock without leaving recon. */
  onAcceptFuelException?: (
    entryId: string,
    note: string,
  ) => Promise<boolean | void> | boolean | void;
  /** Open edit fill overlay while staying on Fuel Management. */
  onEditFuelEntry?: (entryId: string) => void;
  /** Bumps on Reopen week — remounts wizard walkthrough from step 1. */
  sessionKey?: number;
  /** Deep-link from landing step chip (M3). */
  initialStepId?: FuelStepId;
}

function FuelPeriodWizardInner({
  period,
  vehicles,
  trips,
  fuelEntries,
  adjustments,
  disputes,
  scenarios,
  drivers,
  fuelCards = [],
  finalizedReports,
  dateRange,
  onBack,
  onRefresh,
  onFinalize,
  onAddAdjustment,
  onResolveDispute,
  onOpenTransactionLogs,
  onAcceptFuelException,
  onEditFuelEntry,
  onOpenConfiguration,
  onResetPeriod,
  sessionKey = 0,
  initialStepId,
}: FuelPeriodWizardProps) {
  const { user } = useAuth();
  const [leakageReviewed, setLeakageReviewed] = useState(false);
  const [leakageReviewMeta, setLeakageReviewMeta] = useState<{
    at?: string | null;
    by?: string | null;
    note?: string | null;
  }>({});
  const [showGapDetail, setShowGapDetail] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [bucketVehicleId, setBucketVehicleId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<FuelStepId>('data-quality');
  const [progressIndex, setProgressIndex] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [financeWarningAcknowledged, setFinanceWarningAcknowledged] = useState(false);
  const [secondApproveActors, setSecondApproveActors] = useState<string[]>([]);
  const [secondApproveBusy, setSecondApproveBusy] = useState(false);
  const [serverPeriodId, setServerPeriodId] = useState<string | null>(null);
  const [secondApproverThreshold, setSecondApproverThreshold] = useState(
    FUEL_SECOND_APPROVER_THRESHOLD,
  );
  const [dualApprovalUiMode, setDualApprovalUiMode] =
    useState<FuelDualApprovalUiMode>('human');
  const [exceptionBusyId, setExceptionBusyId] = useState<string | null>(null);
  const [stepNoteDraft, setStepNoteDraft] = useState('');
  const [stepNotes, setStepNotes] = useState<Array<{ step: string; note: string; at: string }>>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const periodLocked = period.locked;
  const secondApproverConfirmed = hasDistinctSecondApprove(secondApproveActors, user?.id);

  // Parent trips are for the selected recon week — only reuse when they overlap this period.
  const tripsOverlapThisWeek = useMemo(
    () =>
      (trips || []).some((t) =>
        isEntryInInclusiveYmdRange(t.date, period.startDate, period.endDate),
      ),
    [trips, period.startDate, period.endDate],
  );

  const weekReports = useFuelWeekReports({
    weekStartYmd: period.startDate,
    weekEndYmd: period.endDate,
    vehicles,
    drivers,
    fuelEntries,
    adjustments,
    scenarios,
    fuelCards,
    disputes,
    finalizedReports,
    // Wrong-week parent trips zero ride-share math and can stall brain work.
    trips: tripsOverlapThisWeek ? trips : undefined,
    seedPersonalAllowance: false,
  });
  const liveReports = weekReports.reports;
  const weekTrips = weekReports.trips.length ? weekReports.trips : trips;

  const { vehicleSnaps, openDisputes } = useMemo(() => {
    const liveSlices = liveReportsToPrimaryClaimedSlices(liveReports);
    const built = buildFuelVehicleSnapshots({
      vehicles,
      weekStartYmd: period.startDate,
      weekEndYmd: period.endDate,
      fuelEntries,
      disputes,
      finalizedReports,
      scenarios,
      liveSlices,
    });
    const paidByDriverCtx = { vehicles, trips: weekTrips, fuelCards };
    const enriched = built.snapshots.map((snap) => {
      const vehicle = vehicles.find((x) => x.id === snap.vehicleId);
      const report = liveReports.find(
        (r) =>
          r.vehicleId === snap.vehicleId ||
          (Array.isArray(r.vehicleIds) && r.vehicleIds.includes(snap.vehicleId)),
      );
      const driverSpend =
        snap.totalSpend > FUEL_SPEND_EPS && report
          ? sumPaidByDriverForReport(fuelEntries, report, vehicles, paidByDriverCtx)
          : 0;
      return {
        ...snap,
        plate: vehicle?.licensePlate || snap.vehicleId,
        driverSpend,
        netPay: driverSpend - snap.driverShare,
        odometerIncomplete: !!report?.dataQuality?.odometerIncomplete,
        report: snap.totalSpend > FUEL_SPEND_EPS ? report : undefined,
      };
    });
    return { vehicleSnaps: enriched, openDisputes: built.openDisputes };
  }, [
    vehicles,
    liveReports,
    fuelEntries,
    disputes,
    finalizedReports,
    period.startDate,
    period.endDate,
    scenarios,
    weekTrips,
    fuelCards,
  ]);

  // Enrich settlement columns from live reports (cash from earnings vs driver share)
  const settlementRows = useMemo(
    () =>
      buildSettlementRows({
        liveReports,
        vehicles,
        fuelEntries,
        fuelCards,
        weekTrips,
        periodLocked,
      }),
    [liveReports, vehicles, fuelEntries, periodLocked, weekTrips, fuelCards],
  );

  const counts = useMemo(
    () =>
      buildFuelStepCounts({
        vehicles: vehicleSnaps.filter(
          (v) => v.totalSpend > FUEL_SPEND_EPS || v.pendingCount > 0 || v.hasOpenDispute || v.isFinalized,
        ),
        leakageReviewed: leakageReviewed || periodLocked,
      }),
    [vehicleSnaps, leakageReviewed, periodLocked],
  );

  const gatedStates = useMemo(() => computeFuelGatedStepStates(counts), [counts]);

  // Fresh walkthrough on period open or after Reopen week
  useEffect(() => {
    setShowGapDetail(false);
    setShowCostBreakdown(false);
    setBucketVehicleId(null);
    setLeakageReviewMeta({});
    // Prefer locked / explicit deep-link; otherwise wait for server hydrate (H9) before pickInitial.
    if (sessionKey > 0 || periodLocked) {
      const startId: FuelStepId = periodLocked ? 'finalize' : initialStepId || 'data-quality';
      setActiveStepId(startId);
      setProgressIndex(
        periodLocked ? FUEL_STEP_ORDER.length - 1 : Math.max(0, FUEL_STEP_ORDER.indexOf(startId)),
      );
      setLeakageReviewed(periodLocked);
      return;
    }
    if (initialStepId && FUEL_STEP_ORDER.includes(initialStepId)) {
      setActiveStepId(initialStepId);
      setProgressIndex(FUEL_STEP_ORDER.indexOf(initialStepId));
      return;
    }
    // Offline fallback until hydrate; local cache must not win over server SoT.
    const local = loadFuelLeakageReview(period.startDate);
    setLeakageReviewed(Boolean(local));
    if (local) {
      setLeakageReviewMeta({ at: local.reviewedAt, by: local.actorLabel, note: local.note });
    }
    const initial = pickInitialFuelStep(gatedStates);
    const idx = FUEL_STEP_ORDER.indexOf(initial);
    setActiveStepId(initial);
    setProgressIndex(Math.max(0, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.id, sessionKey, initialStepId]);

  const persistStep = (step: FuelStepId, note?: string) => {
    void persistWizardStep({
      serverPeriodId,
      weekStart: period.startDate,
      weekEnd: period.endDate,
      setServerPeriodId,
      step,
      note,
    });
  };

  // H8/H9 + NEW-6: server period is SoT for leakage review, step resume, second approval
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await api.getPreferences().catch(() => null);
        if (!cancelled && prefs) {
          setSecondApproverThreshold(
            resolveFuelSecondApproverThreshold((prefs as any)?.fuelSecondApproverThreshold),
          );
          setDualApprovalUiMode(
            resolveFuelDualApprovalUiMode((prefs as any)?.fuelDualApprovalUiMode),
          );
        }
        const rows = await api.listFuelReconciliationPeriods({
          from: period.startDate,
          to: period.startDate,
        });
        const hit = rows.find((r) => String(r.weekStart).split('T')[0] === period.startDate);
        if (cancelled || !hit?.id) return;
        setServerPeriodId(hit.id);

        // H8: server review wins; absence clears device-only acceptance for this week.
        if (hit.leakageReviewedAt) {
          setLeakageReviewed(true);
          setLeakageReviewMeta({
            at: hit.leakageReviewedAt,
            by: hit.leakageReviewedBy,
            note: hit.leakageReviewedNote,
          });
        } else if (!periodLocked) {
          setLeakageReviewed(false);
          setLeakageReviewMeta({});
        }

        // H9: restore current_step unless deep-link or locked
        if (
          !periodLocked &&
          !initialStepId &&
          hit.currentStep &&
          FUEL_STEP_ORDER.includes(hit.currentStep as FuelStepId)
        ) {
          const step = hit.currentStep as FuelStepId;
          setActiveStepId(step);
          setProgressIndex(Math.max(0, FUEL_STEP_ORDER.indexOf(step)));
        }

        const actors = await refreshSecondApproveActors(hit.id);
        if (cancelled) return;
        setSecondApproveActors(actors);
        if (hit.leakageReviewedAt) {
          setLeakageReviewed(true);
          setLeakageReviewMeta({
            at: hit.leakageReviewedAt,
            by: hit.leakageReviewedBy,
            note: hit.leakageReviewedNote,
          });
        }
      } catch {
        /* offline — local leakage cache still applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period.startDate, period.endDate, sessionKey, periodLocked, initialStepId]);

  useEffect(() => {
    const current = gatedStates.find((s) => s.id === activeStepId);
    if (current?.locked) {
      const next = pickInitialFuelStep(gatedStates);
      setActiveStepId(next);
      setProgressIndex(FUEL_STEP_ORDER.indexOf(next));
    }
  }, [gatedStates, activeStepId]);

  /** Stepper: hard-gates still apply; green check = walked past in this session (or locked week). */
  const stepperStates = useMemo(() => {
    return gatedStates.map((s, i) => {
      const walkedPast = i < progressIndex;
      return {
        ...s,
        complete: periodLocked ? s.complete : walkedPast,
        locked: s.locked || (!periodLocked && i > progressIndex),
      };
    });
  }, [gatedStates, progressIndex, periodLocked]);

  const strip = useMemo(
    () =>
      buildMoneyStrip({
        liveReports,
        fuelEntries,
        vehicles,
        fuelCards,
        weekTrips,
        sumGasCard: sumGasCardSpendForReport,
        sumPaidByDriver: sumPaidByDriverForReport,
      }),
    [liveReports, fuelEntries, vehicles, fuelCards, weekTrips],
  );

  const qualityRows = useMemo(
    () => buildQualityRows(vehicleSnaps as any, vehicles, drivers),
    [vehicleSnaps, vehicles, drivers],
  );

  const breakdownRows = useMemo(
    () => buildBreakdownRows(vehicleSnaps as any, vehicles, drivers),
    [vehicleSnaps, vehicles, drivers],
  );

  // openDisputes comes from buildFuelVehicleSnapshots (same matcher as landing/bulk)

  const leakageRows = useMemo(() => buildLeakageRows(vehicleSnaps as any), [vehicleSnaps]);

  const policyRows = useMemo(
    () =>
      buildPolicyRows({
        vehicles,
        vehicleSnaps: vehicleSnaps as any,
        liveReports,
        scenarios,
        weekStart: period.startDate,
      }),
    [vehicles, scenarios, vehicleSnaps, period.startDate, liveReports],
  );

  const canContinue = canAdvanceFuelStep(activeStepId, counts);
  const stepIndex = FUEL_STEP_ORDER.indexOf(activeStepId);
  const isLast = stepIndex === FUEL_STEP_ORDER.length - 1;
  const weekIsEmpty =
    !weekReports.loading &&
    !weekReports.error &&
    liveReports.length === 0 &&
    vehicleSnaps.every((v) => v.totalSpend <= FUEL_SPEND_EPS);

  const handleContinue = () => {
    if (!canContinue || isLast) return;
    const noteForStep = stepNoteDraft.trim();
    if (noteForStep) {
      setStepNotes((prev) => [
        ...prev,
        { step: activeStepId, note: noteForStep, at: new Date().toISOString() },
      ]);
      setStepNoteDraft('');
    }
    const next = FUEL_STEP_ORDER[stepIndex + 1];
    const nextState = gatedStates.find((s) => s.id === next);
    if (nextState && !nextState.locked) {
      setProgressIndex(Math.max(progressIndex, stepIndex + 1));
      setActiveStepId(next);
      persistStep(next, noteForStep || undefined);
    }
  };

  const handleMarkLeakageReviewed = () => {
    const note =
      stepNoteDraft.trim() || 'Accepted unexplained / over-explained fuel for this week';
    const meta = applyLocalLeakageReview({
      weekStart: period.startDate,
      note,
      actorLabel: user?.email || user?.id || undefined,
      actorId: user?.id || user?.email || null,
    });
    setLeakageReviewed(true);
    setLeakageReviewMeta(meta);
    if (stepNoteDraft.trim()) {
      setStepNotes((prev) => [
        ...prev,
        { step: 'leakage-gap', note: stepNoteDraft.trim(), at: new Date().toISOString() },
      ]);
      setStepNoteDraft('');
    }
    void persistLeakageReviewToServer({
      serverPeriodId,
      weekStart: period.startDate,
      weekEnd: period.endDate,
      setServerPeriodId,
      note,
    });
    const settlementIdx = settlementPreviewStepIndex();
    setProgressIndex(Math.max(progressIndex, settlementIdx));
    setActiveStepId('settlement-preview');
  };

  const handleRecordSecondApproval = async () => {
    setSecondApproveBusy(true);
    try {
      await recordWizardSecondApproval({
        serverPeriodId,
        weekStart: period.startDate,
        weekEnd: period.endDate,
        setServerPeriodId,
        note: stepNoteDraft.trim() || undefined,
        setActors: setSecondApproveActors,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Could not record second approval');
    } finally {
      setSecondApproveBusy(false);
    }
  };

  const handleDownloadEvidencePack = async () => {
    await downloadWizardEvidencePack({
      serverPeriodId,
      weekStart: period.startDate,
      weekEnd: period.endDate,
      weekLabel: period.label,
      setServerPeriodId,
      strip,
      settlementRows,
      openDisputeCount: openDisputes.length,
      leakageReviewed,
      stepNotes,
      secondApproverConfirmed,
    });
  };

  // Always re-gate from live fuelEntries. Preferring weekReports.gateResult left
  // exception blockers stuck after Accept (query cache / same entry count key).
  const gateResult = useMemo(() => {
    return evaluateFuelFinalizeGating({
      reports: liveReports,
      disputes,
      fuelEntries,
      finalizedReports,
      weekStartYmd: period.startDate,
      weekEndYmd: period.endDate,
    });
  }, [
    liveReports,
    disputes,
    fuelEntries,
    finalizedReports,
    period.startDate,
    period.endDate,
  ]);

  const exceptionBlockers: FuelExceptionBlocker[] = gateResult.exceptionBlockers || [];

  const plateByVehicleId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of vehicles) {
      map[v.id] = v.licensePlate || v.id;
    }
    return map;
  }, [vehicles]);

  const openExceptionInLogs = (blocker: FuelExceptionBlocker) => {
    onOpenTransactionLogs?.({
      fuelEntryId: blocker.id,
      date: blocker.dateYmd,
      vehicleId: blocker.vehicleId,
    });
  };

  const handleAcceptException = async (blocker: FuelExceptionBlocker, note: string) => {
    if (!onAcceptFuelException) return;
    setExceptionBusyId(blocker.id);
    try {
      const ok = await onAcceptFuelException(blocker.id, note);
      if (ok === false) return;
      // Live fuelEntries + re-gate clear blockers; refresh reports in background.
      onRefresh();
      void weekReports.refresh();
    } finally {
      setExceptionBusyId(null);
    }
  };

  const handleFinalizeClick = async () => {
    if (periodLocked || liveReports.length === 0) return;
    const gate = gateResult;
    if (gate.hasExceptionBlockers) {
      return;
    }
    if (gate.hasBlockingWarnings && !financeWarningAcknowledged) {
      return;
    }
    if (
      needsHumanSecondApprover(strip.totalSpend, secondApproverThreshold, dualApprovalUiMode) &&
      !secondApproverConfirmed
    ) {
      return;
    }
    if (stepNoteDraft.trim()) {
      setStepNotes((prev) => [
        ...prev,
        { step: 'finalize', note: stepNoteDraft.trim(), at: new Date().toISOString() },
      ]);
      setStepNoteDraft('');
    }
    setFinalizing(true);
    try {
      const ok = await onFinalize(liveReports);
      if (ok) onBack();
    } finally {
      setFinalizing(false);
    }
  };

  const handleRetryWeek = () => {
    void weekReports.refresh();
    onRefresh();
  };

  const bucketVehicle =
    vehicles.find((v) => v.id === bucketVehicleId) ||
    vehicles.find((v) => leakageRows.some((r) => r.id === v.id)) ||
    vehicles[0];

  const stepHero = (() => {
    switch (activeStepId) {
      case 'data-quality':
        return exceptionBlockers.length > 0
          ? {
              title: 'Exception fills must be cleared',
              body: `${exceptionBlockers.length} fill(s) are marked Exception and will block Finalize. Resolve them here — accept if OK, or edit the numbers.`,
              actionLabel: 'Continue',
              onAction: handleContinue,
            }
          : qualityRows.length === 0
          ? {
              title: 'Data looks clear',
              body: 'No Amber/Red flags or pending issues blocking this week. Continue to the next step.',
              actionLabel: 'Continue',
              onAction: handleContinue,
            }
          : {
              title: 'Review flagged vehicles',
              body: 'Amber/Red means tank-cycle or gap issues — not every top-up variance. Pending logs post when you Finalize.',
              actionLabel: 'Continue',
              onAction: handleContinue,
            };
      case 'adjustments-disputes':
        return openDisputes.length === 0
          ? {
              title: 'No open disputes',
              body: 'You can add a mileage adjustment if needed, then continue.',
              actionLabel: periodLocked ? undefined : 'Add adjustment',
              onAction: periodLocked ? undefined : onAddAdjustment,
            }
          : {
              title: 'Resolve open disputes',
              body: `${openDisputes.length} dispute(s) must be resolved before you can leave this step.`,
            };
      case 'policy-check':
        return {
          title: 'Confirm fuel policies',
          body: 'Each vehicle below shows the coverage rules for this week. Change assignments in Fleet Policy Configuration if needed.',
          actionLabel: onOpenConfiguration ? 'Open policies' : undefined,
          onAction: onOpenConfiguration,
        };
      case 'leakage-gap':
        return Math.abs(strip.leakage) > FUEL_SPEND_EPS && !leakageReviewed
          ? {
              title: strip.leakage < 0 ? 'Review over-explained fuel' : 'Review unexplained fuel',
              body:
                strip.leakage < 0
                  ? `Over-explained fuel ${formatFuelMoney(strip.leakage)} — categorized costs exceed gas-card spend. Check odometer/trips/policy, or accept and continue.`
                  : `Unexplained fuel ${formatFuelMoney(strip.leakage)} — charge stop-to-stop gaps if needed, or accept and continue.`,
              actionLabel: 'Mark reviewed & continue',
              onAction: handleMarkLeakageReviewed,
            }
          : {
              title: strip.leakage < 0 ? 'Over-explained fuel reviewed' : 'Unexplained fuel reviewed',
              body:
                Math.abs(strip.leakage) > FUEL_SPEND_EPS
                  ? `${strip.leakage < 0 ? 'Over-explained' : 'Unexplained'} fuel ${formatFuelMoney(strip.leakage)} accepted${
                      leakageReviewMeta.note ? ` — “${leakageReviewMeta.note}”` : ''
                    }${leakageReviewMeta.by ? ` · by ${String(leakageReviewMeta.by).slice(0, 8)}…` : ''}${
                      leakageReviewMeta.at
                        ? ` · ${new Date(leakageReviewMeta.at).toLocaleString()}`
                        : ''
                    }.`
                  : 'No unexplained fuel this week.',
              actionLabel: 'Continue',
              onAction: handleContinue,
            };
      case 'settlement-preview':
        return {
          title: 'Confirm settle-up for this week',
          body: 'Cash from earnings is a credit; driver’s fuel share is a charge. Net this week is what settles on pay.',
          actionLabel: 'Continue to Finalize',
          onAction: handleContinue,
        };
      case 'finalize':
        return periodLocked
          ? {
              title: 'Week is locked',
              body: 'This period is finalized. Use Reopen week above to unlock it.',
              actionLabel: onResetPeriod ? 'Reopen week' : undefined,
              onAction: onResetPeriod,
            }
          : exceptionBlockers.length > 0
            ? {
                title: 'Can’t finalize yet',
                body: `Resolve the ${exceptionBlockers.length} exception fill(s) listed below in this week — then Finalize.`,
                actionLabel: undefined,
              }
            : {
                title: 'Ready to lock this week',
                body: 'Finalize posts pending fuel to settlements and freezes this week. If driver payouts already exist and the leftover would change, you will confirm Reopen settlement first.',
                actionLabel: finalizing ? 'Finalizing…' : 'Finalize week',
                onAction: handleFinalizeClick,
                actionDisabled:
                  finalizing ||
                  liveReports.length === 0 ||
                  !!gateResult.hasExceptionBlockers ||
                  (!!gateResult.hasBlockingWarnings && !financeWarningAcknowledged) ||
                  (needsHumanSecondApprover(
                    strip.totalSpend,
                    secondApproverThreshold,
                    dualApprovalUiMode,
                  ) &&
                    !secondApproverConfirmed),
              };
      default:
        return { title: '', body: '' };
    }
  })();

  const priorMedian = useMemo(
    () => buildPriorMedian(finalizedReports, period.startDate),
    [finalizedReports, period.startDate],
  );

  const exportSettlementCsv = () => {
    void downloadCSV(
      settlementRows.map((r) => ({
        plate: r.plate,
        cashFromEarnings: r.cashFromEarnings,
        driverShare: r.driverShare,
        netPay: r.netPay,
        status: r.status || '',
      })),
      `fuel-settlement-${period.startDate}.csv`,
    );
  };

  // Keyboard queue: j/k navigate, a accept unexplained, Enter continue
  useFuelWizardKeyboard({
    activeStepId,
    qualityRowCount: qualityRows.length,
    openDisputeCount: openDisputes.length,
    leakageRowCount: leakageRows.length,
    settlementRowCount: settlementRows.length,
    exceptionBlockerCount: exceptionBlockers.length,
    periodLocked,
    leakageReviewed,
    canContinue,
    isLast,
    setQueueIndex,
    onMarkLeakageReviewed: handleMarkLeakageReviewed,
    onContinue: handleContinue,
    onEditExceptionAt: (qi) => {
      if (exceptionBlockers.length > 0 && onEditFuelEntry) {
        const b = exceptionBlockers[qi % exceptionBlockers.length];
        if (b?.id) onEditFuelEntry(b.id);
      }
    },
    onOpenQualityRowLogs: (qi) => {
      if (onOpenTransactionLogs) {
        const row = qualityRows[qi];
        if (row?.id) onOpenTransactionLogs({ vehicleId: row.id });
      }
    },
  });

  const continueLabel =
    activeStepId === 'leakage-gap' ? 'Continue to Settlement' : 'Continue';

  return (
    <div className="space-y-4 pb-24">
      <FuelPeriodWizardHeader
        period={period}
        periodLocked={periodLocked}
        onBack={onBack}
        onResetPeriod={onResetPeriod}
      />

      <FuelPeriodWizardBodyGate
        loading={weekReports.loading}
        error={Boolean(weekReports.error)}
        empty={weekIsEmpty}
        updating={weekReports.updating}
        onRetry={handleRetryWeek}
      >
      <FuelWeekMoneyStrip
        gasCard={strip.gasCard}
        cashFromEarnings={strip.cashFromEarnings}
        totalSpend={strip.totalSpend}
        company={strip.company}
        driver={strip.driver}
        leakage={strip.leakage}
        priorMedian={priorMedian}
      />

      <FuelPeriodStepper
        states={stepperStates}
        activeStepId={activeStepId}
        onSelect={(id) => {
          const idx = FUEL_STEP_ORDER.indexOf(id);
          const state = stepperStates.find((s) => s.id === id);
          if (!state || state.locked) return;
          setActiveStepId(id);
          // Don't auto-advance progress when jumping back — only Continue marks steps done
          if (idx > progressIndex) setProgressIndex(idx);
          persistStep(id);
        }}
        labels={FUEL_STEP_LABELS}
        icons={FUEL_STEP_ICONS}
      />

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Step note (optional)</span>
        <textarea
          className="min-h-[64px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={stepNoteDraft}
          onChange={(e) => setStepNoteDraft(e.target.value)}
          placeholder="Judgement call for this step — included in evidence pack"
        />
      </label>
      <FuelWizardStepHero
        title={stepHero.title}
        body={stepHero.body}
        actionLabel={stepHero.actionLabel}
        onAction={stepHero.onAction}
        actionDisabled={stepHero.actionDisabled}
      />

      <div className="space-y-3">
        {activeStepId === 'data-quality' && (
          <div className="space-y-4">
            <FuelExceptionBlockersPanel
              blockers={exceptionBlockers}
              plateByVehicleId={plateByVehicleId}
              busyId={exceptionBusyId}
              onAcceptException={
                onAcceptFuelException
                  ? handleAcceptException
                  : async () => undefined
              }
              onEditFill={
                onEditFuelEntry
                  ? (b) => onEditFuelEntry(b.id)
                  : onOpenTransactionLogs
                    ? openExceptionInLogs
                    : undefined
              }
            />
            <FuelDataQualityStep
              rows={qualityRows}
              breakdownRows={breakdownRows}
              periodLocked={periodLocked}
              weekLabel={period.label}
              showBreakdown={showCostBreakdown}
              onToggleBreakdown={() => setShowCostBreakdown((v) => !v)}
              onAddAdjustment={onAddAdjustment}
            />
          </div>
        )}

        {activeStepId === 'adjustments-disputes' && (
          <FuelDisputesStep
            openDisputes={openDisputes}
            periodLocked={periodLocked}
            onResolveDispute={onResolveDispute}
            onAddAdjustment={onAddAdjustment}
          />
        )}

        {activeStepId === 'policy-check' && <FuelPolicyCheckStep policyRows={policyRows} />}

        {activeStepId === 'leakage-gap' && (
          <FuelLeakageStep
            leakage={strip.leakage}
            leakageRows={leakageRows}
            queueIndex={queueIndex}
            vehicleSnaps={vehicleSnaps}
            weekStart={period.startDate}
            weekEnd={period.endDate}
            fuelEntries={fuelEntries}
            trips={weekTrips}
            showGapDetail={showGapDetail}
            onToggleGapDetail={() => setShowGapDetail((v) => !v)}
            bucketVehicle={bucketVehicle || null}
            vehicles={vehicles}
            periodLocked={periodLocked}
            onBucketVehicleChange={setBucketVehicleId}
            adjustments={adjustments}
            dateRange={dateRange}
            onRefresh={onRefresh}
          />
        )}

        {activeStepId === 'settlement-preview' && (
          <FuelSettlementPreviewStep rows={settlementRows} onExport={exportSettlementCsv} />
        )}

        {activeStepId === 'finalize' && (
          <FuelFinalizeStep
            periodLocked={periodLocked}
            exceptionBlockers={exceptionBlockers}
            plateByVehicleId={plateByVehicleId}
            exceptionBusyId={exceptionBusyId}
            onAcceptException={
              onAcceptFuelException
                ? handleAcceptException
                : async () => undefined
            }
            onEditFill={
              onEditFuelEntry
                ? (b) => onEditFuelEntry(b.id)
                : onOpenTransactionLogs
                  ? openExceptionInLogs
                  : undefined
            }
            hasBlockingWarnings={gateResult.hasBlockingWarnings}
            hasExceptionBlockers={gateResult.hasExceptionBlockers}
            financeWarningAcknowledged={financeWarningAcknowledged}
            onFinanceWarningChange={setFinanceWarningAcknowledged}
            needsSecondApprover={needsSecondApprover(strip.totalSpend, secondApproverThreshold)}
            secondApproverThreshold={secondApproverThreshold}
            secondApproverConfirmed={secondApproverConfirmed}
            secondApproveBusy={secondApproveBusy}
            dualApprovalUiMode={dualApprovalUiMode}
            onRecordSecondApproval={() => void handleRecordSecondApproval()}
            onExportCsv={exportSettlementCsv}
            onDownloadEvidencePack={() => void handleDownloadEvidencePack()}
            settlementRows={settlementRows}
          />
        )}
      </div>

        {/* Sticky footer — always visible Continue (Finalize uses hero CTA) */}
      <FuelPeriodWizardContinueFooter
        isLast={isLast}
        canContinue={canContinue}
        activeStepId={activeStepId}
        leakageReviewed={leakageReviewed}
        continueLabel={continueLabel}
        onContinue={handleContinue}
      />
      </FuelPeriodWizardBodyGate>
    </div>
  );
}

export function FuelPeriodWizard(props: FuelPeriodWizardProps) {
  return <FuelPeriodWizardInner {...props} />;
}
