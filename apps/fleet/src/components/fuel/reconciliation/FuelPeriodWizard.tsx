import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Flag,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { DateRange } from 'react-day-picker';
import { BucketReconciliationView } from '../BucketReconciliationView';
import { FuelCoverageMatrix } from '../FuelCoverageMatrix';
import { FuelPeriodStepper } from './FuelPeriodStepper';
import { FuelWeekMoneyStrip } from './FuelWeekMoneyStrip';
import { FuelDataQualityStep, type FuelQualityRow } from './FuelDataQualityStep';
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
import { FuelGapAttribution } from './FuelGapAttribution';
import { FuelFinalizeStep } from './FuelFinalizeStep';
import { unexplainedLabel } from '../../../utils/fuelReconGlossary';
import {
  hasDistinctSecondApprove,
  needsSecondApprover,
  FUEL_SECOND_APPROVER_THRESHOLD,
  resolveFuelSecondApproverThreshold,
} from '../../../utils/fuelDualApproval';
import { downloadFuelEvidencePack } from '../../../utils/fuelEvidencePack';
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
import { UNASSIGNED_FUEL_DRIVER_ID } from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { FUEL_STEP_ICONS } from '../../../utils/fuelStepIcons';
import {
  loadFuelLeakageReview,
  saveFuelLeakageReview,
} from '../../../utils/fuelLeakageReviewStore';
import { pickScenarioForDriverMembership, resolveDriverVersionForWeek } from '../../../utils/fuelPolicyVersion';

/** Fleet driver row — typed for wizard display (M16). */
export type FuelWizardDriver = {
  id: string;
  driverId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fuelScenarioId?: string;
};

function resolveDriverDisplayName(
  report: WeeklyFuelReport | undefined,
  vehicle: Vehicle | undefined,
  drivers: FuelWizardDriver[],
): string {
  if (report?.driverId === UNASSIGNED_FUEL_DRIVER_ID) return 'Unassigned fills';
  const driverId = report?.driverId;
  const reportDriver = driverId
    ? drivers.find((d) => d.id === driverId || d.driverId === driverId)
    : null;
  return (
    reportDriver?.name ||
    [reportDriver?.firstName, reportDriver?.lastName].filter(Boolean).join(' ') ||
    vehicle?.currentDriverName ||
    'Unknown driver'
  );
}

