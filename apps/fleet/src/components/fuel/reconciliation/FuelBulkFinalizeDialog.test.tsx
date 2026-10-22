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
  loadWeekFlagDispositions,
} from './FuelBulkFinalizeDialog';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import type { FuelDispute } from '../../../types/fuel';
import type { Vehicle } from '../../../types/vehicle';

const { getFuelWeekSnapshot, enqueueFuelPeriodFinalize, listFuelFlagDispositions, getAllFuelEntriesInRange, getFuelPeriodClosable } = vi.hoisted(() => ({
  getFuelWeekSnapshot: vi.fn(async () => ({ version: 3, totalSpend: 1000, reports: [] as unknown[] })),
  enqueueFuelPeriodFinalize: vi.fn(async () => ({ state: 'succeeded', ok: true })),
  listFuelFlagDispositions: vi.fn(async () => ({
    dispositions: [] as unknown[],
    truncated: false,
  })),
  getAllFuelEntriesInRange: vi.fn(async () => [] as unknown[]),
  getFuelPeriodClosable: vi.fn(async () => ({ blockers: [] as Array<{ code: string; message: string }> })),
}));

vi.mock('../../../services/api', () => ({
  api: {
    getPreferences: vi.fn(async () => ({})),
    getFinalizedReports: vi.fn(async () => []),
    ensureFuelReconciliationPeriod: vi.fn(async () => ({ id: 'p1', version: 1 })),
    getFuelWeekSnapshot: (...args: unknown[]) => getFuelWeekSnapshot(...args),
    reviewFuelPeriodLeakage: vi.fn(async () => ({ ok: true })),
    enqueueFuelPeriodFinalize: (...args: unknown[]) => enqueueFuelPeriodFinalize(...args),
    getFuelReconciliationPeriod: vi.fn(async () => null),
    listFuelFlagDispositions: (...args: unknown[]) => listFuelFlagDispositions(...args),
    getFuelPeriodClosable: (...args: unknown[]) => getFuelPeriodClosable(...args),
  },
}));

vi.mock('../../../services/fuelService', () => ({
  fuelService: {
    getAllFuelEntriesInRange: (...args: unknown[]) => getAllFuelEntriesInRange(...args),
  },
}));

vi.mock('../../../services/fuelFinalizeService', () => ({
  finalizeFuelWeekReports: vi.fn(),
}));

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
    openFlaggedFillCount: 0,
    dataQualityVehicleActionable: 0,
    counts: emptyFuelStepCounts(),
    leakageReviewed: true,
    ...partial,
  };
}

describe('FuelBulkFinalizeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFuelFlagDispositions.mockResolvedValue({ dispositions: [], truncated: false });
    getAllFuelEntriesInRange.mockResolvedValue([]);
    getFuelWeekSnapshot.mockResolvedValue({ version: 3, totalSpend: 1000, reports: [] });
    enqueueFuelPeriodFinalize.mockResolvedValue({ state: 'succeeded', ok: true });
    getFuelPeriodClosable.mockResolvedValue({ blockers: [] });
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
      odometerChainReviewed: false,
      unattributedReviewed: false,
      stopToStopGapAccepts: p.stopToStopGapAccepts,
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

    await waitFor(() => expect(getFuelWeekSnapshot).toHaveBeenCalled());
    await waitFor(() => expect(enqueueFuelPeriodFinalize).toHaveBeenCalled());
    const args = enqueueFuelPeriodFinalize.mock.calls[0][0] as { snapshotVersion?: number };
    expect(args.snapshotVersion).toBe(3);
  });

  it('hydrates dispositions per week so week B dispositioned criticals finalize (R3-2)', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const weekA = period({
      id: '2026-07-06',
      startDate: '2026-07-06',
      endDate: '2026-07-12',
      label: 'Jul 6 – Jul 12',
      leakageReviewed: true,
    });
    const weekB = period({
      id: '2026-07-13',
      startDate: '2026-07-13',
      endDate: '2026-07-19',
      label: 'Jul 13 – Jul 19',
      leakageReviewed: true,
    });

    getAllFuelEntriesInRange.mockImplementation(async ({ startDate }: { startDate: string }) => {
      if (startDate === '2026-07-13') {
        return [{ id: 'eb', date: '2026-07-14', amount: 50 } as any];
      }
      return [{ id: 'ea', date: '2026-07-07', amount: 40 } as any];
    });
    listFuelFlagDispositions.mockImplementation(async (opts?: { entryIds?: string[] }) => {
      const ids = opts?.entryIds || [];
      if (ids.includes('eb')) {
        return {
          dispositions: [
            {
              entryId: 'eb',
              flagCode: 'integrity_critical',
              action: 'accepted',
              note: 'Desk accepted',
            },
          ],
          truncated: false,
        };
      }
      return { dispositions: [], truncated: false };
    });

    render(
      <QueryClientProvider client={qc}>
        <FuelBulkFinalizeDialog
          open
          onOpenChange={() => undefined}
          periods={[weekA, weekB]}
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
    await user.click(boxes[boxes.length - 1]);
    const confirm = screen.getByPlaceholderText(/FINALIZE 2 WEEKS/i);
    await user.clear(confirm);
    await user.type(confirm, 'FINALIZE 2 WEEKS');
    await user.click(screen.getByRole('button', { name: /finalize 2 weeks/i }));

    await waitFor(() => expect(getFuelWeekSnapshot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(enqueueFuelPeriodFinalize).toHaveBeenCalledTimes(2));
  });

  it('does not lock a week the server says is not closable', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const p = period({ leakageReviewed: true });

    getFuelPeriodClosable.mockResolvedValue({
      blockers: [{ code: 'null_org_fill', message: 'A fuel fill for this week is missing its company, so it was left out of the total. Repair it before locking.' }],
    });

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
    await user.click(boxes[boxes.length - 1]);
    const confirm = screen.getByPlaceholderText(/FINALIZE 1 WEEKS/i);
    await user.clear(confirm);
    await user.type(confirm, 'FINALIZE 1 WEEKS');
    await user.click(screen.getByRole('button', { name: /finalize 1 week/i }));

    await waitFor(() => {
      expect(screen.getByText(/missing its company/i)).toBeInTheDocument();
    });
    expect(enqueueFuelPeriodFinalize).not.toHaveBeenCalled();
  });

  it('loadWeekFlagDispositions returns typed failure reasons (R4-2 / R4-3)', async () => {
    await expect(
      loadWeekFlagDispositions(['a'], async () => {
        throw new Error('boom');
      }),
    ).resolves.toEqual({ ok: false, reason: 'load_failed' });

    await expect(
      loadWeekFlagDispositions(['a'], async () => ({
        dispositions: [],
        truncated: true,
      })),
    ).resolves.toEqual({ ok: false, reason: 'truncated' });

    const ok = await loadWeekFlagDispositions([], async () => {
      throw new Error('should not call');
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.map.size).toBe(0);
  });
});
