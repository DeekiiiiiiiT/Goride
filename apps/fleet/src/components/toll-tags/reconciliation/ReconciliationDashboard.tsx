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
export function ReconciliationDashboard() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<ReconciliationPeriod | null>(null);
  const periodData = useTollReconciliationPeriods(selectedDriverId || undefined);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

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
    <PeriodLandingPage
      driverId={selectedDriverId || undefined}
      drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
      selectedDriverId={selectedDriverId}
      onDriverChange={setSelectedDriverId}
      onSelectPeriod={setSelectedPeriod}
      onPeriodsReset={() => void periodData.refresh()}
      outstanding={periodData.outstanding}
      reconciled={periodData.reconciled}
      totals={periodData.totals}
      loading={periodData.loading}
    />
  );
}
