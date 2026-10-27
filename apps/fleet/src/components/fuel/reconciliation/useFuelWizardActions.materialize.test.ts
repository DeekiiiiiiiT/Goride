import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
const materializeFuelPeriod = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: {
    materializeFuelPeriod: (...args: unknown[]) => materializeFuelPeriod(...args),
    createFuelPeriod: vi.fn(),
  },
}));

import { materializeWizardPeriodCounts } from './useFuelWizardActions';

describe('materializeWizardPeriodCounts', () => {
  beforeEach(() => {
    toastError.mockReset();
    materializeFuelPeriod.mockReset();
  });

  it('does not toast on SNAPSHOTS_MISSING / legacy not-ready message', async () => {
    materializeFuelPeriod.mockRejectedValue(
      new Error(JSON.stringify({ error: 'SNAPSHOTS_MISSING', message: "Fuel totals aren't ready yet." })),
    );
    await materializeWizardPeriodCounts({
      serverPeriodId: 'org:2026-09-14',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      setServerPeriodId: vi.fn(),
      strip: {
        totalSpend: 0,
        gasCard: 0,
        cashFromEarnings: 0,
        company: 0,
        driver: 0,
        leakage: 0,
      },
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does not toast when materialize succeeds', async () => {
    materializeFuelPeriod.mockResolvedValue({ ok: true, money: 'pending_finalize' });
    await materializeWizardPeriodCounts({
      serverPeriodId: 'org:2026-09-14',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      setServerPeriodId: vi.fn(),
      strip: {
        totalSpend: 100,
        gasCard: 100,
        cashFromEarnings: 0,
        company: 50,
        driver: 50,
        leakage: 0,
      },
    });
    expect(toastError).not.toHaveBeenCalled();
    expect(materializeFuelPeriod).toHaveBeenCalled();
  });
});
