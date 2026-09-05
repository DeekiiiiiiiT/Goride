import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { TransactionKpis } from '../utils/fuelLogKpiMetrics';

export type FuelLogSummary = {
  totalFills: number;
  totalSpend: number;
  totalVolume: number;
  totalKm: number;
  totalCycles: number;
  totalDistance: number;
  totalFuel: number;
};

export type UseFuelLogSummaryParams = {
  startDate?: string;
  endDate?: string;
  /** Pass undefined / 'all' to request fleet-wide summary. */
  vehicleId?: string;
  /** When false, skip the network call (e.g. cycles tab). */
  enabled?: boolean;
};

/**
 * Server KPI roll-up for Fuel Logs (GET /fuel/log-summary).
 * Keyed on period + vehicle. Unfiltered by search/integrity — callers must
 * fall back to client KPIs when extra filters are active (KPI≡list invariant).
 */
export function useFuelLogSummary(params: UseFuelLogSummaryParams): {
  summary: FuelLogSummary | null;
  isLoading: boolean;
  error: string | null;
} {
  const { startDate, endDate, vehicleId, enabled = true } = params;
  const [summary, setSummary] = useState<FuelLogSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .getFuelLogSummary({
        startDate,
        endDate,
        vehicleId: vehicleId && vehicleId !== 'all' ? vehicleId : undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setSummary({
          totalFills: Number(res.totalFills) || 0,
          totalSpend: Number(res.totalSpend) || 0,
          totalVolume: Number(res.totalVolume) || 0,
          totalKm: Number(res.totalKm ?? res.totalDistance) || 0,
          totalCycles: Number(res.totalCycles) || 0,
          totalDistance: Number(res.totalDistance ?? res.totalKm) || 0,
          totalFuel: Number(res.totalFuel ?? res.totalVolume) || 0,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSummary(null);
        setError(String(err?.message || err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, vehicleId, enabled]);

  return { summary, isLoading, error };
}

/** Merge server roll-up totals onto a client KPI shell (keeps imbalance/source counts). */
export function mergeServerTransactionKpis(
  client: TransactionKpis,
  server: FuelLogSummary | null,
): TransactionKpis {
  if (!server) return client;
  return {
    ...client,
    totalFills: server.totalFills,
    totalSpend: server.totalSpend,
    totalVolume: server.totalVolume,
    totalKm: server.totalKm || server.totalDistance,
    populationNote: 'Server log-summary (period + vehicle)',
  };
}
