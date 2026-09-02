import { useState, useMemo, useEffect } from 'react';
import { FuelPeriodLandingPage } from './FuelPeriodLandingPage';
import { FuelPeriodWizard } from './FuelPeriodWizard';
import { FuelPeriodResetDialog } from './FuelPeriodResetDialog';
import { FuelBulkFinalizeDialog } from './FuelBulkFinalizeDialog';
import { FuelBulkResetDialog, finalizedWeekOptionsFromGroups } from './FuelBulkResetDialog';
import { FinalizedReportsTab } from '../FinalizedReportsTab';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { FUEL_STEP_ORDER, type FuelStepId } from '../../../utils/fuelPeriodGating';
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
import { ymdToLocalDate } from '../../../utils/timezoneDisplay';
import type { DateRange } from 'react-day-picker';
import type { FuelAutoCloseDualApprovalMode } from '../../../utils/fuelDualApproval';

export const FUEL_RECON_WIZARD_PRIMARY =
  import.meta.env.VITE_FUEL_RECON_WIZARD_PRIMARY !== '0';

type View =
  | { kind: 'landing' }
  | { kind: 'wizard'; period: FuelReconciliationPeriod; initialStepId?: FuelStepId }
  | { kind: 'archive' };

function parseDeepLinkStep(raw: string | null): FuelStepId | undefined {
  if (!raw) return undefined;
  const step = raw.trim() as FuelStepId;
  return FUEL_STEP_ORDER.includes(step) ? step : undefined;
}

