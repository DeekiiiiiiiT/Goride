import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  Droplets,
  Flag,
  RefreshCw,
  Scale,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
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
}: FuelPeriodWizardProps) {
  const { runExclusive } = useFuelReconBusy();
  const [liveReports, setLiveReports] = useState<WeeklyFuelReport[]>([]);
  const [healthAcknowledged, setHealthAcknowledged] = useState(false);
  const [leakageReviewed, setLeakageReviewed] = useState(false);
  const [bucketVehicleId, setBucketVehicleId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<FuelStepId>('data-quality');

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
        hasScenarioAssigned: Boolean(vehicle.fuelScenarioId),
        isFinalized,
      };
    });
  }, [vehicles, liveReports, fuelEntries, disputes, finalizedReports, period]);

  const counts = useMemo(
    () =>
      buildFuelStepCounts({
        vehicles: vehicleSnaps.filter(
          (v) => v.totalSpend > 0.009 || v.pendingCount > 0 || v.hasOpenDispute || v.isFinalized,
        ),
        healthAcknowledged,
        leakageReviewed: leakageReviewed || periodLocked,
      }),
    [vehicleSnaps, healthAcknowledged, leakageReviewed, periodLocked],
  );

  const gatedStates = useMemo(() => computeFuelGatedStepStates(counts), [counts]);

  useEffect(() => {
    setActiveStepId(pickInitialFuelStep(gatedStates));
    // Only on period open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.id]);

  // Snap back if earlier step regains actionable work
  useEffect(() => {
    const current = gatedStates.find((s) => s.id === activeStepId);
    if (current?.locked) {
      setActiveStepId(pickInitialFuelStep(gatedStates));
    }
  }, [gatedStates, activeStepId]);

  const strip = useMemo(() => {
    const active = vehicleSnaps.filter((v) => v.totalSpend > 0.009 || v.isFinalized);
    return {
      totalSpend: active.reduce((s, v) => s + v.totalSpend, 0),
      company: active.reduce((s, v) => s + v.companyShare, 0),
      driver: active.reduce((s, v) => s + v.driverShare, 0),
      leakage: active.reduce((s, v) => s + v.misc, 0),
    };
  }, [vehicleSnaps]);

  const qualityVehicleIds = useMemo(() => {
    return new Set(
      vehicleSnaps
        .filter(
          (v) =>
            v.pendingCount > 0 ||
            (v.healthStatus && v.healthStatus !== 'Emerald'),
        )
        .map((v) => v.vehicleId),
    );
  }, [vehicleSnaps]);

  const disputeVehicleIds = useMemo(() => {
    return new Set(vehicleSnaps.filter((v) => v.hasOpenDispute).map((v) => v.vehicleId));
  }, [vehicleSnaps]);

  const filterVehicles = (ids: Set<string>) =>
    ids.size === 0 ? vehicles : vehicles.filter((v) => ids.has(v.id));

  const openDisputes = disputes.filter(
    (d) =>
      d.status === 'Open' &&
      String(d.weekStart || '').split('T')[0] === period.startDate,
  );

  const recentAdjustments = adjustments.filter(
    (a) => a.date >= period.startDate && a.date <= period.endDate,
  );

  const policyRows = useMemo(() => {
    return vehicles
      .filter((v) => vehicleSnaps.some((s) => s.vehicleId === v.id && s.totalSpend > 0.009))
      .map((v) => {
        const scenario =
          scenarios.find((s) => s.id === v.fuelScenarioId) ||
          scenarios.find((s) => s.isDefault) ||
          scenarios[0];
        const fuelRule = scenario?.rules?.find((r) => r.category === 'Fuel');
        const matrix = getCoverageMatrixRows(fuelRule);
        return { vehicle: v, scenario, matrix };
      });
  }, [vehicles, scenarios, vehicleSnaps]);

  const canContinue = canAdvanceFuelStep(activeStepId, counts);
  const stepIndex = FUEL_STEP_ORDER.indexOf(activeStepId);
  const isLast = stepIndex === FUEL_STEP_ORDER.length - 1;

  const handleContinue = () => {
    if (!canContinue) return;
    if (isLast) return;
    const next = FUEL_STEP_ORDER[stepIndex + 1];
    const nextState = gatedStates.find((s) => s.id === next);
    if (nextState && !nextState.locked) setActiveStepId(next);
  };

  const handleFinalizeClick = async (reports: WeeklyFuelReport[]) => {
    await runExclusive('Finalizing week…', async () => {
      await onFinalize(reports);
    });
  };

  const bucketVehicle = vehicles.find((v) => v.id === bucketVehicleId) || vehicles[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Periods
          </Button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{period.label}</h2>
            <div className="flex items-center gap-2">
              <Badge variant={periodLocked ? 'secondary' : 'outline'}>
                {periodLocked ? 'Locked' : 'Draft'}
              </Badge>
            </div>
          </div>
        </div>
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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: 'Total Spend', value: strip.totalSpend },
          { label: 'Company share', value: strip.company },
          { label: 'Driver deduction', value: strip.driver },
          { label: 'Net Leakage', value: strip.leakage, warn: strip.leakage > 0 },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className={`mt-0.5 text-lg font-semibold ${c.warn ? 'text-rose-600' : 'text-slate-900'}`}>
                {formatMoney(c.value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <FuelPeriodStepper
        states={gatedStates}
        activeStepId={activeStepId}
        onSelect={setActiveStepId}
        labels={FUEL_STEP_LABELS}
        icons={STEP_ICONS}
      />

      <div className="min-h-[240px] space-y-4">
        {activeStepId === 'data-quality' && (
          <div className="space-y-3">
            {qualityVehicleIds.size === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
                <Check className="mx-auto mb-2 h-6 w-6" />
                Data quality clear for this week.
              </div>
            ) : (
              <ReconciliationTable
                vehicles={filterVehicles(qualityVehicleIds)}
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
                onAddAdjustment={periodLocked ? undefined : onAddAdjustment}
                onResolveDispute={onResolveDispute}
              />
            )}
            {counts['data-quality'].actionable > 0 &&
              vehicleSnaps.some((v) => v.healthStatus && v.healthStatus !== 'Emerald') && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <Checkbox
                    id="ack-health"
                    checked={healthAcknowledged}
                    onCheckedChange={(c) => setHealthAcknowledged(!!c)}
                    disabled={periodLocked}
                  />
                  <Label htmlFor="ack-health" className="text-sm text-amber-950 cursor-pointer">
                    I acknowledge Amber/Red data-health risk for this week and accept responsibility to continue.
                    Pending fuel logs must still be cleared before leaving this step.
                  </Label>
                </div>
              )}
            {/* Keep full calc running off-screen for strip totals when filtered empty */}
            {qualityVehicleIds.size === 0 && (
              <div className="hidden">
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
                  hideFinalize
                  hideDashboard
                  onReportsChange={setLiveReports}
                />
              </div>
            )}
          </div>
        )}

        {activeStepId === 'adjustments-disputes' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              {!periodLocked && (
                <Button type="button" size="sm" variant="outline" onClick={onAddAdjustment}>
                  Add Adjustment
                </Button>
              )}
            </div>
            {openDisputes.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-slate-500">
                No open disputes for this week.
              </div>
            ) : (
              <div className="space-y-2">
                {openDisputes.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="font-medium text-slate-900">{d.reason || 'Dispute'}</div>
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
              </div>
            )}
            {recentAdjustments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Recent adjustments</h3>
                <ul className="space-y-1 text-sm text-slate-600">
                  {recentAdjustments.slice(0, 12).map((a) => (
                    <li key={a.id} className="rounded border border-slate-100 px-2 py-1">
                      {a.date} · {a.type} · {a.distance || 0} km
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {disputeVehicleIds.size > 0 && (
              <ReconciliationTable
                vehicles={filterVehicles(disputeVehicleIds)}
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
                onResolveDispute={onResolveDispute}
              />
            )}
          </div>
        )}

        {activeStepId === 'policy-check' && (
          <div className="space-y-3">
            {policyRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-slate-500">
                No vehicles with spend this week.
              </div>
            ) : (
              policyRows.map(({ vehicle, scenario, matrix }) => (
                <Card key={vehicle.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {vehicle.licensePlate || vehicle.id}
                        </div>
                        <div className="text-sm text-slate-600">
                          Policy:{' '}
                          <span className="font-medium text-indigo-700">
                            {scenario?.name || 'No policy'}
                          </span>
                          {!vehicle.fuelScenarioId && (
                            <span className="ml-2 text-xs text-amber-700">(using default)</span>
                          )}
                        </div>
                      </div>
                      {onOpenConfiguration && (
                        <Button type="button" variant="outline" size="sm" onClick={onOpenConfiguration}>
                          Assign / change
                        </Button>
                      )}
                    </div>
                    {matrix.length > 0 && (
                      <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-5">
                        {matrix.map((row) => (
                          <div key={row.key} className="rounded bg-slate-50 px-2 py-1">
                            <div className="font-medium text-slate-700">{row.label}</div>
                            <div className="text-slate-500">
                              {row.companyPct < 0
                                ? 'Allowance-based'
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
          <div className="space-y-4">
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
              onReportsChange={setLiveReports}
              onViewBuckets={(v) => setBucketVehicleId(v.id)}
            />
            {bucketVehicle && (
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">
                      Stop-to-Stop gap — {bucketVehicle.licensePlate || bucketVehicle.id}
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
            {!periodLocked && counts['leakage-gap'].actionable > 0 && (
              <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <Checkbox
                  id="ack-leakage"
                  checked={leakageReviewed}
                  onCheckedChange={(c) => setLeakageReviewed(!!c)}
                />
                <Label htmlFor="ack-leakage" className="cursor-pointer text-sm text-slate-800">
                  Leakage / gap reviewed for this week (charge gap above or accept remaining misc).
                </Label>
              </div>
            )}
          </div>
        )}

        {activeStepId === 'settlement-preview' && (
          <div className="space-y-4">
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
              onReportsChange={setLiveReports}
            />
            {liveReports.length > 0 && (
              <ScenarioSplitDashboard
                reports={liveReports}
                scenarios={scenarios}
                vehicles={vehicles}
              />
            )}
          </div>
        )}

        {activeStepId === 'finalize' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-2 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Finalize checklist</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Data quality cleared or acknowledged</li>
                  <li>No open disputes</li>
                  <li>Policy coverage reviewed</li>
                  <li>Leakage / gap reviewed</li>
                  <li>Settlement amounts confirmed in preview</li>
                </ul>
                {periodLocked && (
                  <p className="text-amber-800">
                    This week is Locked. Use Reset Period from the landing page to re-open.
                  </p>
                )}
              </CardContent>
            </Card>
            {!periodLocked && (
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
                onFinalize={handleFinalizeClick}
                onReportsChange={setLiveReports}
                hideDashboard
              />
            )}
          </div>
        )}
      </div>

      {!isLast && (
        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button
            type="button"
            disabled={!canContinue}
            className="min-h-11 sm:min-h-9"
            onClick={handleContinue}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

export function FuelPeriodWizard(props: FuelPeriodWizardProps) {
  return <FuelPeriodWizardInner {...props} />;
}
