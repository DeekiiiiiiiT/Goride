/**
 * @vitest-environment jsdom
 * Wave 3 — Bulk finalize hard-gate message (H3) + empty dialog chrome.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  bulkEarlyGateFailure,
  bulkFinalizeExecuteGateFields,
  FuelBulkFinalizeDialog,
} from './FuelBulkFinalizeDialog';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelDispute } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';

const finalizeFuelWeekReports = vi.fn();

vi.mock('../../../services/api', () => ({
  api: {
    getPreferences: vi.fn(async () => ({})),
    getFinalizedReports: vi.fn(async () => []),
    ensureFuelReconciliationPeriod: vi.fn(async () => ({ id: 'p1', version: 1 })),
    reviewFuelPeriodLeakage: vi.fn(async () => ({ ok: true })),
    enqueueFuelPeriodFinalize: vi.fn(async () => ({ state: 'succeeded', ok: true })),
    getFuelReconciliationPeriod: vi.fn(async () => null),
  },
}));

vi.mock('../../../services/fuelService', () => ({
  fuelService: {
    getAllFuelEntriesInRange: vi.fn(async () => []),
  },
}));

vi.mock('../../../services/fuelFinalizeService', () => ({
  finalizeFuelWeekReports: (...args: unknown[]) => finalizeFuelWeekReports(...args),
}));

vi.mock('../../../utils/buildFuelWeekReportsForFinalize', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/buildFuelWeekReportsForFinalize')>(
    '../../../utils/buildFuelWeekReportsForFinalize',
  );
  return {
    ...actual,
    buildFuelWeekReportsWithGating: vi.fn(async () => ({
      reports: [
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
        },
      ],
      trips: [],
      gateResult: {
        hasExceptionBlockers: false,
        exceptionBlockers: [],
        hasUnapprovedFuelTxBlockers: false,
        unapprovedFuelTxBlockers: [],
        hasOverExplainedBlockers: false,
        overExplainedBlockers: [],
      },
    })),
  };
});

vi.mock('../../../utils/fuelWeekClosableGate', () => ({
  evaluateFuelWeekClosableClient: vi.fn(() => []),
  fuelWeekClosableBlockerMessage: vi.fn((b: string) => b),
}));

vi.mock('../../../utils/stopToStopClosableFlags', () => ({
  stopToStopClosableFlagsFromReports: vi.fn(() => ({})),
}));

vi.mock('./useFuelSettlementReopenGate', () => ({
  useFuelSettlementReopenGate: () => ({
    confirmIfNeeded: vi.fn(async () => true),
    dialog: null,
  }),
}));

vi.mock('./useFuelForceClientMoneyDialog', () => ({
  useFuelForceClientMoneyDialog: () => ({
    confirmForceClientMoney: vi.fn(async () => null),
    dialog: null,
  }),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, role: 'admin' }),
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
    leakageReviewed: true,
    ...partial,
  };
}

describe('FuelBulkFinalizeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    finalizeFuelWeekReports.mockResolvedValue({
      ok: true,
      snapshotCount: 1,
      successCount: 1,
      snapshots: [{ totalGasCardCost: 1_000 }],
      failures: [],
    });
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

  it('does not hard-gate unexplained when the period already accepted leakage', () => {
    const vehicle = {
      id: 'v1',
      licensePlate: '5179KZ',
      make: 'Toyota',
      model: 'Corolla',
    } as Vehicle;
    const msg = bulkEarlyGateFailure(
      period({ leakageReviewed: true, netLeakage: 500 }),
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
          miscellaneousCost: 500,
        } as any,
      ],
      [],
      [],
      [vehicle],
      [],
      [],
    );
    expect(msg).toBeNull();
  });

  it('bulkFinalizeExecuteGateFields reads leakage from the prepared period (N-2)', () => {
    const p = period({ leakageReviewed: true });
    expect(bulkFinalizeExecuteGateFields(p)).toEqual({
      periodCounts: p.counts,
      leakageReviewed: true,
    });
  });

  it('execute path calls finalize with period gate fields (N-2)', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const p = period({ leakageReviewed: true });
    render(
      <QueryClientProvider client={qc}>
        <FuelBulkFinalizeDialog
          open
          onOpenChange={() => undefined}
          periods={[p]}
          vehicles={[{ id: 'v1', licensePlate: '5179KZ' } as Vehicle]}
          drivers={[{ id: 'd1', name: 'Driver' }]}
          fuelEntries={[]}
          adjustments={[]}
          scenarios={[]}
          fuelCards={[]}
          onComplete={() => undefined}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /select all/i }));
    const boxes = screen.getAllByRole('checkbox');
    // Last checkbox is the extraAck acknowledgment.
    await user.click(boxes[boxes.length - 1]);
    const confirm = screen.getByPlaceholderText(/FINALIZE 1 WEEKS/i);
    await user.clear(confirm);
    await user.type(confirm, 'FINALIZE 1 WEEKS');
    await user.click(screen.getByRole('button', { name: /finalize 1 week/i }));

    await waitFor(() => expect(finalizeFuelWeekReports).toHaveBeenCalled());
    const opts = finalizeFuelWeekReports.mock.calls[0][1];
    expect(opts.leakageReviewed).toBe(true);
    expect(opts.periodCounts).toEqual(p.counts);
  });
});