export function FuelReconciliationDashboard({
  outstanding,
  inProgress,
  completed,
  loading,
  vehicles,
  trips,
  fuelEntries,
  adjustments,
  disputes,
  scenarios,
  drivers,
  fuelCards,
  finalizedReports,
  isRefreshing,
  onRefresh,
  onFinalize,
  onAddAdjustment,
  onResolveDispute,
  onOpenConfiguration,
  onSelectPeriodWeek,
  onOpenTransactionLogs,
  onAcceptFuelException,
  onEditFuelEntry,
  dataTruncated,
  secondApproverThreshold,
  autoCloseDualApprovalMode,
}: {
  outstanding: FuelReconciliationPeriod[];
  inProgress: FuelReconciliationPeriod[];
  completed: FuelReconciliationPeriod[];
  loading: boolean;
  vehicles: Vehicle[];
  trips: Trip[];
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  disputes: FuelDispute[];
  scenarios: FuelScenario[];
  drivers: any[];
  fuelCards: FuelCard[];
  finalizedReports: FinalizedFuelReport[];
  isRefreshing?: boolean;
  onRefresh: () => void;
  onFinalize: (reports: WeeklyFuelReport[]) => Promise<boolean | void> | boolean | void;
  onAddAdjustment: () => void;
  onResolveDispute: (dispute: FuelDispute) => void;
  onOpenConfiguration?: () => void;
  onSelectPeriodWeek?: (period: FuelReconciliationPeriod) => void;
  onOpenTransactionLogs?: (opts: {
    fuelEntryId?: string;
    date?: string;
    vehicleId?: string;
  }) => void;
  onAcceptFuelException?: (
    entryId: string,
    note: string,
  ) => Promise<boolean | void> | boolean | void;
  onEditFuelEntry?: (entryId: string) => void;
  dataTruncated?: boolean;
  secondApproverThreshold?: number;
  autoCloseDualApprovalMode?: FuelAutoCloseDualApprovalMode;
}) {
  const [view, setView] = useState<View>({ kind: 'landing' });
  const [resetPeriod, setResetPeriod] = useState<FuelReconciliationPeriod | null>(null);
  const [bulkFinalizeOpen, setBulkFinalizeOpen] = useState(false);
  const [bulkReopenOpen, setBulkReopenOpen] = useState(false);
  const [wizardSession, setWizardSession] = useState(0);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);

  const allPeriods = useMemo(
    () => [...outstanding, ...inProgress, ...completed],
    [outstanding, inProgress, completed],
  );

  // Deep-link: /fuel-reconciliation?week=YYYY-MM-DD&step=finalize
  useEffect(() => {
    if (deepLinkConsumed || loading || allPeriods.length === 0) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const week = String(params.get('week') || '').split('T')[0];
    if (!week) return;
    const period = allPeriods.find((p) => p.startDate === week);
    if (!period) return;
    const stepId = parseDeepLinkStep(params.get('step'));
    onSelectPeriodWeek?.(period);
    setView({ kind: 'wizard', period, initialStepId: stepId });
    setDeepLinkConsumed(true);
  }, [allPeriods, deepLinkConsumed, loading, onSelectPeriodWeek]);

  const weeksWithSnapshots = useMemo(() => {
    const set = new Set<string>();
    for (const f of finalizedReports) {
      const w = String(f.weekStart || '').split('T')[0];
      if (w) set.add(w);
    }
    return set;
  }, [finalizedReports]);

  const openPeriod = (period: FuelReconciliationPeriod, stepId?: FuelStepId) => {
    onSelectPeriodWeek?.(period);
    setView({ kind: 'wizard', period, initialStepId: stepId });
  };

  if (view.kind === 'archive') {
    return (
      <div className="space-y-3">
        <button
          type="button"
          className="text-sm text-slate-600 hover:text-slate-900"
          onClick={() => setView({ kind: 'landing' })}
        >
          ← Periods
        </button>
        <FinalizedReportsTab />
      </div>
    );
  }

  if (view.kind === 'wizard') {
    const period = view.period;
    const dateRange: DateRange = {
      from: ymdToLocalDate(period.startDate),
      to: ymdToLocalDate(period.endDate),
    };
    return (
      <>
        <FuelPeriodWizard
          key={`${period.id}-${wizardSession}-${view.initialStepId || ''}`}
          period={period}
          vehicles={vehicles}
          trips={trips}
          fuelEntries={fuelEntries}
          adjustments={adjustments}
          disputes={disputes}
          scenarios={scenarios}
          drivers={drivers}
          fuelCards={fuelCards}
          finalizedReports={finalizedReports}
          dateRange={dateRange}
          isRefreshing={isRefreshing}
          sessionKey={wizardSession}
          initialStepId={view.initialStepId}
          onBack={() => {
            setView({ kind: 'landing' });
            onRefresh();
          }}
          onRefresh={onRefresh}
          onFinalize={onFinalize}
          onAddAdjustment={onAddAdjustment}
          onResolveDispute={onResolveDispute}
          onOpenConfiguration={onOpenConfiguration}
          onOpenTransactionLogs={onOpenTransactionLogs}
          onAcceptFuelException={onAcceptFuelException}
          onEditFuelEntry={onEditFuelEntry}
          onResetPeriod={period.locked ? () => setResetPeriod(period) : undefined}
        />
        {resetPeriod && (
          <FuelPeriodResetDialog
            open={!!resetPeriod}
            onOpenChange={(open) => !open && setResetPeriod(null)}
            period={resetPeriod}
            finalizedReports={finalizedReports}
            fuelEntries={fuelEntries}
            onComplete={() => {
              setResetPeriod(null);
              setWizardSession((n) => n + 1);
              onRefresh();
            }}
          />
        )}
      </>
    );
  }

  const bulkReopenWeeks = finalizedWeekOptionsFromGroups(
    completed.map((p) => ({
      weekStart: p.startDate,
      weekEnd: p.endDate,
      vehicleCount: p.vehicleCount,
      totalSpend: p.totalSpend,
      reports: finalizedReports.filter(
        (f) => String(f.weekStart || '').split('T')[0] === p.startDate,
      ),
    })),
  );

  return (
    <>
      <FuelPeriodLandingPage
        outstanding={outstanding}
        inProgress={inProgress}
        completed={completed}
        loading={loading}
        onSelectPeriod={openPeriod}
        onResetPeriod={(p) => setResetPeriod(p)}
        onOpenArchive={() => setView({ kind: 'archive' })}
        onBulkFinalize={() => setBulkFinalizeOpen(true)}
        onBulkReopen={() => setBulkReopenOpen(true)}
        dataTruncated={dataTruncated}
        secondApproverThreshold={secondApproverThreshold}
        autoCloseDualApprovalMode={autoCloseDualApprovalMode}
        weeksWithSnapshots={weeksWithSnapshots}
      />
      <FuelBulkFinalizeDialog
        open={bulkFinalizeOpen}
        onOpenChange={setBulkFinalizeOpen}
        periods={[...outstanding, ...inProgress]}
        vehicles={vehicles}
        drivers={drivers}
        fuelEntries={fuelEntries}
        adjustments={adjustments}
        scenarios={scenarios}
        fuelCards={fuelCards}
        disputes={disputes}
        finalizedReports={finalizedReports}
        onComplete={onRefresh}
      />
      <FuelBulkResetDialog
        open={bulkReopenOpen}
        onOpenChange={setBulkReopenOpen}
        weeks={bulkReopenWeeks}
        onComplete={onRefresh}
      />
      {resetPeriod && (
        <FuelPeriodResetDialog
          open={!!resetPeriod}
          onOpenChange={(open) => !open && setResetPeriod(null)}
          period={resetPeriod}
          finalizedReports={finalizedReports}
          fuelEntries={fuelEntries}
          onComplete={() => {
            setResetPeriod(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
