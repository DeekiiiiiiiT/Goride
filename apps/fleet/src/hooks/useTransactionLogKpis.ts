import { useMemo } from 'react';
import type { FuelEntry } from '../types/fuel';
import {
  buildTransactionKpis,
  type TransactionKpis,
} from '../utils/fuelLogKpiMetrics';
import {
  useFuelLogSummary,
  replaceServerTransactionKpis,
  type FuelLogSummary,
} from './useFuelLogSummary';

export type TransactionLogFilterFlags = {
  searchTerm: string;
  filterType: string;
  filterDriver: string;
  filterAnchor: string;
  filterStatus: string;
  filterSource: string;
  filterIntegrity: string;
  filterCycleId: string | null;
};

/** Extra filters beyond period/vehicle → client KPIs only (KPI≡list). */
export function hasExtraTransactionFilters(flags: TransactionLogFilterFlags): boolean {
  return (
    !!flags.searchTerm.trim() ||
    flags.filterType !== 'all' ||
    flags.filterDriver !== 'all' ||
    flags.filterAnchor !== 'all' ||
    flags.filterStatus !== 'all' ||
    flags.filterSource !== 'all' ||
    flags.filterIntegrity !== 'all' ||
    !!flags.filterCycleId
  );
}

/**
 * Pure provenance decision — unit-tested so replace-vs-local rules cannot drift.
 */
export function resolveTransactionKpisDisplay(args: {
  client: TransactionKpis;
  hasExtraTxnFilters: boolean;
  summaryLoading: boolean;
  summaryError: string | null;
  serverSummary: FuelLogSummary | null;
}): TransactionKpis {
  const { client, hasExtraTxnFilters, summaryLoading, summaryError, serverSummary } = args;
  if (hasExtraTxnFilters) return client;
  if (summaryLoading && !serverSummary) {
    return { ...client, populationNote: 'Loading server totals…' };
  }
  if (summaryError || !serverSummary) {
    return { ...client, populationNote: 'Local totals (server summary unavailable)' };
  }
  return replaceServerTransactionKpis(client, serverSummary);
}

export type UseTransactionLogKpisParams = {
  activeView: 'transactions' | 'cycles';
  periodStart?: string;
  periodEnd?: string;
  filterVehicle: string;
  filters: TransactionLogFilterFlags;
  filteredEntries: FuelEntry[];
  validAnchorIds: Set<string>;
  ledgerIntegrity: Map<string, string>;
};

/**
 * Owns Transaction Logs KPI authority: server roll-up when unfiltered,
 * client buildTransactionKpis when filters are active or summary fails.
 */
export function useTransactionLogKpis(params: UseTransactionLogKpisParams): {
  transactionKpis: TransactionKpis;
  summaryLoading: boolean;
  summaryError: string | null;
  hasExtraTxnFilters: boolean;
  serverSummary: FuelLogSummary | null;
} {
  const {
    activeView,
    periodStart,
    periodEnd,
    filterVehicle,
    filters,
    filteredEntries,
    validAnchorIds,
    ledgerIntegrity,
  } = params;

  const hasExtraTxnFilters = hasExtraTransactionFilters(filters);

  const {
    summary: serverSummary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useFuelLogSummary({
    startDate: periodStart,
    endDate: periodEnd,
    vehicleId: filterVehicle,
    enabled: activeView === 'transactions' && !hasExtraTxnFilters,
  });

  const clientTransactionKpis = useMemo(() => {
    const integrityById = new Map<string, string>();
    for (const [id, status] of ledgerIntegrity.entries()) integrityById.set(id, status);
    return buildTransactionKpis(filteredEntries, {
      validAnchorIds,
      integrityById,
    });
  }, [filteredEntries, validAnchorIds, ledgerIntegrity]);

  const transactionKpis = useMemo(
    () =>
      resolveTransactionKpisDisplay({
        client: clientTransactionKpis,
        hasExtraTxnFilters,
        summaryLoading,
        summaryError,
        serverSummary,
      }),
    [
      clientTransactionKpis,
      hasExtraTxnFilters,
      summaryLoading,
      summaryError,
      serverSummary,
    ],
  );

  return {
    transactionKpis,
    summaryLoading,
    summaryError,
    hasExtraTxnFilters,
    serverSummary,
  };
}
