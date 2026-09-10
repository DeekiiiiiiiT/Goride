import { useState, useEffect } from 'react';
import { api } from '../../../services/api';
import { PeriodLandingPage } from './PeriodLandingPage';
import { ReconciliationWizard } from './ReconciliationWizard';
import { ReconciliationPeriod, useTollReconciliationPeriods } from '../../../hooks/useTollReconciliationPeriods';
import { isReconWeekSealed, reconWeekSealMessage } from '../../../utils/reconWeekSeal';

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
  initialWeekStart,
  focusVehicleId,
  focusVehicleLabel,
}: {
  initialDriverId?: string;
  /** Monday week start from Close Week Review / Week Reconciliation hub. */
  initialWeekStart?: string;
  focusVehicleId?: string;
  focusVehicleLabel?: string;
} = {}) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialDriverId || '');
  const [selectedPeriod, setSelectedPeriod] = useState<ReconciliationPeriod | null>(null);
  const [sealedMessage, setSealedMessage] = useState<string | null>(null);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  const periodData = useTollReconciliationPeriods(selectedDriverId || undefined);

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  useEffect(() => {
    if (initialDriverId) {
      setSelectedDriverId(initialDriverId);
    }
  }, [initialDriverId]);

  useEffect(() => {
    if (initialWeekStart) setDeepLinkConsumed(false);
  }, [initialWeekStart]);

  const trySelectPeriod = (period: ReconciliationPeriod) => {
    if (
      period.status !== 'reconciled' &&
      isReconWeekSealed({ weekStart: period.startDate, periodEnd: period.endDate })
    ) {
      setSealedMessage(
        reconWeekSealMessage({ weekStart: period.startDate, periodEnd: period.endDate }),
      );
      return;
    }
    setSealedMessage(null);
    setSelectedPeriod(period);
  };

  // Deep-link from Close Week Review → open the exact Monday week in the wizard
  useEffect(() => {
    if (deepLinkConsumed || periodData.loading || selectedPeriod) return;
    const fromQuery =
      typeof window !== 'undefined'
        ? String(new URLSearchParams(window.location.search).get('week') || '').split('T')[0]
        : '';
    const week = fromQuery || String(initialWeekStart || '').split('T')[0];
    if (!week || periodData.periods.length === 0) return;
    const period = periodData.periods.find((p) => p.startDate === week);
    if (!period) return;
    setDeepLinkConsumed(true);
    if (
      period.status !== 'reconciled' &&
      isReconWeekSealed({ weekStart: period.startDate, periodEnd: period.endDate })
    ) {
      setSealedMessage(
        reconWeekSealMessage({ weekStart: period.startDate, periodEnd: period.endDate }),
      );
      return;
    }
    setSealedMessage(null);
    setSelectedPeriod(period);
  }, [
    deepLinkConsumed,
    periodData.loading,
    periodData.periods,
    selectedPeriod,
    initialWeekStart,
  ]);

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
      {sealedMessage && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {sealedMessage}
        </div>
      )}
      <PeriodLandingPage
        driverId={selectedDriverId || undefined}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
        selectedDriverId={selectedDriverId}
        onDriverChange={setSelectedDriverId}
        onSelectPeriod={trySelectPeriod}
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
