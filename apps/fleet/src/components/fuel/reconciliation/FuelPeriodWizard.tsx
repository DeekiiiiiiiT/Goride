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
import { ReconciliationTable } from '../ReconciliationTable';
import { ScenarioSplitDashboard } from '../ScenarioSplitDashboard';
import { BucketReconciliationView } from '../BucketReconciliationView';
import { FuelPeriodStepper } from './FuelPeriodStepper';
import {
  canAdvanceFuelStep,
  computeFuelGatedStepStates,
  FUEL_STEP_LABELS,
  FUEL_STEP_ORDER,
  pickInitialFuelStep,
  type FuelStepId,
} from '../../../utils/fuelPeriodGating';
import { buildFuelStepCounts, type FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type {
  FinalizedFuelReport,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  MileageAdjustment,
  WeeklyFuelReport,
} from '../../../types/fuel';
import type { Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import { getCoverageMatrixRows } from '../../../utils/fuelCoverageSplit';
import { pickScenarioForDriverWeek, resolveVersionForWeek } from '../../../utils/fuelPolicyVersion';
import { useFuelReconBusy } from './fuelReconBusyLock';

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
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 border-l-4 border-l-indigo-600 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{body}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          className="min-h-11 shrink-0 sm:min-h-9"
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
  rows: { id: string; title: string; subtitle?: string; right?: string; badge?: string }[];
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
              <Badge variant="outline" className="text-[10px]">
                {r.badge}
              </Badge>
            )}
            {r.right && <span className="text-sm font-semibold text-slate-800">{r.right}</span>}
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
  finalizedReports: FinalizedFuelReport[];
  dateRange: DateRange;
  isRefreshing?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onFinalize: (reports: WeeklyFuelReport[]) => Promise<void> | void;
  onAddAdjustment: () => void;
  onResolveDispute: (dispute: FuelDispute) => void;
  onOpenConfiguration?: () => void;
  onResetPeriod?: () => void;
  /** Bumps on Reset Period — remounts wizard walkthrough from step 1. */
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
  const { runExclusive } = useFuelReconBusy();
  const [liveReports, setLiveReports] = useState<WeeklyFuelReport[]>([]);
  const [leakageReviewed, setLeakageReviewed] = useState(false);
  const [showGapDetail, setShowGapDetail] = useState(false);
  const [bucketVehicleId, setBucketVehicleId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<FuelStepId>('data-quality');
  /** Walkthrough cursor — green checks only for steps you've Continued past this session. */
  const [progressIndex, setProgressIndex] = useState(0);
  const [finalizing, setFinalizing] = useState(false);

  const periodLocked = period.locked;

  const vehicleSnaps = useMemo(() => {
    return vehicles.map((vehicle) => {
      const report = liveReports.find((r) => r.vehicleId === vehicle.id);
      const start = period.startDate;
      const end = period.endDate;
      const vEntries = fuelEntries.filter(
        (e) => e.vehicleId === vehicle.id && e.date >= start && e.date <= end,
      );
      const pendingCount =
        report?.pendingCount ??
        vEntries.filter((e) => e.reconciliationStatus === 'Pending').length;
      const isFinalized = finalizedReports.some(
        (f) =>
          f.vehicleId === vehicle.id && String(f.weekStart).split('T')[0] === start,
      );
      const hasOpenDispute = disputes.some(
        (d) =>
          d.vehicleId === vehicle.id &&
          d.status === 'Open' &&
          String(d.weekStart || '').split('T')[0] === start,
      );
      return {
        vehicleId: vehicle.id,
        totalSpend: report?.totalGasCardCost ?? vEntries.reduce((s, e) => s + e.amount, 0),
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
        driverSpend: 0,
        netPay: 0,
      };
    });
  }, [vehicles, liveReports, fuelEntries, disputes, finalizedReports, period, scenarios]);

  // Enrich settlement columns from live reports
  const settlementRows = useMemo(() => {
    return liveReports
      .filter((r) => r.totalGasCardCost > 0.009)
      .map((r) => {
        const v = vehicles.find((x) => x.id === r.vehicleId);
        const start = String(r.weekStart).split('T')[0];
        const end = String(r.weekEnd).split('T')[0];
        const driverSpend = fuelEntries
          .filter(
            (e) =>
              e.vehicleId === r.vehicleId &&
              e.date >= start &&
              e.date <= end &&
              (e.type === 'Reimbursement' ||
                e.type === 'Manual_Entry' ||
                e.type === 'Fuel_Manual_Entry'),
          )
          .reduce((s, e) => s + e.amount, 0);
        return {
          id: r.vehicleId,
          plate: v?.licensePlate || r.vehicleId,
          paidByDriver: driverSpend,
          deduction: r.driverShare,
          netPay: driverSpend - r.driverShare,
          pending: r.pendingCount || 0,
          status: periodLocked ? 'Locked' : (r.pendingCount || 0) > 0 ? 'Pending' : 'Draft',
        };
      });
  }, [liveReports, vehicles, fuelEntries, periodLocked]);

  const counts = useMemo(
    () =>
      buildFuelStepCounts({
        vehicles: vehicleSnaps.filter(
          (v) => v.totalSpend > 0.009 || v.pendingCount > 0 || v.hasOpenDispute || v.isFinalized,
        ),
        leakageReviewed: leakageReviewed || periodLocked,
      }),
    [vehicleSnaps, leakageReviewed, periodLocked],
  );

  const gatedStates = useMemo(() => computeFuelGatedStepStates(counts), [counts]);

  // Fresh walkthrough on period open or after Reset Period
  useEffect(() => {
    setLeakageReviewed(false);
    setShowGapDetail(false);
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
    const active = vehicleSnaps.filter((v) => v.totalSpend > 0.009 || v.isFinalized);
    return {
      totalSpend: active.reduce((s, v) => s + v.totalSpend, 0),
      company: active.reduce((s, v) => s + v.companyShare, 0),
      driver: active.reduce((s, v) => s + v.driverShare, 0),
      leakage: active.reduce((s, v) => s + v.misc, 0),
    };
  }, [vehicleSnaps]);

  const qualityRows = vehicleSnaps
    .filter(
      (v) =>
        v.pendingCount > 0 || (v.healthStatus && v.healthStatus !== 'Emerald'),
    )
    .map((v) => ({
      id: v.vehicleId,
      title: v.plate,
      subtitle: [
        v.healthStatus && v.healthStatus !== 'Emerald' ? v.healthStatus : null,
        v.pendingCount > 0 ? `${v.pendingCount} pending log(s)` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      badge: v.healthStatus && v.healthStatus !== 'Emerald' ? String(v.healthStatus) : undefined,
    }));

  const openDisputes = disputes.filter(
    (d) =>
      d.status === 'Open' &&
      String(d.weekStart || '').split('T')[0] === period.startDate,
  );

  const leakageRows = vehicleSnaps
    .filter((v) => v.misc > 0.009)
    .map((v) => ({
      id: v.vehicleId,
      title: v.plate,
      subtitle: v.healthStatus && v.healthStatus !== 'Emerald' ? String(v.healthStatus) : undefined,
      right: formatMoney(v.misc),
      badge: 'Leakage',
    }));

  const policyRows = useMemo(() => {
    return vehicles
      .filter((v) => vehicleSnaps.some((s) => s.vehicleId === v.id && s.totalSpend > 0.009))
      .map((v) => {
        const live = liveReports.find(
          (r) => r.vehicleId === v.id || (r.vehicleIds || []).includes(v.id),
        );
        const policyId = live?.metadata?.scenarioId || v.fuelScenarioId;
        const scenario = pickScenarioForDriverWeek(scenarios, policyId, period.startDate);
        const raw =
          scenarios.find((s) => s.id === policyId) ||
          scenarios.find((s) => s.isDefault) ||
          scenarios[0];
        const version = raw ? resolveVersionForWeek(raw, period.startDate) : undefined;
        const fuelRule = scenario?.rules?.find((r) => r.category === 'Fuel');
        return {
          vehicle: v,
          scenario,
          matrix: getCoverageMatrixRows(fuelRule),
          effectiveFrom: version?.effectiveFrom,
        };
      });
  }, [vehicles, scenarios, vehicleSnaps, period.startDate, liveReports]);

  const canContinue = canAdvanceFuelStep(activeStepId, counts);
  const stepIndex = FUEL_STEP_ORDER.indexOf(activeStepId);
  const isLast = stepIndex === FUEL_STEP_ORDER.length - 1;

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
    setFinalizing(true);
    try {
      await runExclusive('Finalizing week…', async () => {
        await onFinalize(liveReports);
      });
    } finally {
      setFinalizing(false);
    }
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
              body: 'Amber/Red means stop-to-stop data looks incomplete. Pending logs post when you Finalize — they do not block you here.',
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
        return strip.leakage > 0.009 && !leakageReviewed
          ? {
              title: 'Review unaccounted fuel',
              body: `Net Leakage ${formatMoney(strip.leakage)} — charge stop-to-stop gaps if needed, or accept and continue.`,
              actionLabel: 'Mark reviewed & continue',
              onAction: handleMarkLeakageReviewed,
            }
          : {
              title: 'Leakage reviewed',
              body: strip.leakage > 0.009
                ? `Net Leakage ${formatMoney(strip.leakage)} marked reviewed for this week.`
                : 'No misc leakage this week.',
              actionLabel: 'Continue',
              onAction: handleContinue,
            };
      case 'settlement-preview':
        return {
          title: 'Confirm company vs driver split',
          body: 'One summary of how this week’s spend splits. Next step locks and posts pending amounts.',
          actionLabel: 'Continue to Finalize',
          onAction: handleContinue,
        };
      case 'finalize':
        return periodLocked
          ? {
              title: 'Week is locked',
              body: 'This period is finalized. Use Reset Period above to re-open it.',
              actionLabel: onResetPeriod ? 'Reset Period' : undefined,
              onAction: onResetPeriod,
            }
          : {
              title: 'Ready to lock this week',
              body: 'Finalize posts pending fuel to settlements and freezes this week. You can reset later if needed.',
              actionLabel: finalizing ? 'Finalizing…' : 'Finalize week',
              onAction: handleFinalizeClick,
              actionDisabled: finalizing || liveReports.length === 0,
            };
      default:
        return { title: '', body: '' };
    }
  })();

  return (
    <div className="space-y-4 pb-20">
      {/* Hidden calc engine — keeps strip + settlement rows live without cluttering UI */}
      <div className="hidden" aria-hidden>
        <ReconciliationTable
          vehicles={vehicles}
          trips={trips}
          fuelEntries={fuelEntries}
          adjustments={adjustments}
          disputes={disputes}
          dateRange={dateRange}
          scenarios={scenarios}
          drivers={drivers}
          finalizedReports={finalizedReports}
          periodLocked={periodLocked}
          hideFinalize
          hideDashboard
          onReportsChange={setLiveReports}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Periods
          </Button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{period.label}</h2>
            <Badge variant={periodLocked ? 'secondary' : 'outline'}>
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
              className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 sm:min-h-9"
              onClick={onResetPeriod}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Reset Period
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: 'Total Spend', value: strip.totalSpend },
          { label: 'Company share', value: strip.company },
          { label: 'Driver deduction', value: strip.driver },
          { label: 'Net Leakage', value: strip.leakage, warn: strip.leakage > 0 },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-md border border-slate-200 bg-white px-3 py-2"
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{c.label}</div>
            <div className={`text-base font-semibold ${c.warn ? 'text-rose-600' : 'text-slate-900'}`}>
              {formatMoney(c.value)}
            </div>
          </div>
        ))}
      </div>

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
        {activeStepId === 'data-quality' && <CompactVehicleList rows={qualityRows} />}

        {activeStepId === 'adjustments-disputes' && (
          <div className="space-y-3">
            {openDisputes.length === 0 ? (
              <CompactVehicleList rows={[]} />
            ) : (
              <ul className="space-y-2">
                {openDisputes.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="font-medium text-slate-900">{String(d.reason || 'Dispute')}</div>
                        <div className="text-xs text-slate-500">Vehicle {d.vehicleId}</div>
                      </div>
                      {!periodLocked && (
                        <Button type="button" size="sm" onClick={() => onResolveDispute(d)}>
                          Resolve
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </ul>
            )}
            {!periodLocked && openDisputes.length === 0 && (
              <Button type="button" variant="outline" size="sm" onClick={onAddAdjustment}>
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
              policyRows.map(({ vehicle, scenario, matrix, effectiveFrom }) => (
                <Card key={vehicle.id}>
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
                    {matrix.length > 0 && (
                      <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-5">
                        {matrix.map((row) => (
                          <div key={row.key} className="rounded bg-slate-50 px-2 py-1">
                            <div className="font-medium text-slate-700">{row.label}</div>
                            <div className="text-slate-500">
                              {row.companyPct < 0
                                ? 'Allowance'
                                : `Co ${row.companyPct}% / Dr ${row.driverPct}%`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeStepId === 'leakage-gap' && (
          <div className="space-y-3">
            <CompactVehicleList rows={leakageRows} />
            {leakageRows.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowGapDetail((v) => !v)}
              >
                {showGapDetail ? 'Hide' : 'Show'} stop-to-stop gap detail
              </Button>
            )}
            {showGapDetail && bucketVehicle && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">
                      Stop-to-Stop — {bucketVehicle.licensePlate || bucketVehicle.id}
                    </h3>
                    {!periodLocked && (
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-sm"
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
            {liveReports.length > 0 && (
              <ScenarioSplitDashboard
                reports={liveReports.filter((r) => r.totalGasCardCost > 0.009)}
                scenarios={scenarios}
                vehicles={vehicles}
              />
            )}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Vehicle</th>
                    <th className="px-3 py-2 font-medium text-right">Paid by driver</th>
                    <th className="px-3 py-2 font-medium text-right">Deduction</th>
                    <th className="px-3 py-2 font-medium text-right">Net pay</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.plate}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.paidByDriver)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{formatMoney(r.deduction)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.netPay)}</td>
                    </tr>
                  ))}
                  {settlementRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
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
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 font-medium text-right">Paid by driver</th>
                  <th className="px-3 py-2 font-medium text-right">Deduction</th>
                  <th className="px-3 py-2 font-medium text-right">Net pay</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {settlementRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.plate}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.paidByDriver)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{formatMoney(r.deduction)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.netPay)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {settlementRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No vehicles with spend to finalize.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
              className="min-h-11 sm:min-h-9"
              onClick={handleContinue}
            >
              Continue
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