/** Stitch-style instruction hero — one job per step. */
function StepHero({
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 border-l-4 border-l-[#3525cd] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{body}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          className="min-h-11 shrink-0 bg-[#3525cd] text-white hover:bg-[#2a1ea4] sm:min-h-11"
          disabled={actionDisabled}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function CompactVehicleList({
  rows,
}: {
  rows: {
    id: string;
    title: string;
    subtitle?: string;
    right?: string;
    badge?: string;
    warn?: boolean;
  }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">
        <Check className="mx-auto mb-2 h-5 w-5" />
        Nothing left on this step.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{r.title}</div>
            {r.subtitle && <div className="text-xs text-slate-500">{r.subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.badge && (
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  r.warn
                    ? 'border-[#684000]/30 bg-[#ffddb8] text-[#684000]'
                    : ''
                }`}
              >
                {r.badge}
              </Badge>
            )}
            {r.right && (
              <span
                className={`text-sm font-semibold ${
                  r.warn ? 'text-[#684000]' : 'text-slate-800'
                }`}
              >
                {r.right}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

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
  const [leakageReviewed, setLeakageReviewed] = useState(() =>
    Boolean(loadFuelLeakageReview(period.startDate)),
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
  const [secondApproverThreshold, setSecondApproverThreshold] = useState(
    FUEL_SECOND_APPROVER_THRESHOLD,
  );
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
  const settlementRows = useMemo(() => {
    return liveReports
      .filter((r) => r.totalGasCardCost > FUEL_SPEND_EPS)
      .map((r) => {
        const v = vehicles.find((x) => x.id === r.vehicleId);
        const cashFromEarnings = sumPaidByDriverForReport(fuelEntries, r, vehicles, {
          vehicles,
          fuelCards,
          trips: weekTrips,
        });
        return {
          id: r.driverId || r.vehicleId,
          plate: v?.licensePlate || r.vehicleId,
          cashFromEarnings,
          driverShare: r.driverShare,
          netPay: cashFromEarnings - r.driverShare,
          pending: r.pendingCount || 0,
          status: periodLocked ? 'Locked' : (r.pendingCount || 0) > 0 ? 'Pending' : 'Draft',
        };
      });
  }, [liveReports, vehicles, fuelEntries, periodLocked, weekTrips, fuelCards]);

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
    const persisted = loadFuelLeakageReview(period.startDate);
    setLeakageReviewed(Boolean(persisted) || periodLocked);
    setShowGapDetail(false);
    setShowCostBreakdown(false);
    setBucketVehicleId(null);
    if (sessionKey > 0 || periodLocked) {
      const startId: FuelStepId = periodLocked ? 'finalize' : initialStepId || 'data-quality';
      setActiveStepId(startId);
      setProgressIndex(
        periodLocked ? FUEL_STEP_ORDER.length - 1 : Math.max(0, FUEL_STEP_ORDER.indexOf(startId)),
      );
      return;
    }
    if (initialStepId && FUEL_STEP_ORDER.includes(initialStepId)) {
      setActiveStepId(initialStepId);
      setProgressIndex(FUEL_STEP_ORDER.indexOf(initialStepId));
      return;
    }
    const initial = pickInitialFuelStep(gatedStates);
    const idx = FUEL_STEP_ORDER.indexOf(initial);
    setActiveStepId(initial);
    setProgressIndex(Math.max(0, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.id, sessionKey, initialStepId]);

  // H8/H9 + NEW-6: server period is SoT for leakage review + second approval
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await api.getPreferences().catch(() => null);
        if (!cancelled && prefs) {
          setSecondApproverThreshold(
            resolveFuelSecondApproverThreshold((prefs as any)?.fuelSecondApproverThreshold),
          );
        }
        const rows = await api.listFuelReconciliationPeriods({
          from: period.startDate,
          to: period.startDate,
        });
        const hit = rows.find((r) => String(r.weekStart).split('T')[0] === period.startDate);
        if (cancelled || !hit?.id) return;
        setServerPeriodId(hit.id);
        if (hit.leakageReviewedAt) setLeakageReviewed(true);
        const pack = await api.getFuelPeriodEvidencePack(hit.id);
        if (cancelled) return;
        const actors = ((pack?.audit || []) as Array<{ action?: string; actor_id?: string }>)
          .filter((a) => a.action === 'second_approve')
          .map((a) => String(a.actor_id || ''))
          .filter(Boolean);
        setSecondApproveActors(actors);
        if (pack?.period?.leakageReviewedAt) setLeakageReviewed(true);
      } catch {
        /* offline — local leakage cache still applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period.startDate, period.endDate, sessionKey]);

  const refreshSecondApprovals = async (periodId: string) => {
    const pack = await api.getFuelPeriodEvidencePack(periodId);
    const actors = ((pack?.audit || []) as Array<{ action?: string; actor_id?: string }>)
      .filter((a) => a.action === 'second_approve')
      .map((a) => String(a.actor_id || ''))
      .filter(Boolean);
    setSecondApproveActors(actors);
  };
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

  const strip = useMemo(() => {
    // C3: money strip aggregates from driver-week reports (once each), never per-vehicle snaps
    const paidByDriverCtx = { vehicles, fuelCards, trips: weekTrips };
    let gasCard = 0;
    let cashFromEarnings = 0;
    let totalSpend = 0;
    let company = 0;
    let driver = 0;
    let leakage = 0;
    for (const r of liveReports) {
      gasCard += sumGasCardSpendForReport(fuelEntries, r, vehicles, paidByDriverCtx);
      cashFromEarnings += sumPaidByDriverForReport(fuelEntries, r, vehicles, paidByDriverCtx);
      totalSpend += Number(r.totalGasCardCost) || 0;
      company += Number(r.companyShare) || 0;
      driver += Number(r.driverShare) || 0;
      leakage += Number(r.miscellaneousCost) || 0;
    }
    return { totalSpend, gasCard, cashFromEarnings, company, driver, leakage };
  }, [liveReports, fuelEntries, vehicles, fuelCards, weekTrips]);

  const toQualityRow = (v: (typeof vehicleSnaps)[number]): FuelQualityRow => {
    const vehicle = vehicles.find((x) => x.id === v.vehicleId);
    return {
      id: v.vehicleId,
      plate: v.plate,
      driverName: resolveDriverDisplayName(v.report, vehicle, drivers),
      healthStatus: (v.healthStatus as FuelQualityRow['healthStatus']) || undefined,
      pendingCount: v.pendingCount,
      totalSpend: v.totalSpend,
      companyShare: v.companyShare,
      driverShare: v.driverShare,
      cashFromEarnings: v.driverSpend,
      netPay: v.netPay,
      misc: v.misc,
      subtitle: [
        v.healthStatus && v.healthStatus !== 'Emerald' ? v.healthStatus : null,
        v.pendingCount > 0 ? `${v.pendingCount} pending log(s)` : null,
        v.odometerIncomplete ? 'Incomplete odometer data — unexplained fuel may be inflated' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  };

  const qualityRows: FuelQualityRow[] = vehicleSnaps
    .filter(
      (v) =>
        v.pendingCount > 0 ||
        (v.healthStatus && v.healthStatus !== 'Emerald') ||
        v.odometerIncomplete,
    )
    .map(toQualityRow);

  const breakdownRows: FuelQualityRow[] = vehicleSnaps
    .filter((v) => v.totalSpend > FUEL_SPEND_EPS)
    .map(toQualityRow);

  // openDisputes comes from buildFuelVehicleSnapshots (same matcher as landing/bulk)

  const leakageRows = vehicleSnaps
    .filter((v) => Math.abs(v.misc) > FUEL_SPEND_EPS)
    .map((v) => ({
      id: v.vehicleId,
      title: v.plate,
      subtitle:
        v.misc < 0
          ? 'Over-explained — categorized km exceed fuel bought'
          : v.odometerIncomplete
            ? 'Incomplete odometer data — unexplained fuel may be inflated'
            : v.healthStatus && v.healthStatus !== 'Emerald'
              ? String(v.healthStatus)
              : 'Unexplained fuel',
      right: formatFuelMoney(v.misc),
      badge: v.misc < 0 ? 'Over-explained' : 'Unexplained',
      warn: true,
    }));

  const policyRows = useMemo(() => {
    return vehicles
      .filter((v) => vehicleSnaps.some((s) => s.vehicleId === v.id && s.totalSpend > FUEL_SPEND_EPS))
      .map((v) => {
        const live = liveReports.find(
          (r) => r.vehicleId === v.id || (r.vehicleIds || []).includes(v.id),
        );
        const driverId = live?.driverId;
        const hit = resolveDriverVersionForWeek(scenarios, driverId, period.startDate);
        const scenario = hit
          ? { ...hit.scenario, rules: hit.version.rules }
          : pickScenarioForDriverMembership(scenarios, driverId, period.startDate);
        const fuelRule = scenario?.rules?.find((r) => r.category === 'Fuel');
        return {
          vehicle: v,
          scenario,
          fuelRule,
          effectiveFrom: hit?.version.effectiveFrom,
        };
      });
  }, [vehicles, scenarios, vehicleSnaps, period.startDate, liveReports]);

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
      void api
        .listFuelReconciliationPeriods({ from: period.startDate, to: period.startDate })
        .then((rows) => {
          const hit = rows.find((r) => String(r.weekStart).split('T')[0] === period.startDate);
          if (hit?.id) {
            setServerPeriodId(hit.id);
            return api.updateFuelPeriodStep({
              periodId: hit.id,
              step: next,
              note: noteForStep || undefined,
            });
          }
        })
        .catch(() => undefined);
    }
  };

  const handleMarkLeakageReviewed = () => {
    const note =
      stepNoteDraft.trim() || 'Accepted unexplained / over-explained fuel for this week';
    saveFuelLeakageReview(period.startDate, { note });
    setLeakageReviewed(true);
    if (stepNoteDraft.trim()) {
      setStepNotes((prev) => [
        ...prev,
        { step: 'leakage-gap', note: stepNoteDraft.trim(), at: new Date().toISOString() },
      ]);
      setStepNoteDraft('');
    }
    void (async () => {
      try {
        const ensured =
          serverPeriodId
            ? { id: serverPeriodId }
            : await api.ensureFuelReconciliationPeriod({
                weekStart: period.startDate,
                weekEnd: period.endDate,
              });
        if (ensured?.id) {
          setServerPeriodId(ensured.id);
          await api.reviewFuelPeriodLeakage({ periodId: ensured.id, note });
        }
      } catch (e: any) {
        toast.message('Saved on this device — server sync failed. Retry when online.');
      }
    })();
    const settlementIdx = FUEL_STEP_ORDER.indexOf('settlement-preview');
    setProgressIndex(Math.max(progressIndex, settlementIdx));
    setActiveStepId('settlement-preview');
  };

  const handleRecordSecondApproval = async () => {
    setSecondApproveBusy(true);
    try {
      const ensured =
        serverPeriodId
          ? { id: serverPeriodId }
          : await api.ensureFuelReconciliationPeriod({
              weekStart: period.startDate,
              weekEnd: period.endDate,
            });
      if (!ensured?.id) throw new Error('Period missing');
      setServerPeriodId(ensured.id);
      await api.secondApproveFuelPeriod({
        periodId: ensured.id,
        note: stepNoteDraft.trim() || undefined,
      });
      await refreshSecondApprovals(ensured.id);
      toast.success('Second approval recorded for your identity.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not record second approval');
    } finally {
      setSecondApproveBusy(false);
    }
  };

  const handleDownloadEvidencePack = async () => {
    try {
      if (serverPeriodId) {
        const pack = await api.getFuelPeriodEvidencePack(serverPeriodId);
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fuel-evidence-${period.startDate}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      /* fall through to client pack */
    }
    downloadFuelEvidencePack({
      weekLabel: period.label,
      weekStart: period.startDate,
      weekEnd: period.endDate,
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
    if (needsSecondApprover(strip.totalSpend, secondApproverThreshold) && !secondApproverConfirmed) {
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
                  ? `${strip.leakage < 0 ? 'Over-explained' : 'Unexplained'} fuel ${formatFuelMoney(strip.leakage)} marked reviewed on this device.`
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
                  (needsSecondApprover(strip.totalSpend, secondApproverThreshold) &&
                    !secondApproverConfirmed),
              };
      default:
        return { title: '', body: '' };
    }
  })();

  const priorMedian = useMemo(() => {
    const byWeek = new Map<string, { spend: number; unexplained: number }>();
    for (const f of finalizedReports) {
      const wk = String(f.weekStart || '').split('T')[0];
      if (!wk || wk >= period.startDate) continue;
      const cur = byWeek.get(wk) || { spend: 0, unexplained: 0 };
      cur.spend += Number(f.totalGasCardCost) || 0;
      cur.unexplained += Number(f.miscellaneousCost) || 0;
      byWeek.set(wk, cur);
    }
    const weeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4);
    if (!weeks.length) return undefined;
    const spends = weeks.map(([, v]) => v.spend).sort((a, b) => a - b);
    const unex = weeks.map(([, v]) => v.unexplained).sort((a, b) => a - b);
    const mid = Math.floor(spends.length / 2);
    return {
      totalSpend: spends.length % 2 ? spends[mid] : (spends[mid - 1] + spends[mid]) / 2,
      unexplained: unex.length % 2 ? unex[mid] : (unex[mid - 1] + unex[mid]) / 2,
    };
  }, [finalizedReports, period.startDate]);

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      const queueLen =
        activeStepId === 'data-quality'
          ? qualityRows.length
          : activeStepId === 'adjustments-disputes'
            ? openDisputes.length
            : activeStepId === 'leakage-gap'
              ? leakageRows.length
              : settlementRows.length;
      if (e.key === 'j' && queueLen > 0) {
        e.preventDefault();
        setQueueIndex((i) => (i + 1) % queueLen);
      } else if (e.key === 'k' && queueLen > 0) {
        e.preventDefault();
        setQueueIndex((i) => (i - 1 + queueLen) % queueLen);
      } else if (e.key === 'a' && activeStepId === 'leakage-gap' && !periodLocked && !leakageReviewed) {
        e.preventDefault();
        handleMarkLeakageReviewed();
      } else if (e.key === 'Enter' && canContinue && !isLast) {
        e.preventDefault();
        handleContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queue handlers use latest closures via active step
  }, [
    activeStepId,
    qualityRows.length,
    openDisputes.length,
    leakageRows.length,
    settlementRows.length,
    periodLocked,
    leakageReviewed,
    canContinue,
    isLast,
  ]);

  const continueLabel =
    activeStepId === 'leakage-gap' ? 'Continue to Settlement' : 'Continue';

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 flex min-h-11 items-center text-sm font-medium text-slate-500 transition-colors hover:text-[#3525cd]"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Periods
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{period.label}</h2>
            <Badge
              variant={periodLocked ? 'secondary' : 'outline'}
              className="uppercase tracking-wider"
            >
              {periodLocked ? 'Locked' : 'Draft'}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onResetPeriod && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 sm:min-h-11"
              onClick={onResetPeriod}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Reopen week
            </Button>
          )}
        </div>
      </div>

      {/* M11: error/empty replace the wizard body — never show $0.00 beside a failure */}
      {weekReports.loading ? (
        <div
          className="rounded-lg border border-slate-200 bg-white px-4 py-16 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#3525cd]" />
          <p className="text-sm text-slate-500">Loading week data…</p>
        </div>
      ) : weekReports.error ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-10 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
          role="alert"
        >
          <p className="text-sm text-rose-800">
            Couldn’t load this week’s reconciliation. Figures are hidden until load succeeds — check your connection and try again.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-rose-200 bg-white text-rose-800 hover:bg-rose-50"
            onClick={handleRetryWeek}
          >
            Retry
          </Button>
        </div>
      ) : weekIsEmpty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
          No fuel spend for this week yet. Refresh after new fills post, or pick another period.
        </div>
      ) : (
        <>
      {weekReports.updating && (
        <p className="text-xs text-slate-500" role="status" aria-live="polite">
          Updating week figures…
        </p>
      )}

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
      <StepHero
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
          <div className="space-y-3">
            {openDisputes.length === 0 ? (
              <CompactVehicleList rows={[]} />
            ) : (
              <ul className="space-y-2">
                {openDisputes.map((d) => (
                  <Card key={d.id} className="rounded border border-slate-200">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="font-medium text-slate-900">{String(d.reason || 'Dispute')}</div>
                        <div className="text-xs text-slate-500">Vehicle {d.vehicleId}</div>
                      </div>
                      {!periodLocked && (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11 bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                          onClick={() => onResolveDispute(d)}
                        >
                          Resolve
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </ul>
            )}
            {!periodLocked && openDisputes.length === 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={onAddAdjustment}
              >
                Add Adjustment
              </Button>
            )}
          </div>
        )}

        {activeStepId === 'policy-check' && (
          <div className="space-y-2">
            {policyRows.length === 0 ? (
              <CompactVehicleList rows={[]} />
            ) : (
              policyRows.map(({ vehicle, scenario, fuelRule, effectiveFrom }) => (
                <Card key={vehicle.id} className="rounded border border-slate-200">
                  <CardContent className="space-y-2 p-4">
                    <div className="font-semibold text-slate-900">
                      {vehicle.licensePlate || vehicle.id}
                    </div>
                    <div className="text-sm text-slate-600">
                      {scenario?.name || 'No policy'}
                      {effectiveFrom && effectiveFrom > '2000-01-03' && (
                        <span className="ml-2 text-xs text-slate-400">· from {effectiveFrom}</span>
                      )}
                    </div>
                    <FuelCoverageMatrix rule={fuelRule} compact />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeStepId === 'leakage-gap' && (
          <div className="space-y-3">
            <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Vehicles with {unexplainedLabel(strip.leakage).toLowerCase()} gaps
            </h3>
            <CompactVehicleList rows={leakageRows} />
            <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
              {leakageRows.map((r, idx) => {
                const snap = vehicleSnaps.find((v) => v.vehicleId === r.id);
                return (
                  <div
                    key={r.id}
                    className={idx === queueIndex % Math.max(leakageRows.length, 1) ? 'rounded bg-indigo-50/80 p-1' : 'p-1'}
                  >
                    <FuelGapAttribution
                      vehicleId={r.id}
                      plate={r.title}
                      misc={snap?.misc || 0}
                      weekStart={period.startDate}
                      weekEnd={period.endDate}
                      fuelEntries={fuelEntries}
                      trips={weekTrips}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              Reviewed on this device until the week is locked on the server. Keys: j/k queue · a accept · Enter continue
            </p>
            {leakageRows.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setShowGapDetail((v) => !v)}
              >
                {showGapDetail ? 'Hide' : 'Show'} stop-to-stop gap detail
              </Button>
            )}
            {showGapDetail && bucketVehicle && (
              <Card className="rounded border border-slate-200">
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">
                      Stop-to-Stop — {bucketVehicle.licensePlate || bucketVehicle.id}
                    </h3>
                    {!periodLocked && (
                      <select
                        className="min-h-11 rounded border border-slate-200 px-2 py-1 text-sm"
                        value={bucketVehicle.id}
                        onChange={(e) => setBucketVehicleId(e.target.value)}
                      >
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.licensePlate || v.id}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <BucketReconciliationView
                    vehicle={bucketVehicle}
                    trips={trips}
                    fuelEntries={fuelEntries}
                    adjustments={adjustments}
                    dateRange={dateRange}
                    periodLocked={periodLocked}
                    onRefresh={onRefresh}
                  />
                </CardContent>
              </Card>
            )}
          </div>
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
            onRecordSecondApproval={() => void handleRecordSecondApproval()}
            onExportCsv={exportSettlementCsv}
            onDownloadEvidencePack={() => void handleDownloadEvidencePack()}
            settlementRows={settlementRows}
          />
        )}
      </div>

        {/* Sticky footer — always visible Continue (Finalize uses hero CTA) */}
      {!isLast && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:rounded-lg sm:border sm:bg-white sm:pb-3 sm:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl flex-col items-end gap-1">
            {!canContinue && (
              <p className="text-right text-xs text-amber-700">
                {activeStepId === 'adjustments-disputes'
                  ? 'Resolve open disputes before continuing.'
                  : activeStepId === 'leakage-gap' && !leakageReviewed
                    ? 'Use “Mark reviewed & continue” above, or finish gap review.'
                    : 'Finish remaining items on this step to continue.'}
              </p>
            )}
            <Button
              type="button"
              disabled={!canContinue}
              className="min-h-11 bg-[#3525cd] text-white hover:bg-[#2a1ea4] disabled:bg-slate-300 sm:min-h-11"
              onClick={handleContinue}
            >
              {continueLabel}
            </Button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export function FuelPeriodWizard(props: FuelPeriodWizardProps) {
  return <FuelPeriodWizardInner {...props} />;
}
