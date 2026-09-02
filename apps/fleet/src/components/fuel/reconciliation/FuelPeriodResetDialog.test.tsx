/**
 * @vitest-environment jsdom
 * Wave 3 — Reopen dialog requires reason + week label confirm.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FuelPeriodResetDialog } from './FuelPeriodResetDialog';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

const resetFuelPeriod = vi.fn(async () => ({
  snapshots: 1,
  resetFuelEntries: 2,
  deletedTransactions: 3,
  driverIds: ['d1'],
  vehicleIds: ['v1'],
}));

vi.mock('../../../services/api', () => ({
  api: {
    resetFuelPeriod: (...args: unknown[]) => resetFuelPeriod(...args),
  },
}));

vi.mock('./fuelReconBusyLock', () => ({
  useFuelReconBusy: () => ({
    runExclusive: async (_msg: string, fn: () => Promise<unknown>) => fn(),
    busy: false,
  }),
}));

const period: FuelReconciliationPeriod = {
  id: '2026-07-06',
  startDate: '2026-07-06',
  endDate: '2026-07-12',
  label: 'Jul 6 – Jul 12',
  status: 'completed',
  locked: true,
  vehicleCount: 1,
  totalSpend: 20_000,
  netLeakage: 0,
  companyShare: 10_000,
  driverShare: 10_000,
  actionableTotal: 0,
  exceptionCount: 0,
  counts: emptyFuelStepCounts(),
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FuelPeriodResetDialog', () => {
  beforeEach(() => {
    resetFuelPeriod.mockClear();
    resetFuelPeriod.mockImplementation(async (weekKey: string, opts?: { dryRun?: boolean }) => {
      if (opts?.dryRun) {
        return {
          snapshots: 1,
          resetFuelEntries: 2,
          deletedTransactions: 3,
          driverIds: ['d1'],
          vehicleIds: ['v1'],
        };
      }
      return { ok: true };
    });
  });

  it('keeps Reopen disabled until reason and confirm label match', async () => {
    const user = userEvent.setup();
    wrap(
      <FuelPeriodResetDialog
        open
        onOpenChange={() => undefined}
        period={period}
        onComplete={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/1 finalized snapshot/i)).toBeTruthy();
    });

    const reopenBtn = screen.getByRole('button', { name: /^Reopen week$/i });
    expect(reopenBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/reason for reopen/i), 'ab');
    expect(reopenBtn).toBeDisabled();

    await user.clear(screen.getByLabelText(/reason for reopen/i));
    await user.type(screen.getByLabelText(/reason for reopen/i), 'Corrected odometer gap');
    expect(reopenBtn).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^Fill$/i }));
    expect(reopenBtn).not.toBeDisabled();
  });
});
