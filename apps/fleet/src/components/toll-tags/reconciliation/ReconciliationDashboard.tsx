import { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';
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
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1.5">
        <Filter className="h-4 w-4 text-slate-400" />
        <select
          value={selectedDriverId}
          onChange={(e) => setSelectedDriverId(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Drivers</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <PeriodLandingPage
        driverId={selectedDriverId || undefined}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
        onSelectPeriod={setSelectedPeriod}
        onPeriodsReset={() => void periodData.refresh()}
        outstanding={periodData.outstanding}
        reconciled={periodData.reconciled}
        totals={periodData.totals}
        loading={periodData.loading}
      />
    </div>
  );
}
