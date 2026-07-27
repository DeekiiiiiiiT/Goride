import React, { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Receipt, Scale } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { Trip, FinancialTransaction, DriverMetrics } from '../../types/data';
import { FleetCashSettlementTab } from './settlement/FleetCashSettlementTab';
import { FleetExpensesSettlementTab } from './settlement/FleetExpensesSettlementTab';

type SettlementTab = 'cash' | 'expenses';

type FleetSettlementPageProps = {
  onBack?: () => void;
};

/**
 * Fleet-only Layer B desk: cash outstanding vs paid, plus view-only expenses by week.
 * Read-only for cash; expense logging stays in the Expenses menu.
 */
export function FleetSettlementPage({ onBack }: FleetSettlementPageProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [tab, setTab] = useState<SettlementTab>('cash');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [metrics, setMetrics] = useState<DriverMetrics[]>([]);
  const [fuelEntries, setFuelEntries] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const driverIds = [user.id, driverRecord?.id, driverRecord?.driverId].filter(
          Boolean,
        ) as string[];
        const vehicleId =
          (driverRecord as { assignedVehicleId?: string; vehicle?: string } | null)
            ?.assignedVehicleId ||
          (driverRecord as { vehicle?: string } | null)?.vehicle ||
          '';
        const limit = 500;
        const tripPromises = [
          api.getTripsFiltered({ driverId: user.id, limit }).then((r) => r.data ?? []).catch(() => []),
        ];
        if (driverRecord?.driverId && driverRecord.driverId !== user.id) {
          tripPromises.push(
            api
              .getTripsFiltered({ driverId: driverRecord.driverId, limit })
              .then((r) => r.data ?? [])
              .catch(() => []),
          );
        }
        const [tripBatches, txData, metricsData, allFuel, vehicleFuel] = await Promise.all([
          Promise.all(tripPromises),
          api.getTransactions(driverIds).catch(() => [] as FinancialTransaction[]),
          api.getDriverMetrics().catch(() => [] as DriverMetrics[]),
          api.getAllFuelEntries().catch(() => [] as any[]),
          vehicleId
            ? api.getFuelEntriesByVehicle(vehicleId).catch(() => [] as any[])
            : Promise.resolve([] as any[]),
        ]);
        if (cancelled) return;
        const combined = tripBatches.flat();
        const uniqueTrips = Array.from(new Map(combined.map((t) => [t.id, t])).values());
        setTrips(uniqueTrips);
        setTransactions(Array.isArray(txData) ? txData : []);
        const myMetrics = (metricsData || []).filter(
          (m) =>
            m.driverId === user.id ||
            (driverRecord?.id && m.driverId === driverRecord.id) ||
            (driverRecord?.driverId && m.driverId === driverRecord.driverId),
        );
        setMetrics(myMetrics);

        // Fuel entries for this driver (vehicle first, then driver-id match) — all weeks
        const fuelMap = new Map<string, any>();
        (vehicleFuel || []).forEach((f: any) => {
          if (f?.id) fuelMap.set(f.id, f);
        });
        (allFuel || []).forEach((f: any) => {
          if (!f?.id || fuelMap.has(f.id)) return;
          if (driverIds.includes(f.driverId) || driverIds.includes(f.driver_id)) {
            fuelMap.set(f.id, f);
          }
        });
        setFuelEntries(Array.from(fuelMap.values()));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load fleet settlement');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, driverRecord?.id, driverRecord?.driverId, driverRecord?.assignedVehicleId]);

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Fleet Settlement</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cash outstanding vs paid to your fleet by week. Expenses here are what you already
            logged — add new ones from the Expenses menu.
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { id: 'cash' as const, label: 'Cash Settlement', icon: Scale },
            { id: 'expenses' as const, label: 'Expenses', icon: Receipt },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              tab === id
                ? 'bg-[#004ac6] text-white'
                : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : (
        <>
          {tab === 'cash' && (
            <FleetCashSettlementTab
              trips={trips}
              transactions={transactions}
              csvMetrics={metrics}
            />
          )}
          {tab === 'expenses' && (
            <FleetExpensesSettlementTab
              transactions={transactions}
              fuelEntries={fuelEntries}
            />
          )}
        </>
      )}
    </div>
  );
}
