import { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { PeriodLandingPage } from './PeriodLandingPage';
import { ReconciliationWizard } from './ReconciliationWizard';
import { ReconciliationPeriod, useTollReconciliationPeriods } from '../../../hooks/useTollReconciliationPeriods';

/**
 * Period-first Toll Reconciliation entry point (Phase F3/F4). Replaces the
 * previous always-rendered, flat-stepper dashboard: the fleet manager first
 * sees every outstanding/reconciled period (PeriodLandingPage), picks one,
 * and is then walked through a hard-gated, period-scoped wizard
 * (ReconciliationWizard) — the former dashboard body, relocated there.
 *
 * Landing chrome matched to Stitch "Toll Reconciliation - Premium Redesign".
 */
export function ReconciliationDashboard({
  initialDriverId,
  focusVehicleId,
  focusVehicleLabel,
}: {
  initialDriverId?: string;
  focusVehicleId?: string;
  focusVehicleLabel?: string;
} = {}) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId || '');
  const [selectedPeriod, setSelectedPeriod] = useState<ReconciliationPeriod | null>(null);
  const periodData = useTollReconciliationPeriods(selectedDriverId || undefined);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    }
  }, [initialDriverId]);

  if (selectedPeriod) {
    return (
      <ReconciliationWizard
        period={selectedPeriod}
        driverId={selectedDriverId || undefined}
        drivers={drivers}
        onExit={() => {
          setSelectedPeriod(null);
          void periodData.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {focusVehicleId && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Focused: {focusVehicleLabel || focusVehicleId}
        </div>
      )}
      <PeriodLandingPage
        driverId={selectedDriverId || undefined}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
        selectedDriverId={selectedDriverId}
        onDriverChange={setSelectedDriverId}
        onSelectPeriod={setSelectedPeriod}
        onPeriodsReset={() => void periodData.refresh()}
        outstanding={periodData.outstanding}
        inProgress={periodData.inProgress}
        reconciled={periodData.reconciled}
        totals={periodData.totals}
        loading={periodData.loading}
        loadError={periodData.loadError}
        onRetry={() => void periodData.refresh()}
      />
    </div>
  );
}
