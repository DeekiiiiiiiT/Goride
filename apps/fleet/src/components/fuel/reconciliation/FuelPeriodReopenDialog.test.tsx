/**
 * @vitest-environment jsdom
 * F-32b — Reopen uses the reversing reopen (POST /fuel/periods/:id/reopen), never Reset.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FuelPeriodReopenDialog, reopenErrorMessage } from './FuelPeriodReopenDialog';
import { emptyFuelStepCounts } from '../../../utils/fuelPeriodGating';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';

const ensure = vi.fn(async () => ({ id: 'period-uuid-1', version: 4 }));
const reopen = vi.fn(async () => ({ state: 'succeeded' }));
const toastError = vi.fn();

vi.mock('../../../services/api', () => ({
  api: {
    ensureFuelReconciliationPeriod: (...args: unknown[]) => ensure(...(args as [])),
    enqueueFuelPeriodReopen: (...args: unknown[]) => reopen(...(args as [])),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 't'),
    success: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('./fuelReconBusyLock', () => ({
  useFuelReconBusy: () => ({
    runExclusive: async (_msg: string, fn: () => Promise<unknown>) => fn(),
    busy: false,
  }),
}));

const period: FuelReconciliationPeriod = {
  id: '2026-11-16',
  startDate: '2026-11-16',
  endDate: '2026-11-22',
  label: 'Nov 16 – Nov 22',
  status: 'completed',
  locked: true,
  vehicleCount: 1,
  totalSpend: 24_500,
  netLeakage: 0,
  companyShare: 18_851.8,
  driverShare: 5_648.2,
  actionableTotal: 0,
  exceptionCount: 0,
  openFlaggedFillCount: 0,
  dataQualityVehicleActionable: 0,
  counts: emptyFuelStepCounts(),
  version: 3,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FuelPeriodReopenDialog', () => {
  beforeEach(() => {
    ensure.mockClear();
    reopen.mockClear();
    toastError.mockClear();
    reopen.mockImplementation(async () => ({ state: 'succeeded' }));
  });

  it('stays disabled until a 10-character reason and the week label are given', async () => {
    const user = userEvent.setup();
    wrap(<FuelPeriodReopenDialog open onOpenChange={() => undefined} period={period} onComplete={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Reopen week' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Why are you reopening/), 'too short');
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Why are you reopening/), '!!');
    expect(button).toBeEnabled();
  });

  it('reopens through the server period with its version and a stable idempotency key', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    wrap(<FuelPeriodReopenDialog open onOpenChange={() => undefined} period={period} onComplete={onComplete} />);
    await user.type(screen.getByLabelText(/Why are you reopening/), 'Corrected odometer gap 5179KZ');
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    await user.click(screen.getByRole('button', { name: 'Reopen week' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(ensure).toHaveBeenCalledWith({ weekStart: '2026-11-16', weekEnd: '2026-11-22' });
    expect(reopen).toHaveBeenCalledWith({
      periodId: 'period-uuid-1',
      version: 4,
      reason: 'Corrected odometer gap 5179KZ',
      idempotencyKey: 'reopen:period-uuid-1:v4',
    });
  });

  it('a failed reopen job says so and does not close as done', async () => {
    reopen.mockImplementation(async () => ({ state: 'failed', error: 'reopen_reverse_failure' }));
    const user = userEvent.setup();
    const onComplete = vi.fn();
    wrap(<FuelPeriodReopenDialog open onOpenChange={() => undefined} period={period} onComplete={onComplete} />);
    await user.type(screen.getByLabelText(/Why are you reopening/), 'Corrected odometer gap 5179KZ');
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    await user.click(screen.getByRole('button', { name: 'Reopen week' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(String(toastError.mock.calls[0][0])).toMatch(/stays locked/);
  });

  it('plain words for a settled week', () => {
    expect(reopenErrorMessage('week_settled')).toMatch(/settlement is closed/);
  });
});
