/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deskAug24Fixture } from './fixtures/deskAug24Fixture';
import { TollV2CommandError } from '../../../../services/tollV2CommandError';

const tollV2Command = vi.fn();
vi.mock('../../../../services/api', () => ({
  api: { tollV2Command: (...args: unknown[]) => tollV2Command(...args) },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const fetchDesk = vi.fn();
vi.mock('./useTollV2Desk', () => ({
  useTollV2Desk: () => ({
    isLoading: false,
    isError: false,
    data: fetchDesk(),
    refetch: vi.fn(),
  }),
}));

const weeksOverview = vi.hoisted(() => ({
  openWeek: '2026-08-24',
  takeBacks: [] as Array<{
    id: string;
    amountMinor: number;
    reference?: string;
    paidOn?: string;
    driverName?: string;
    candidates: Array<{
      paybackId: string;
      version: number;
      weekKey: string;
      amountMinor?: number;
      weekSealed?: boolean;
      weekPaid?: boolean;
      trip?: { pickupAt?: string };
    }>;
  }>,
  weeks: [] as unknown[],
}));

vi.mock('./useTollV2Weeks', () => ({
  useTollV2Weeks: () => ({ data: weeksOverview }),
}));

vi.mock('../../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ can: () => true, canView: () => true, permissions: [] }),
}));

vi.mock('./TollV2SummaryPortal', () => ({
  TollV2SummaryPortal: () => null,
}));

vi.mock('./tollV2DecisionToast', () => ({
  toastAfterTollDecision: vi.fn().mockResolvedValue(undefined),
}));

import { ReconTollsV2Step } from './ReconTollsV2Step';

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ReconTollsV2Step', () => {
  const unhandled: Array<unknown> = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    tollV2Command.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    weeksOverview.takeBacks = [];
    weeksOverview.openWeek = '2026-08-24';
    fetchDesk.mockReturnValue(deskAug24Fixture());
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });

  it('renders sections, tile balance, and progress', () => {
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    expect(screen.getByTestId('toll-v2-tiles')).toBeTruthy();
    expect(screen.queryByTestId('toll-v2-tiles-mismatch')).toBeNull();
    expect(screen.getByTestId('toll-v2-progress').textContent).toMatch(/1 of 13 tolls decided/);
    expect(screen.getByText('Suggested matches')).toBeTruthy();
    expect(screen.getByText('Pick the right trip')).toBeTruthy();
    expect(screen.getByText('Tolls with no trip')).toBeTruthy();
    expect(screen.getByText('13 total transactions')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-compact-empty-duplicates')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-compact-empty-paybacks')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-seal-sum-line').textContent).toMatch(/^Spend /);
  });

  it('seal is disabled while blockers exist', () => {
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    const seal = screen.getByTestId('toll-v2-seal-button') as HTMLButtonElement;
    expect(seal.disabled).toBe(true);
  });

  it('Confirm sends apply_suggestion', async () => {
    tollV2Command.mockResolvedValue({});
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    const buttons = screen.getAllByRole('button', { name: 'Confirm' });
    fireEvent.click(buttons[0]!);
    await waitFor(() => {
      expect(tollV2Command).toHaveBeenCalledWith(
        'apply_suggestion',
        expect.objectContaining({
          suggestion_id: expect.stringMatching(/^sug-/),
          expected_charge_version: 1,
          expected_payback_version: 1,
          command_id: expect.any(String),
        }),
      );
    });
  });

  it('VERSION_CHANGED on Confirm shows card and no success toast', async () => {
    tollV2Command.mockRejectedValue(
      new TollV2CommandError('conflict', 409, 'VERSION_CHANGED', {}),
    );
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0]!);
    await waitFor(() => {
      expect(screen.getByTestId('toll-v2-version-changed')).toBeTruthy();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('VERSION_CHANGED on late move shows card and no success toast', async () => {
    tollV2Command.mockRejectedValue(
      new TollV2CommandError('conflict', 409, 'VERSION_CHANGED', {}),
    );
    fetchDesk.mockReturnValue(
      deskAug24Fixture({
        sealed: true,
        paid: true,
        openWeek: '2026-08-31',
        late: [
          {
            kind: 'late_charge',
            id: 'late-c1',
            version: 2,
            amountMinor: 50000,
            plazaName: 'Portmore',
            at: '2026-08-26T12:00:00-05:00',
          },
        ],
        blockers: [],
      }),
    );
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Move to/ }));
    await waitFor(() => {
      expect(screen.getByTestId('toll-v2-version-changed')).toBeTruthy();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('VERSION_CHANGED on take-back shows card and no success toast', async () => {
    tollV2Command.mockRejectedValue(
      new TollV2CommandError('conflict', 409, 'VERSION_CHANGED', {}),
    );
    weeksOverview.takeBacks = [
      {
        id: 'tb1',
        amountMinor: 37000,
        reference: 'uber-ref',
        paidOn: '2026-08-27',
        driverName: 'Kenny',
        candidates: [
          {
            paybackId: 'pb-tb',
            version: 1,
            weekKey: '2026-08-24',
            amountMinor: 37000,
            weekSealed: false,
            weekPaid: false,
            trip: { pickupAt: '2026-08-27T14:02:00-05:00' },
          },
        ],
      },
    ];
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record the take-back' }));
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /The driver pays it back/ }));
    const recordButtons = screen.getAllByRole('button', { name: 'Record the take-back' });
    fireEvent.click(recordButtons.at(-1)!);
    await waitFor(() => {
      expect(screen.getByTestId('toll-v2-version-changed')).toBeTruthy();
    });
    expect(toastSuccess).not.toHaveBeenCalledWith('Take-back recorded');
  });

  it('sealed desk shows no Confirm or Undo', () => {
    fetchDesk.mockReturnValue(
      deskAug24Fixture({
        sealed: true,
        blockers: [],
        charges: deskAug24Fixture().charges.map((c) => ({ ...c, state: 'decided', section: 'decided' })),
      }),
    );
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByText(/Sealed/)).toBeTruthy();
  });

  it('carry_forward late charge when week paid', async () => {
    tollV2Command.mockResolvedValue({});
    fetchDesk.mockReturnValue(
      deskAug24Fixture({
        sealed: true,
        paid: true,
        openWeek: '2026-08-31',
        late: [
          {
            kind: 'late_charge',
            id: 'late-c1',
            version: 2,
            amountMinor: 50000,
            plazaName: 'Portmore',
            at: '2026-08-26T12:00:00-05:00',
          },
        ],
        blockers: [],
      }),
    );
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Move to/ }));
    await waitFor(() => {
      expect(tollV2Command).toHaveBeenCalledWith(
        'carry_forward',
        expect.objectContaining({
          kind: 'charge',
          charge_id: 'late-c1',
          expected_charge_version: 2,
        }),
      );
    });
  });

  it('reopen_week shows REOPEN_INSTEAD in dialog', async () => {
    tollV2Command.mockRejectedValue(
      new TollV2CommandError('paid', 409, 'REOPEN_INSTEAD', {}),
    );
    fetchDesk.mockReturnValue(
      deskAug24Fixture({ sealed: true, paid: true, blockers: [] }),
    );
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Reopen tolls' })[0]!);
    fireEvent.change(screen.getByPlaceholderText('Why reopen?'), { target: { value: 'Correction needed' } });
    const confirm = screen.getAllByRole('button', { name: 'Reopen tolls' }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(screen.getByText(/Paid weeks can't be reopened/)).toBeTruthy();
    });
  });

  it('confirm-all continues after one refusal', async () => {
    let n = 0;
    tollV2Command.mockImplementation(async () => {
      n += 1;
      if (n === 2) {
        throw new TollV2CommandError('x', 409, 'VERSION_CHANGED', {});
      }
      return {};
    });
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('toll-v2-confirm-all-open'));
    fireEvent.click(screen.getByTestId('toll-v2-confirm-all'));
    await waitFor(() => expect(tollV2Command.mock.calls.length).toBeGreaterThanOrEqual(5));
  });

  it('confirm-all continues after one failed row', async () => {
    let n = 0;
    tollV2Command.mockImplementation(async () => {
      n += 1;
      if (n === 1) throw new Error('server');
      return {};
    });
    wrap(
      <ReconTollsV2Step weekKey="2026-08-24" summaryTarget={null} onGoToTagAccount={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('toll-v2-confirm-all-open'));
    fireEvent.click(screen.getByTestId('toll-v2-confirm-all'));
    await waitFor(() => expect(tollV2Command.mock.calls.length).toBeGreaterThanOrEqual(5));
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/matched/));
    });
  });
});
