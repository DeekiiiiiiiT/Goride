/**
 * @vitest-environment jsdom
 * Wave 3 — Bulk finalize hard-gate message (H3) + empty dialog chrome.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  bulkEarlyGateFailure,
  FuelBulkFinalizeDialog,
} from './FuelBulkFinalizeDialog';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelDispute } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';

vi.mock('../../../services/api', () => ({
  api: {
    getPreferences: vi.fn(async () => ({})),
    getFinalizedReports: vi.fn(async () => []),
  },
}));

function period(partial: Partial<FuelReconciliationPeriod> = {}): FuelReconciliationPeriod {
  return {
    id: 'w1',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    label: 'Jul 6 – Jul 12',
    status: 'outstanding',
    locked: false,
    vehicleCount: 1,
    totalSpend: 10_000,
    netLeakage: 0,
    companyShare: 5_000,
    driverShare: 5_000,
    actionableTotal: 0,
    exceptionCount: 0,
    counts: emptyFuelStepCounts(),
    ...partial,
  };
}

describe('FuelBulkFinalizeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty outstanding copy when nothing to finalize', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FuelBulkFinalizeDialog
          open
          onOpenChange={() => undefined}
          periods={[]}
          vehicles={[]}
          drivers={[]}
          fuelEntries={[]}
          adjustments={[]}
          scenarios={[]}
          fuelCards={[]}
          onComplete={() => undefined}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/nothing outstanding to finalize/i)).toBeTruthy();
  });

  it('hard-gates open disputes with a named Blocked message', () => {
    const vehicle = {
      id: 'v1',
      licensePlate: '5179KZ',
      make: 'Toyota',
      model: 'Corolla',
    } as Vehicle;
    const dispute: FuelDispute = {
      id: 'disp-1',
      status: 'Open',
      weekStart: '2026-07-06',
      vehicleId: 'v1',
      driverId: 'd1',
      reason: 'Other',
      description: 'Gap',
      createdAt: '2026-07-07T00:00:00Z',
    };
    const msg = bulkEarlyGateFailure(
      period(),
      [
        {
          driverId: 'd1',
          vehicleId: 'v1',
          vehicleIds: ['v1'],
          weekStart: '2026-07-06',
          weekEnd: '2026-07-12',
          totalGasCardCost: 1_000,
          driverShare: 500,
          companyShare: 500,
          miscellaneousCost: 0,
        } as any,
      ],
      [],
      [dispute],
      [vehicle],
      [],
      [],
    );
    expect(msg).toMatch(/Blocked — .*open dispute/i);
  });
});
