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
  sourcePortal: number;
  sourceAdmin: number;
  sourceAnchors: number;
  truncated?: boolean;
  entryCount?: number;
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
        // Stale edge builds omit source* fields and used cycle-distance for totalKm — reject them.
        if (res == null || typeof res.sourcePortal !== 'number' || typeof res.sourceAdmin !== 'number') {
          setSummary(null);
          setError('Server summary schema outdated — using local totals');
          return;
        }
        setSummary({
          totalFills: Number(res.totalFills) || 0,
          totalSpend: Number(res.totalSpend) || 0,
          totalVolume: Number(res.totalVolume) || 0,
          totalKm: Number(res.totalKm) || 0,
          totalCycles: Number(res.totalCycles) || 0,
          totalDistance: Number(res.totalDistance ?? res.totalKm) || 0,
          totalFuel: Number(res.totalFuel ?? res.totalVolume) || 0,
          sourcePortal: Number(res.sourcePortal) || 0,
          sourceAdmin: Number(res.sourceAdmin) || 0,
          sourceAnchors: Number(res.sourceAnchors) || 0,
          truncated: !!res.truncated,
          entryCount: Number(res.entryCount) || undefined,
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

/**
 * Replace the whole fills tile set from the server (never half-merge).
 * Keeps client imbalancedCount until integrity is server-owned.
 */
export function replaceServerTransactionKpis(
  client: TransactionKpis,
  server: FuelLogSummary | null,
): TransactionKpis {
  if (!server) return client;
  return {
    ...client,
    totalFills: server.totalFills,
    totalSpend: server.totalSpend,
    totalVolume: server.totalVolume,
    totalKm: server.totalKm,
    sourcePortal: server.sourcePortal,
    sourceAdmin: server.sourceAdmin,
    sourceAnchors: server.sourceAnchors,
    populationNote: server.truncated
      ? 'Server log-summary (truncated — narrow the period)'
      : 'Server log-summary (period + vehicle)',
  };
}

/** @deprecated Use replaceServerTransactionKpis — kept for import safety during HMR. */
export const mergeServerTransactionKpis = replaceServerTransactionKpis;
