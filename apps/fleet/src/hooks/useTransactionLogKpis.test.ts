import { describe, expect, it } from 'vitest';
import type { TransactionKpis } from '../utils/fuelLogKpiMetrics';
import {
  hasExtraTransactionFilters,
  resolveTransactionKpisDisplay,
} from './useTransactionLogKpis';
import type { FuelLogSummary } from './useFuelLogSummary';

const client: TransactionKpis = {
  totalFills: 4,
  totalSpend: 200,
  totalVolume: 20,
  totalKm: 100,
  imbalancedCount: 1,
  sourcePortal: 2,
  sourceAdmin: 1,
  sourceAnchors: 1,
  populationNote: 'client',
};

const server: FuelLogSummary = {
  totalFills: 9,
  totalSpend: 500,
  totalVolume: 40,
  totalKm: 250,
  totalCycles: 3,
  totalDistance: 250,
  totalFuel: 40,
  sourcePortal: 5,
  sourceAdmin: 3,
  sourceAnchors: 1,
};

describe('hasExtraTransactionFilters', () => {
  it('is false when all filters are idle', () => {
    expect(
      hasExtraTransactionFilters({
        searchTerm: '',
        filterType: 'all',
        filterDriver: 'all',
        filterAnchor: 'all',
        filterStatus: 'all',
        filterSource: 'all',
        filterIntegrity: 'all',
        filterCycleId: null,
      }),
    ).toBe(false);
  });

  it('is true when search or any filter is set', () => {
    expect(
      hasExtraTransactionFilters({
        searchTerm: 'Roomy',
        filterType: 'all',
        filterDriver: 'all',
        filterAnchor: 'all',
        filterStatus: 'all',
        filterSource: 'all',
        filterIntegrity: 'all',
        filterCycleId: null,
      }),
    ).toBe(true);
  });
});

describe('resolveTransactionKpisDisplay', () => {
  it('keeps client when extra filters are on', () => {
    const next = resolveTransactionKpisDisplay({
      client,
      hasExtraTxnFilters: true,
      summaryLoading: false,
      summaryError: null,
      serverSummary: server,
    });
    expect(next).toBe(client);
  });

  it('replaces whole tile from server when unfiltered and ready', () => {
    const next = resolveTransactionKpisDisplay({
      client,
      hasExtraTxnFilters: false,
      summaryLoading: false,
      summaryError: null,
      serverSummary: server,
    });
    expect(next.totalFills).toBe(9);
    expect(next.sourcePortal).toBe(5);
    expect(next.imbalancedCount).toBe(1);
    expect(next.populationNote).toContain('Server log-summary');
  });

  it('falls back to local totals when summary errors', () => {
    const next = resolveTransactionKpisDisplay({
      client,
      hasExtraTxnFilters: false,
      summaryLoading: false,
      summaryError: 'network',
      serverSummary: null,
    });
    expect(next.totalFills).toBe(4);
    expect(next.populationNote).toContain('Local totals');
  });
});
