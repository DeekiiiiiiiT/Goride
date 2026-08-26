import { useState } from 'react';
import { FuelPeriodLandingPage } from './FuelPeriodLandingPage';
import { FuelPeriodWizard } from './FuelPeriodWizard';
import { FuelPeriodResetDialog } from './FuelPeriodResetDialog';
import { FuelBulkFinalizeDialog } from './FuelBulkFinalizeDialog';
import { FinalizedReportsTab } from '../FinalizedReportsTab';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
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

export const FUEL_RECON_WIZARD_PRIMARY =
  import.meta.env.VITE_FUEL_RECON_WIZARD_PRIMARY !== '0';

type View = { kind: 'landing' } | { kind: 'wizard'; period: FuelReconciliationPeriod } | { kind: 'archive' };

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
}) {
  const [view, setView] = useState<View>({ kind: 'landing' });
  const [resetPeriod, setResetPeriod] = useState<FuelReconciliationPeriod | null>(null);
  const [bulkFinalizeOpen, setBulkFinalizeOpen] = useState(false);
  const [wizardSession, setWizardSession] = useState(0);

  const openPeriod = (period: FuelReconciliationPeriod) => {
    onSelectPeriodWeek?.(period);
    setView({ kind: 'wizard', period });
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
          key={`${period.id}-${wizardSession}`}
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
