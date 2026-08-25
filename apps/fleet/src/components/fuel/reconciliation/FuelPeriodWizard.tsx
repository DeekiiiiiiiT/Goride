import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  Droplets,
  Flag,
  RefreshCw,
  RotateCcw,
  Scale,
  Shield,
  type LucideIcon,
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
import { useFuelWeekReports } from '../../../hooks/useFuelWeekReports';
import { evaluateFuelFinalizeGating } from '../../../utils/fuelFinalizeGating';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { Checkbox } from '../../ui/checkbox';
import {
  canAdvanceFuelStep,
  computeFuelGatedStepStates,
  FUEL_STEP_LABELS,
  FUEL_STEP_ORDER,
  pickInitialFuelStep,
  type FuelStepId,
} from '../../../utils/fuelPeriodGating';
import { buildFuelStepCounts, type FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { isEntryInInclusiveYmdRange, reportWeekYmdBounds, isSameFuelStatement } from '../../../utils/fuelWeekPeriod';
import { sumGasCardSpendForReport, sumPaidByDriverForReport } from '../../../utils/fuelPaidByDriver';
import { fuelOpsSpendAmount } from '../../../utils/fuelOpsEligibility';

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
import { pickScenarioForDriverMembership, resolveDriverVersionForWeek } from '../../../utils/fuelPolicyVersion';

const STEP_ICONS: Record<FuelStepId, LucideIcon> = {
  'data-quality': AlertTriangle,
  'adjustments-disputes': Scale,
  'policy-check': Shield,
  'leakage-gap': Droplets,
  'settlement-preview': ClipboardList,
  finalize: Flag,
};

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function resolveDriverDisplayName(
  report: WeeklyFuelReport | undefined,
  vehicle: Vehicle | undefined,
  drivers: any[],
): string {
  if (report?.driverId === UNASSIGNED_FUEL_DRIVER_ID) return 'Unassigned fills';
  const driverId = report?.driverId;
  const reportDriver = driverId
    ? drivers.find((d: any) => d.id === driverId || d.driverId === driverId)
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
  drivers: any[];
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
  /** Bumps on Reopen week — remounts wizard walkthrough from step 1. */
  sessionKey?: number;
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
  isRefreshing,
  onBack,
  onRefresh,
  onFinalize,
  onAddAdjustment,
  onResolveDispute,
  onOpenConfiguration,
  onResetPeriod,
  sessionKey = 0,
}: FuelPeriodWizardProps) {
  const [leakageReviewed, setLeakageReviewed] = useState(false);
  const [showGapDetail, setShowGapDetail] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [bucketVehicleId, setBucketVehicleId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<FuelStepId>('data-quality');
  const [progressIndex, setProgressIndex] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [financeWarningAcknowledged, setFinanceWarningAcknowledged] = useState(false);

  const periodLocked = period.locked;

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
  });
  const liveReports = weekReports.reports;
  const weekTrips = weekReports.trips.length ? weekReports.trips : trips;

  const vehicleSnaps = useMemo(() => {
    return vehicles.map((vehicle) => {
      // Prefer report that lists this vehicle (driver-first multi-car safe)
      const report = liveReports.find(
        (r) => r.vehicleId === vehicle.id || (r.vehicleIds || []).includes(vehicle.id),
      );
      const start = period.startDate;
      const end = period.endDate;
      const vEntries = fuelEntries.filter(
        (e) => e.vehicleId === vehicle.id && isEntryInInclusiveYmdRange(e.date, start, end),
      );
      const pendingCount =
        report?.pendingCount ??
        vEntries.filter((e) => e.reconciliationStatus === 'Pending').length;
      const isFinalized = finalizedReports.some((f) =>
        report
          ? isSameFuelStatement(f, report)
          : f.vehicleId === vehicle.id && reportWeekYmdBounds(f).start === start,
      );
      const hasOpenDispute = disputes.some(
        (d) =>
          d.vehicleId === vehicle.id &&
          d.status === 'Open' &&
          reportWeekYmdBounds({ weekStart: d.weekStart || start, weekEnd: d.weekEnd }).start === start,
      );
      const driverSpend = report
        ? sumPaidByDriverForReport(fuelEntries, report, vehicles, { vehicles, trips: weekTrips, fuelCards })
        : 0;
      return {
        vehicleId: vehicle.id,
        totalSpend: report?.totalGasCardCost ?? vEntries.reduce((s, e) => s + fuelOpsSpendAmount(e), 0),
        companyShare: report?.companyShare ?? 0,
        driverShare: report?.driverShare ?? 0,
        misc: report?.miscellaneousCost ?? 0,
        healthStatus: report?.healthStatus,
        pendingCount,
        hasOpenDispute,
        hasScenarioAssigned:
          Boolean(vehicle.fuelScenarioId) ||
          Boolean(scenarios?.some((s) => s.isDefault)) ||
          Boolean(report?.metadata?.scenarioId),
        isFinalized,
        plate: vehicle.licensePlate || vehicle.id,
        driverSpend,
        netPay: driverSpend - (report?.driverShare ?? 0),
        odometerIncomplete: !!report?.dataQuality?.odometerIncomplete,
        report,
      };
    });
  }, [vehicles, liveReports, fuelEntries, disputes, finalizedReports, period, scenarios, weekTrips, fuelCards]);

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
    setLeakageReviewed(false);
    setShowGapDetail(false);
    setShowCostBreakdown(false);
    setBucketVehicleId(null);
    if (sessionKey > 0 || periodLocked) {
      // Reset → always restart at Data quality; locked weeks open at Finalize
      const startId: FuelStepId = periodLocked ? 'finalize' : 'data-quality';
      setActiveStepId(startId);
      setProgressIndex(periodLocked ? FUEL_STEP_ORDER.length - 1 : 0);
      return;
    }
    const initial = pickInitialFuelStep(gatedStates);
    const idx = FUEL_STEP_ORDER.indexOf(initial);
    setActiveStepId(initial);
    setProgressIndex(Math.max(0, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.id, sessionKey]);

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
    const active = vehicleSnaps.filter((v) => v.totalSpend > FUEL_SPEND_EPS || v.isFinalized);
    const paidByDriverCtx = { vehicles, fuelCards, trips: weekTrips };
    let gasCard = 0;
    let cashFromEarnings = 0;
    for (const r of liveReports) {
      gasCard += sumGasCardSpendForReport(fuelEntries, r, vehicles, paidByDriverCtx);
      cashFromEarnings += sumPaidByDriverForReport(fuelEntries, r, vehicles, paidByDriverCtx);
    }
    return {
      totalSpend: active.reduce((s, v) => s + v.totalSpend, 0),
      gasCard,
      cashFromEarnings,
      company: active.reduce((s, v) => s + v.companyShare, 0),
      driver: active.reduce((s, v) => s + v.driverShare, 0),
      leakage: active.reduce((s, v) => s + v.misc, 0),
    };
  }, [vehicleSnaps, liveReports, fuelEntries, vehicles, fuelCards, weekTrips]);

  const toQualityRow = (v: (typeof vehicleSnaps)[number]): FuelQualityRow => {
    const vehicle = vehicles.find((x) => x.id === v.vehicleId);
    return {
      id: v.vehicleId,
      plate: v.plate,
      driverName: resolveDriverDisplayName(v.report, vehicle, drivers),
      healthStatus: v.healthStatus,
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

  const openDisputes = disputes.filter(
    (d) =>
      d.status === 'Open' &&
      String(d.weekStart || '').split('T')[0] === period.startDate,
  );

  const leakageRows = vehicleSnaps
    .filter((v) => v.misc > FUEL_SPEND_EPS)
    .map((v) => ({
      id: v.vehicleId,
      title: v.plate,
      subtitle: v.odometerIncomplete
        ? 'Incomplete odometer data — unexplained fuel may be inflated'
        : v.healthStatus && v.healthStatus !== 'Emerald'
          ? String(v.healthStatus)
          : 'Unexplained fuel',
      right: formatMoney(v.misc),
      badge: 'Unexplained',
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
    const next = FUEL_STEP_ORDER[stepIndex + 1];
    const nextState = gatedStates.find((s) => s.id === next);
    if (nextState && !nextState.locked) {
      setProgressIndex(Math.max(progressIndex, stepIndex + 1));
      setActiveStepId(next);
    }
  };

  const handleMarkLeakageReviewed = () => {
    setLeakageReviewed(true);
    const settlementIdx = FUEL_STEP_ORDER.indexOf('settlement-preview');
    setProgressIndex(Math.max(progressIndex, settlementIdx));
    setActiveStepId('settlement-preview');
  };

  const handleFinalizeClick = async () => {
    if (periodLocked || liveReports.length === 0) return;
    const gate = weekReports.gateResult || evaluateFuelFinalizeGating({
      reports: liveReports,
      disputes,
      fuelEntries,
      finalizedReports,
      weekStartYmd: period.startDate,
      weekEndYmd: period.endDate,
    });
    if (gate.hasExceptionBlockers) {
      return;
    }
    if (gate.hasBlockingWarnings && !financeWarningAcknowledged) {
      return;
    }
    setFinalizing(true);
    try {
      const ok = await onFinalize(liveReports);
      if (ok) {
        onBack();
      }
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
        return qualityRows.length === 0
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
        return strip.leakage > FUEL_SPEND_EPS && !leakageReviewed
          ? {
              title: 'Review unexplained fuel',
              body: `Unexplained fuel ${formatMoney(strip.leakage)} — charge stop-to-stop gaps if needed, or accept and continue.`,
              actionLabel: 'Mark reviewed & continue',
              onAction: handleMarkLeakageReviewed,
            }
          : {
              title: 'Unexplained fuel reviewed',
              body: strip.leakage > FUEL_SPEND_EPS
                ? `Unexplained fuel ${formatMoney(strip.leakage)} marked reviewed for this week.`
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
          : {
              title: 'Ready to lock this week',
              body: 'Finalize posts pending fuel to settlements and freezes this week. You can reopen later if needed.',
              actionLabel: finalizing ? 'Finalizing…' : 'Finalize week',
              onAction: handleFinalizeClick,
              actionDisabled:
                finalizing ||
                liveReports.length === 0 ||
                !!weekReports.gateResult?.hasExceptionBlockers ||
                (!!weekReports.gateResult?.hasBlockingWarnings && !financeWarningAcknowledged),
            };
      default:
        return { title: '', body: '' };
    }
  })();

  const continueLabel =
    activeStepId === 'leakage-gap' ? 'Continue to Settlement' : 'Continue';

  return (
    <div className="space-y-4 pb-20">
      {weekReports.loading && (
        <div
          className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#3525cd]" />
          <p className="text-sm text-slate-500">Loading week data…</p>
        </div>
      )}

      {!!weekReports.error && !weekReports.loading && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-rose-800">
            Couldn’t load this week’s reconciliation. Check your connection and try again.
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
      )}

      {weekIsEmpty && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No fuel spend for this week yet. Refresh after new fills post, or pick another period.
        </div>
      )}

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-11"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      <FuelWeekMoneyStrip
        gasCard={strip.gasCard}
        cashFromEarnings={strip.cashFromEarnings}
        totalSpend={strip.totalSpend}
        company={strip.company}
        driver={strip.driver}
        leakage={strip.leakage}
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
        icons={STEP_ICONS}
      />

      <StepHero
        title={stepHero.title}
        body={stepHero.body}
        actionLabel={stepHero.actionLabel}
        onAction={stepHero.onAction}
        actionDisabled={stepHero.actionDisabled}
      />

      <div className="space-y-3">
        {activeStepId === 'data-quality' && (
          <FuelDataQualityStep
            rows={qualityRows}
            breakdownRows={breakdownRows}
            periodLocked={periodLocked}
            weekLabel={period.label}
            showBreakdown={showCostBreakdown}
            onToggleBreakdown={() => setShowCostBreakdown((v) => !v)}
            onAddAdjustment={onAddAdjustment}
          />
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
              Vehicles with gaps
            </h3>
            <CompactVehicleList rows={leakageRows} />
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
          <div className="space-y-4">
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f5f2ff] text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Vehicle</th>
                    <th className="px-3 py-3 font-medium text-right">Cash from earnings (credit)</th>
                    <th className="px-3 py-3 font-medium text-right">Driver’s fuel share (charge)</th>
                    <th className="px-3 py-3 font-medium text-right">Net this week</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-900">{r.plate}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.cashFromEarnings)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-700">{formatMoney(r.driverShare)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatMoney(r.netPay)}</td>
                    </tr>
                  ))}
                  {settlementRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-10 text-center text-slate-500">
                        No spend this week.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeStepId === 'finalize' && (
          <div className="space-y-3">
            {weekReports.gateResult?.hasExceptionBlockers && (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Exception-tier fills must be resolved before this week can be finalized.
              </p>
            )}
            {weekReports.gateResult?.hasBlockingWarnings && !weekReports.gateResult.hasExceptionBlockers && (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <Checkbox
                  checked={financeWarningAcknowledged}
                  onCheckedChange={(v) => setFinanceWarningAcknowledged(!!v)}
                  className="mt-0.5"
                />
                I reviewed data-quality and re-finalize warnings for this week.
              </label>
            )}
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-[#f5f2ff] text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-medium">Vehicle</th>
                    <th className="px-3 py-3 font-medium text-right">Cash from earnings (credit)</th>
                    <th className="px-3 py-3 font-medium text-right">Driver’s fuel share (charge)</th>
                    <th className="px-3 py-3 font-medium text-right">Net this week</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-900">{r.plate}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.cashFromEarnings)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-amber-700">{formatMoney(r.driverShare)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatMoney(r.netPay)}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-[10px]">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {settlementRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                        No vehicles with spend to finalize.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer — always visible Continue (Finalize uses hero CTA) */}
      {!isLast && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:rounded-lg sm:border sm:bg-white sm:backdrop-blur-none">
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
    </div>
  );
}

export function FuelPeriodWizard(props: FuelPeriodWizardProps) {
  return <FuelPeriodWizardInner {...props} />;
}
