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
  cashSpend: 80,
  gasCardSpend: 120,
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

  it('keeps client when service-line lens is active (Delivery/Rideshare tab)', () => {
    const next = resolveTransactionKpisDisplay({
      client,
      hasExtraTxnFilters: false,
      summaryLoading: false,
      summaryError: null,
      serverSummary: server,
      serviceLineLensActive: true,
    });
    expect(next).toBe(client);
    expect(next.totalFills).toBe(4);
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
    expect(next.cashSpend).toBe(80);
    expect(next.gasCardSpend).toBe(120);
  });

  it('uses the server cash and gas card split when the summary includes it', () => {
    const next = resolveTransactionKpisDisplay({
      client,
      hasExtraTxnFilters: false,
      summaryLoading: false,
      summaryError: null,
      serverSummary: { ...server, cashSpend: 200, gasCardSpend: 300 },
    });
    expect(next.totalSpend).toBe(500);
    expect(next.cashSpend).toBe(200);
    expect(next.gasCardSpend).toBe(300);
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
