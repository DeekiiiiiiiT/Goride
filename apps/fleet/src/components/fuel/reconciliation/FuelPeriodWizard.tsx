import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { ShieldCheck } from 'lucide-react';
import { FuelPeriodStepper } from './FuelPeriodStepper';
import { FuelWeekMoneyStrip } from './FuelWeekMoneyStrip';
import { FuelWizardProgressPill } from './FuelWizardProgressPill';
import {
  FuelWizardOverflowMenu,
  type FuelWizardOverflowMenuHandle,
} from './FuelWizardOverflowMenu';
import { FuelDataQualityStep } from './FuelDataQualityStep';
import { FuelExceptionBlockersPanel } from './FuelExceptionBlockersPanel';
import { FuelUnapprovedTxBlockersPanel } from './FuelUnapprovedTxBlockersPanel';
import { useFuelWeekReports } from '../../../hooks/useFuelWeekReports';
import {
  fuelWeekHasDegradedInputs,
  type FuelWeekDegradedInputs,
} from '../../../utils/buildFuelWeekReportsForFinalize';
import { type FuelWizardDriver } from './buildFuelWizardRows';
import { useFuelWizardDerived } from './useFuelWizardDerived';
import { type FuelExceptionBlocker } from '../../../utils/fuelFinalizeGating';
import {
  fuelWeekClosableBlockerMessage,
  reportsHaveOdometerChainUnusable,
} from '../../../utils/fuelWeekClosableGate';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import {
  isUnattributedBeyondGate,
  validateDisposition,
  type FuelResidualDisposition,
} from '@roam/fuel-core';
import {
  FUEL_STEP_LABELS,
  FUEL_STEP_ORDER,
  clampFuelStepToGates,
  pickInitialFuelStep,
  type FuelStepId,
} from '../../../utils/fuelPeriodGating';
import { type FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { isEntryInInclusiveYmdRange } from '../../../utils/fuelWeekPeriod';
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
  loadWizardStepNotes,
  materializeWizardPeriodCounts,
  persistLeakageReviewToServer,
  persistWizardStep,
  recordWizardSecondApproval,
} from './useFuelWizardActions';
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
import type { FinancialTransaction, Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { FUEL_STEP_ICONS } from '../../../utils/fuelStepIcons';
import { loadFuelLeakageReview } from '../../../utils/fuelLeakageReviewStore';
import {
  parseDataQualityVehicleReviews,
  reviewedVehicleIdSet,
} from '../../../utils/fuelDataQualityReview';

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
  /** Pending fuel Expense txs — Finalize hard-block (F3). */
  transactions?: FinancialTransaction[];
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
  /** Jump to Review Queue for unapproved reimbursements. */
  onOpenReviewQueue?: () => void;
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
  transactions = [],
  dateRange,
  onBack,
  onRefresh,
  onFinalize,
  onAddAdjustment,
  onResolveDispute,
  onOpenTransactionLogs,
  onOpenReviewQueue,
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
  const [odometerChainReviewed, setOdometerChainReviewed] = useState(false);
  const [odometerChainNoteDraft, setOdometerChainNoteDraft] = useState('');
  const [unattributedReviewed, setUnattributedReviewed] = useState(false);
  const [unattributedNoteDraft, setUnattributedNoteDraft] = useState('');
  /** Cash-desk: flagged vehicles marked reviewed this week */
  const [dqReviewedVehicleIds, setDqReviewedVehicleIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [serverPeriodVersion, setServerPeriodVersion] = useState<number | null>(null);
  const [secondApproverThreshold, setSecondApproverThreshold] = useState(
    FUEL_SECOND_APPROVER_THRESHOLD,
  );
  const [dualApprovalUiMode, setDualApprovalUiMode] =
    useState<FuelDualApprovalUiMode>('human');
  const [exceptionBusyId, setExceptionBusyId] = useState<string | null>(null);
  const [stepNoteDraft, setStepNoteDraft] = useState('');
  const [leakageDisposition, setLeakageDisposition] = useState<FuelResidualDisposition | ''>('');
  const [stepNotes, setStepNotes] = useState<Array<{ step: string; note: string; at: string }>>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [gateLiveMessage, setGateLiveMessage] = useState('');

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

  const weekFuelEntries = useMemo(
    () =>
      fuelEntries.filter((e) =>
        isEntryInInclusiveYmdRange(e.date, period.startDate, period.endDate),
      ),
    [fuelEntries, period.startDate, period.endDate],
  );

  const weekReports = useFuelWeekReports({
    weekStartYmd: period.startDate,
    weekEndYmd: period.endDate,
    vehicles,
    drivers,
    fuelEntries: weekFuelEntries,
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
  const weekDegraded: FuelWeekDegradedInputs | undefined = weekReports.degraded;
  const hasDegradedInputs = fuelWeekHasDegradedInputs(weekDegraded);

  const {
    vehicleSnaps,
    openDisputes,
    settlementRows,
    counts,
    gatedStates,
    strip,
    qualityRows,
    breakdownRows,
    leakageRows,
    policyRows,
    priorMedian,
    gateResult,
    closableBlockers,
    exceptionBlockers,
    unapprovedFuelTxBlockers,
    plateByVehicleId,
    canContinue,
    stepIndex,
    isLast,
    weekIsEmpty,
  } = useFuelWizardDerived({
    periodStart: period.startDate,
    periodEnd: period.endDate,
    periodLocked,
    activeStepId,
    leakageReviewed,
    odometerChainReviewed,
    unattributedReviewed,
    dataQualityReviewedVehicleIds: dqReviewedVehicleIds,
    vehicles,
    drivers,
    fuelEntries,
    disputes,
    scenarios,
    fuelCards,
    finalizedReports,
    liveReports,
    weekTrips,
    weekLoading: weekReports.loading,
    weekError: Boolean(weekReports.error),
    transactions,
    countsUnevaluated: !period.counts || Object.keys(period.counts).length === 0,
    degradedInputs: hasDegradedInputs,
    periodTotalSpend: period.totalSpend,
    periodUnexplained: period.netLeakage,
  });

  const needsOdometerChainAck = reportsHaveOdometerChainUnusable(liveReports);
  const needsUnattributedAck = isUnattributedBeyondGate(
    strip.totalSpend,
    strip.unattributedFill,
  );

  // Cash-desk + thin odometer chain: footer Continue stays locked until acks done
  const canContinueStep =
    canContinue &&
    !(activeStepId === 'data-quality' && needsOdometerChainAck && !odometerChainReviewed);

  // Fresh walkthrough on period open or after Reopen week
  useEffect(() => {
    setShowGapDetail(false);
    setShowCostBreakdown(false);
    setBucketVehicleId(null);
    setLeakageReviewMeta({});
    // Prefer locked / explicit deep-link; otherwise wait for server hydrate (H9) before pickInitial.
    if (sessionKey > 0 || periodLocked) {
      const startId: FuelStepId = periodLocked
        ? 'finalize'
        : clampFuelStepToGates(initialStepId, gatedStates);
      setActiveStepId(startId);
      setProgressIndex(
        periodLocked ? FUEL_STEP_ORDER.length - 1 : Math.max(0, FUEL_STEP_ORDER.indexOf(startId)),
      );
      setLeakageReviewed(periodLocked);
      setOdometerChainReviewed(periodLocked);
      setUnattributedReviewed(periodLocked);
      setDqReviewedVehicleIds(new Set());
      return;
    }
    if (initialStepId && FUEL_STEP_ORDER.includes(initialStepId)) {
      // M-5: deep-link cannot jump past incomplete prior steps.
      const clamped = clampFuelStepToGates(initialStepId, gatedStates);
      setActiveStepId(clamped);
      setProgressIndex(FUEL_STEP_ORDER.indexOf(clamped));
      return;
    }
    // Offline fallback until hydrate; local cache must not win over server SoT.
    const local = loadFuelLeakageReview(period.startDate);
    setLeakageReviewed(Boolean(local));
    if (local) {
      setLeakageReviewMeta({ at: local.reviewedAt, by: local.actorLabel, note: local.note });
    }
    const initial = clampFuelStepToGates(undefined, gatedStates);
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

  // C-3: keep SQL counts/money in sync so auto-close is not stuck on counts_unevaluated.
  useEffect(() => {
    if (periodLocked || weekReports.loading || weekIsEmpty) return;
    void materializeWizardPeriodCounts({
      serverPeriodId,
      weekStart: period.startDate,
      weekEnd: period.endDate,
      setServerPeriodId,
      strip,
      vehicleCount: vehicleSnaps.length,
      degradedInputs: hasDegradedInputs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.id, periodLocked, weekReports.loading, weekIsEmpty, strip.totalSpend, strip.leakage]);

  // H8/H9 + NEW-6 + P-9: week bundle is SoT for chrome (period, step notes, second approve).
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

        let hit: {
          id?: string;
          leakageReviewedAt?: string | null;
          leakageReviewedBy?: string | null;
          leakageReviewedNote?: string | null;
          odometerChainReviewedAt?: string | null;
          unattributedReviewedAt?: string | null;
          dataQualityVehicleReviews?: unknown;
          currentStep?: string | null;
        } | null = null;
        let notes: Array<{ step: string; note: string; at: string }> = [];
        let actors: string[] = [];

        try {
          const bundle = await api.getFuelWeekBundle(period.startDate);
          if (cancelled) return;
          const p = bundle.period as Record<string, unknown> | null;
          if (p?.id) {
            hit = {
              id: String(p.id),
              leakageReviewedAt: (p.leakageReviewedAt as string) || null,
              leakageReviewedBy: (p.leakageReviewedBy as string) || null,
              leakageReviewedNote: (p.leakageReviewedNote as string) || null,
              odometerChainReviewedAt: (p.odometerChainReviewedAt as string) || null,
              unattributedReviewedAt: (p.unattributedReviewedAt as string) || null,
              dataQualityVehicleReviews: p.dataQualityVehicleReviews,
              currentStep: (p.currentStep as string) || null,
            };
            notes = Array.isArray(bundle.stepNotes) ? bundle.stepNotes : [];
            actors = Array.isArray(bundle.secondApproveActorIds)
              ? bundle.secondApproveActorIds.map(String).filter(Boolean)
              : [];
          }
        } catch {
          /* fall through to list + evidence pack */
        }

        if (!hit?.id) {
          const rows = await api.listFuelReconciliationPeriods({
            from: period.startDate,
            to: period.startDate,
          });
          const row = rows.find((r) => String(r.weekStart).split('T')[0] === period.startDate);
          if (cancelled || !row?.id) return;
          hit = row;
          const loaded = await loadWizardStepNotes(row.id);
          if (cancelled) return;
          notes = loaded.notes;
          actors = loaded.actors;
        }

        if (cancelled || !hit?.id) return;
        setServerPeriodId(hit.id);
        const hitVersion = Number((hit as { version?: number }).version);
        if (Number.isFinite(hitVersion) && hitVersion > 0) {
          setServerPeriodVersion(hitVersion);
        }

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
        if (hit.odometerChainReviewedAt) {
          setOdometerChainReviewed(true);
        } else if (!periodLocked) {
          setOdometerChainReviewed(false);
        }
        if (hit.unattributedReviewedAt) {
          setUnattributedReviewed(true);
        } else if (!periodLocked) {
          setUnattributedReviewed(false);
        }

        const dqReviews = parseDataQualityVehicleReviews(
          (hit as { dataQualityVehicleReviews?: unknown }).dataQualityVehicleReviews,
        );
        if (periodLocked) {
          // Locked: treat all as reviewed for chip calm
          setDqReviewedVehicleIds(new Set());
        } else {
          setDqReviewedVehicleIds(reviewedVehicleIdSet(dqReviews));
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

        setSecondApproveActors(actors);
        // U-10: seed durable notes from bundle/audit; draft for restored step if present.
        setStepNotes(notes);
        const restoredStep =
          !periodLocked &&
          !initialStepId &&
          hit.currentStep &&
          FUEL_STEP_ORDER.includes(hit.currentStep as FuelStepId)
            ? (hit.currentStep as FuelStepId)
            : initialStepId && FUEL_STEP_ORDER.includes(initialStepId)
              ? initialStepId
              : null;
        if (restoredStep) {
          const latestForDraft = [...notes].reverse().find((n) => n.step === restoredStep);
          if (latestForDraft?.note) setStepNoteDraft(latestForDraft.note);
        }
        if (hit.leakageReviewedAt) {
          setLeakageReviewed(true);
          setLeakageReviewMeta({
            at: hit.leakageReviewedAt,
            by: hit.leakageReviewedBy,
            note: hit.leakageReviewedNote,
          });
        }
        if (hit.odometerChainReviewedAt) setOdometerChainReviewed(true);
        if (hit.unattributedReviewedAt) setUnattributedReviewed(true);
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

  const handleContinue = () => {
    if (!canContinueStep || isLast) return;
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
    const note = stepNoteDraft.trim();
    const validated = validateDisposition({
      disposition: leakageDisposition,
      note,
      requireNoteMinLength: 8,
    });
    if (!validated.ok) {
      toast.error(
        validated.error === 'invalid_disposition'
          ? 'Choose a residual disposition before accepting.'
          : 'Add a short reason (8+ characters) before accepting unexplained fuel.',
      );
      return;
    }
    const meta = applyLocalLeakageReview({
      weekStart: period.startDate,
      note: validated.note,
      actorLabel: user?.email || user?.id || undefined,
      actorId: user?.id || user?.email || null,
    });
    setLeakageReviewed(true);
    setLeakageReviewMeta(meta);
    setStepNotes((prev) => [
      ...prev,
      { step: 'leakage-gap', note, at: new Date().toISOString() },
    ]);
    setStepNoteDraft('');
    void persistLeakageReviewToServer({
      serverPeriodId,
      weekStart: period.startDate,
      weekEnd: period.endDate,
      setServerPeriodId,
      disposition: validated.disposition,
      note: validated.note,
    });
    toast.success('Unexplained fuel marked reviewed');
  };

  const ensurePeriodId = async (): Promise<string | null> => {
    if (serverPeriodId) return serverPeriodId;
    try {
      const ensured = await api.ensureFuelReconciliationPeriod({
        weekStart: period.startDate,
        weekEnd: period.endDate,
      });
      const id = String((ensured as { id?: string })?.id || '');
      if (id) {
        setServerPeriodId(id);
        return id;
      }
    } catch {
      /* offline */
    }
    return null;
  };

  const handleAckOdometerChain = async () => {
    const note = odometerChainNoteDraft.trim();
    if (note.length < 8) {
      toast.error('Add a short reason (8+ characters) before acknowledging thin odometer chain.');
      return;
    }
    const periodId = await ensurePeriodId();
    if (!periodId) {
      toast.error('Could not open fuel period for review.');
      return;
    }
    try {
      await api.reviewFuelPeriodOdometerChain({ periodId, note });
      setOdometerChainReviewed(true);
      setOdometerChainNoteDraft('');
      toast.success('Thin odometer chain acknowledged');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save odometer chain review');
    }
  };

  const handleAckUnattributed = async () => {
    const note = unattributedNoteDraft.trim();
    if (note.length < 8) {
      toast.error('Add a short reason (8+ characters) before accepting fills without odometer.');
      return;
    }
    const periodId = await ensurePeriodId();
    if (!periodId) {
      toast.error('Could not open fuel period for review.');
      return;
    }
    try {
      await api.reviewFuelPeriodUnattributed({
        periodId,
        note,
        amount: strip.unattributedFill,
      });
      setUnattributedReviewed(true);
      setUnattributedNoteDraft('');
      toast.success('Fills without odometer accepted');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save unattributed review');
    }
  };

  const handleMarkDataQualityVehicle = async (vehicleId: string, note?: string) => {
    if (periodLocked || !vehicleId) return;
    setDqReviewedVehicleIds((prev) => {
      const next = new Set(prev);
      next.add(vehicleId);
      return next;
    });
    const periodId = await ensurePeriodId();
    if (!periodId) {
      toast.message('Marked on this device — open period when online to sync.');
      return;
    }
    try {
      const res = await api.reviewFuelPeriodDataQualityVehicle({
        periodId,
        vehicleId,
        note,
        version: serverPeriodVersion ?? undefined,
      });
      const reviews = parseDataQualityVehicleReviews(
        (res as { dataQualityVehicleReviews?: unknown })?.dataQualityVehicleReviews,
      );
      if (reviews.length) setDqReviewedVehicleIds(reviewedVehicleIdSet(reviews));
      const nextVer = Number((res as { version?: number }).version);
      if (Number.isFinite(nextVer) && nextVer > 0) setServerPeriodVersion(nextVer);
      toast.success('Vehicle marked reviewed');
    } catch (e: any) {
      if (e?.message === 'version_conflict') {
        toast.message('Period changed — refresh and try again.');
        return;
      }
      toast.message(e?.message || 'Saved locally — server sync failed.');
    }
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

  // Always re-gate from live fuelEntries via useFuelWizardDerived (not weekReports.gateResult cache).

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
    if (hasDegradedInputs) return;
    if (closableBlockers.length > 0) {
      const msg = fuelWeekClosableBlockerMessage(closableBlockers[0]);
      setGateLiveMessage(msg);
      toast.error(msg);
      return;
    }
    const gate = gateResult;
    if (gate.hasExceptionBlockers) {
      return;
    }
    // C-7: over-explained is HARD; under-explained requires leakage review first.
    if (gate.hasOverExplainedBlockers) {
      return;
    }
    if (gate.hasUnderExplainedBlockers && !leakageReviewed) {
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
            }
          : needsOdometerChainAck && !odometerChainReviewed
            ? {
                title: 'Thin odometer chain',
                body: 'Not enough odometered fills to measure tank timing. Acknowledge below to continue — categories stay as-is; timing carves stay $0.',
              }
          : (() => {
              const flaggedLeft = qualityRows.filter(
                (r) =>
                  !dqReviewedVehicleIds.has(r.id) &&
                  (r.healthStatus === 'Amber' ||
                    r.healthStatus === 'Red' ||
                    r.odometerIncomplete),
              ).length;
              return flaggedLeft === 0
                ? {
                    title: 'Data looks clear',
                    body: 'No flagged cars left on this step. Tap Continue to move forward.',
                  }
                : {
                    title: 'Review flagged vehicles',
                    body: `Look at the ${flaggedLeft} flagged car${flaggedLeft === 1 ? '' : 's'} below. If nothing looks wrong or you've added your notes, mark each reviewed, then tap Continue.`,
                  };
            })();
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
                  ? `Over-explained fuel ${formatFuelMoney(strip.leakage)} — categorized costs exceed gas-card spend. Check odometer/trips/policy, or accept below.`
                  : `Unexplained fuel ${formatFuelMoney(strip.leakage)} — charge stop-to-stop gaps if needed, or accept below.`,
              actionLabel: 'Mark reviewed',
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
            };
      case 'settlement-preview':
        return {
          title: 'Confirm settle-up for this week',
          body: 'Cash from earnings is a credit; driver’s fuel share is a charge. Net this week is what settles on pay.',
        };
      case 'finalize':
        return periodLocked
          ? {
              title: 'Week is locked',
              body: 'This period is finalized. Use Reopen week above to unlock it.',
              actionLabel: onResetPeriod ? 'Reopen week' : undefined,
              onAction: onResetPeriod,
            }
          : unapprovedFuelTxBlockers.length > 0
            ? (() => {
                const holds = unapprovedFuelTxBlockers.filter((b) => b.holdReason === 'station_hold')
                  .length;
                const actionable = unapprovedFuelTxBlockers.length - holds;
                if (actionable > 0) {
                  return {
                    title: 'Can’t finalize yet',
                    body: `Approve or reject ${actionable} Pending fuel receipt(s) in Review Queue${
                      holds > 0 ? ` (${holds} more await Station Database)` : ''
                    } — then Finalize.`,
                    actionLabel: onOpenReviewQueue ? 'Open Review Queue' : undefined,
                    onAction: onOpenReviewQueue,
                  };
                }
                return {
                  title: 'Can’t finalize yet',
                  body: `${holds} fuel receipt(s) await station match in Station Database. Review Queue cannot clear them.`,
                };
              })()
          : exceptionBlockers.length > 0
            ? {
                title: 'Can’t finalize yet',
                body: `Resolve the ${exceptionBlockers.length} exception fill(s) listed below in this week — then Finalize.`,
              }
            : gateResult.hasOverExplainedBlockers
            ? {
                title: 'Can’t finalize — over-explained week',
                body: `Unexplained fuel is ${
                  gateResult.overExplainedBlockers[0]?.pctOfSpend != null
                    ? `${gateResult.overExplainedBlockers[0].pctOfSpend}% of spend`
                    : 'beyond spend'
                }. Modelled category costs exceed gas-card spend — fix odometer / efficiency / distance inputs. This cannot be accepted away.`,
              }
            : gateResult.hasUnderExplainedBlockers && !leakageReviewed
            ? {
                title: 'Can’t finalize — under-explained week',
                body: `Unexplained fuel is ${
                  gateResult.underExplainedBlockers[0]?.pctOfSpend != null
                    ? `${gateResult.underExplainedBlockers[0].pctOfSpend}% of spend`
                    : 'beyond spend'
                }. Fuel spend is not fully explained — investigate missing litres / gaps, then accept Unexplained with a typed reason.`,
              }
            : hasDegradedInputs
            ? {
                title: 'Can’t finalize — incomplete inputs',
                body: 'Trips, deadhead, personal allowance, cards, or brain classify timed out or failed to load. Retry until provenance is complete — silent empty data must not change charges.',
                actionLabel: 'Retry week data',
                onAction: handleRetryWeek,
              }
            : {
                title: 'Ready to lock this week',
                body: 'Finalize posts pending fuel to settlements and freezes this week. If driver payouts already exist and the leftover would change, you will confirm Reopen settlement first.',
                actionLabel: finalizing ? 'Finalizing…' : 'Finalize week',
                onAction: handleFinalizeClick,
                actionDisabled:
                  finalizing ||
                  liveReports.length === 0 ||
                  hasDegradedInputs ||
                  closableBlockers.length > 0 ||
                  !!gateResult.hasExceptionBlockers ||
                  !!gateResult.hasUnapprovedFuelTxBlockers ||
                  !!gateResult.hasOverExplainedBlockers ||
                  (!!gateResult.hasUnderExplainedBlockers && !leakageReviewed) ||
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
    canContinue: canContinueStep,
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
    activeStepId === 'leakage-gap'
      ? 'Continue to Settle-up'
      : activeStepId === 'settlement-preview'
        ? 'Continue to Finalize'
        : 'Continue';

  const moneyStripProps = {
    gasCard: strip.gasCard,
    cashFromEarnings: strip.cashFromEarnings,
    totalSpend: strip.totalSpend,
    company: strip.company,
    driver: strip.driver,
    leakage: strip.leakage,
    windowTiming: strip.windowTiming,
    unattributedFill: strip.unattributedFill,
    driverFromUnexplained: strip.driverFromUnexplained,
    priorMedian,
  };

  const overflowRef = useRef<FuelWizardOverflowMenuHandle>(null);

  const selectStep = (id: FuelStepId) => {
    const idx = FUEL_STEP_ORDER.indexOf(id);
    const state = stepperStates.find((s) => s.id === id);
    if (!state || state.locked) return;
    setActiveStepId(id);
    if (idx > progressIndex) setProgressIndex(idx);
    persistStep(id, stepNoteDraft.trim() || undefined);
  };

  return (
    <div className="space-y-4 pb-28 md:pb-8">
      <div className="flex items-start justify-between gap-3">
        <FuelPeriodWizardHeader
          period={period}
          periodLocked={periodLocked}
          onBack={onBack}
        />
        <div className="shrink-0 pt-1">
          <FuelWizardOverflowMenu
            ref={overflowRef}
            periodLocked={periodLocked}
            onRefresh={onRefresh}
            onResetPeriod={onResetPeriod}
            stepNoteDraft={stepNoteDraft}
            onStepNoteChange={setStepNoteDraft}
            onStepNoteBlur={() =>
              persistStep(activeStepId, stepNoteDraft.trim() || undefined)
            }
          />
        </div>
      </div>

      <FuelPeriodWizardBodyGate
        loading={weekReports.loading}
        error={Boolean(weekReports.error)}
        empty={weekIsEmpty}
        updating={weekReports.updating}
        onRetry={handleRetryWeek}
      >
      {/* Stitch C desktop progress bar */}
      <div className="hidden md:block">
        <FuelWizardProgressPill
          activeStepId={activeStepId}
          states={stepperStates}
          variant="bar"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)] md:items-start md:gap-5">
        <div className="space-y-4">
          {/* Stitch B order: coach → money → steps → queue */}
          <FuelWizardStepHero
            title={stepHero.title}
            body={stepHero.body}
            actionLabel={stepHero.actionLabel}
            onAction={stepHero.onAction}
            actionDisabled={stepHero.actionDisabled}
            focusKey={activeStepId}
          />

          <div className="md:hidden">
            <FuelWeekMoneyStrip {...moneyStripProps} variant="collapsed" />
          </div>

          <div className="md:hidden">
            <FuelWizardProgressPill
              activeStepId={activeStepId}
              states={stepperStates}
              variant="timeline"
            />
          </div>

          <div className="hidden md:block">
            <FuelPeriodStepper
              states={stepperStates}
              activeStepId={activeStepId}
              onSelect={selectStep}
              labels={FUEL_STEP_LABELS}
              icons={FUEL_STEP_ICONS}
            />
          </div>

          <div className="sr-only" aria-live="assertive" aria-atomic="true">
            {gateLiveMessage}
          </div>

          <div className="space-y-3">
            {activeStepId === 'data-quality' && (
              <div className="space-y-4">
                <FuelUnapprovedTxBlockersPanel
                  blockers={unapprovedFuelTxBlockers}
                  onOpenReviewQueue={onOpenReviewQueue}
                />
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
                  showBreakdown={showCostBreakdown}
                  onToggleBreakdown={() => setShowCostBreakdown((v) => !v)}
                  onAddAdjustment={onAddAdjustment}
                  needsOdometerChainAck={needsOdometerChainAck}
                  odometerChainReviewed={odometerChainReviewed}
                  odometerChainNote={odometerChainNoteDraft}
                  onOdometerChainNoteChange={setOdometerChainNoteDraft}
                  onAckOdometerChain={() => void handleAckOdometerChain()}
                  reviewedVehicleIds={dqReviewedVehicleIds}
                  onMarkReviewed={(id) => void handleMarkDataQualityVehicle(id)}
                  weekFuelEntries={weekFuelEntries}
                  weekStartYmd={period.startDate}
                  weekEndYmd={period.endDate}
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
                totalSpend={strip.totalSpend}
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
                transactions={transactions}
                leakageDisposition={leakageDisposition}
                onLeakageDispositionChange={setLeakageDisposition}
                acceptNote={stepNoteDraft}
                onAcceptNoteChange={setStepNoteDraft}
                onAcceptNoteBlur={() =>
                  persistStep(activeStepId, stepNoteDraft.trim() || undefined)
                }
                unattributedFill={strip.unattributedFill}
                needsUnattributedAck={needsUnattributedAck}
                unattributedReviewed={unattributedReviewed}
                unattributedNote={unattributedNoteDraft}
                onUnattributedNoteChange={setUnattributedNoteDraft}
                onAckUnattributed={() => void handleAckUnattributed()}
              />
            )}

            {activeStepId === 'settlement-preview' && (
              <FuelSettlementPreviewStep rows={settlementRows} onExport={exportSettlementCsv} />
            )}

            {activeStepId === 'finalize' && (
              <FuelFinalizeStep
                periodLocked={periodLocked}
                exceptionBlockers={exceptionBlockers}
                unapprovedFuelTxBlockers={unapprovedFuelTxBlockers}
                onOpenReviewQueue={onOpenReviewQueue}
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
                hasUnapprovedFuelTxBlockers={gateResult.hasUnapprovedFuelTxBlockers}
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
                provenance={{
                  tripCount: weekTrips.length,
                  tripsTimedOut: Boolean(weekDegraded?.trips),
                  deadheadTimedOut: Boolean(weekDegraded?.deadhead),
                  personalAllowanceTimedOut: Boolean(weekDegraded?.personalAllowance),
                  brainTimedOut: Boolean(weekDegraded?.brain),
                  fuelCardsLoaded: (fuelCards || []).length,
                  fuelCardsMissing: Boolean(weekDegraded?.fuelCards),
                  vehicleCount: vehicles.length,
                }}
              />
            )}
          </div>

          <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-slate-400 md:justify-start">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Reconciliation can be reopened at any time until closed
          </p>
        </div>

        <div className="hidden md:sticky md:top-4 md:block">
          <FuelWeekMoneyStrip {...moneyStripProps} variant="rail" />
        </div>
      </div>

      <FuelPeriodWizardContinueFooter
        isLast={isLast}
        canContinue={canContinueStep}
        activeStepId={activeStepId}
        leakageReviewed={leakageReviewed}
        continueLabel={continueLabel}
        onContinue={handleContinue}
        onAddNote={() => overflowRef.current?.openNote()}
      />
      </FuelPeriodWizardBodyGate>
    </div>
  );
}

export function FuelPeriodWizard(props: FuelPeriodWizardProps) {
  return <FuelPeriodWizardInner {...props} />;
}
