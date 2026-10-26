import { useCallback, useEffect, useState } from 'react';
import { GasStationAnalytics } from '../stations/GasStationAnalytics';
import { fleetCustomerOpsApi } from '../services/fleetCustomerOpsApi';
import type { FuelEntry } from '../types/fuel';

export function StationAnalyticsPage() {
  const [logs, setLogs] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await fleetCustomerOpsApi.getAllFuelEntriesInRange({ pageSize: 1500 });
      setLogs(entries);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : 'Couldn’t load station analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-semibold text-slate-900">Station analytics</h1>
        <p className="mt-2 text-sm text-slate-600">Couldn’t load — retry</p>
        <button type="button" className="mt-4 text-sm font-medium underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!loading && logs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-semibold text-slate-900">Station analytics</h1>
        <p className="mt-2 text-sm text-slate-600">No fuel entries in this window.</p>
      </div>
    );
  }

  return <GasStationAnalytics logs={logs} loading={loading} onRequestRefresh={() => void load()} />;
}
