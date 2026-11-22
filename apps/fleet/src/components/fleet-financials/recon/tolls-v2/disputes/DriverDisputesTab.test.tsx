/**
 * @vitest-environment jsdom
 *
 * UI2 — Driver Settlements → Disputes tab (audit C3) on public.toll_v2_disputes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { disputeRow } from '../fixtures/deskPartsFixture';
import { TollV2CommandError } from '../../../../../services/tollV2CommandError';

const tollV2Command = vi.fn();
vi.mock('../../../../../services/api', () => ({
  api: { tollV2Command: (...args: unknown[]) => tollV2Command(...args) },
}));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) } }));

const rpc = vi.fn();
vi.mock('../../../../../utils/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { DriverDisputesTab } from './DriverDisputesTab';
import { disputeTiles } from './useTollV2Disputes';

const ROWS = [
  disputeRow({ id: 'a', daysLeft: 1, red: true, late: true, plazaName: 'Spanish Town', tollMinor: 28000, paidMinor: 26000 }),
  disputeRow({ id: 'b' }),
  disputeRow({
    id: 'c',
    version: 5,
    state: 'sent',
    driverId: 'd2',
    driverName: 'Marlon Andre Sterling',
    plate: '8421LA',
    canMarkSent: false,
    canLost: true,
    canRefundReceived: true,
    chargeWeekKey: '2026-11-02',
  }),
];

function wrap(onOpenWeek = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DriverDisputesTab onOpenWeek={onOpenWeek} />
    </QueryClientProvider>,
  );
  return onOpenWeek;
}

describe('Driver Settlements — Disputes tab (UI2)', () => {
  beforeEach(() => {
    tollV2Command.mockReset();
    tollV2Command.mockResolvedValue({});
    toastError.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: {
        active: ROWS,
        byDriver: [
          { driverId: 'd1', driverName: 'Kenny G. Rattray', toSend: 2, sent: 0, late: 1, leftMinor: 4000 },
          { driverId: 'd2', driverName: 'Marlon Andre Sterling', toSend: 0, sent: 1, late: 0, leftMinor: 2000 },
        ],
      },
      error: null,
    });
  });

  it('reads every driver once (p_driver null) and shows the three tiles', async () => {
    wrap();
    await screen.findByTestId('toll-v2-disputes-tab');
    expect(rpc).toHaveBeenCalledWith('toll_v2_disputes', { p_driver: null });
    expect(screen.getByTestId('toll-v2-tab-tile-to-send').textContent).toMatch(/2· J\$40\.00/);
    expect(screen.getByTestId('toll-v2-tab-tile-sent').textContent).toMatch(/1· J\$20\.00/);
    expect(screen.getByTestId('toll-v2-tab-tile-late').textContent).toMatch(/1· J\$20\.00/);
  });

  it('each row has only the buttons its state allows; never Refund received', async () => {
    wrap();
    const toSend = await screen.findByTestId('toll-v2-tab-dispute-b');
    // the driver marks it sent in Roam Driver; Fleet shows the status only (owner 21 Nov)
    expect(within(toSend).queryByTestId('toll-v2-tab-mark-sent')).toBeNull();
    expect(toSend.textContent).toMatch(/Waiting on driver to dispute/);
    expect(within(toSend).queryByTestId('toll-v2-tab-lost')).toBeNull();
    const sentRow = screen.getByTestId('toll-v2-tab-dispute-c');
    expect(within(sentRow).queryByTestId('toll-v2-tab-mark-sent')).toBeNull();
    expect(within(sentRow).getByTestId('toll-v2-tab-lost')).toBeTruthy();
    expect(within(sentRow).getByText('Week of 2 Nov')).toBeTruthy();
    expect(screen.queryByText('Refund received')).toBeNull();
  });

  it('a driver chip filters the list but the tiles still count everyone', async () => {
    wrap();
    fireEvent.click(await screen.findByTestId('toll-v2-driver-chip-Marlon Andre Sterling'));
    expect(screen.queryByTestId('toll-v2-tab-dispute-a')).toBeNull();
    expect(screen.getByTestId('toll-v2-tab-dispute-c')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-disputes-driver-card').textContent).toMatch(/1 open · J\$20\.00 still owed by Uber/);
    expect(screen.getByTestId('toll-v2-tab-tile-to-send').textContent).toMatch(/2· J\$40\.00/);
  });

  it('Lost needing a second person asks the only manager for a reason and resends', async () => {
    tollV2Command.mockImplementation(async (intent: string, body: Record<string, unknown>) => {
      if (!body.self_approval_reason) throw new TollV2CommandError('x', 409, 'NEEDS_APPROVAL', { sole_manager: true });
      return {};
    });
    wrap();
    fireEvent.click(within(await screen.findByTestId('toll-v2-tab-dispute-c')).getByTestId('toll-v2-tab-lost'));
    fireEvent.click(await screen.findByTestId('toll-v2-lost-confirm'));
    const ask = await screen.findByTestId('toll-v2-approval-dialog');
    fireEvent.change(within(ask).getByTestId('toll-v2-approval-reason'), { target: { value: 'Uber said no in writing' } });
    fireEvent.click(within(ask).getByTestId('toll-v2-approval-confirm'));
    await waitFor(() =>
      expect(tollV2Command).toHaveBeenLastCalledWith(
        'close_dispute_lost',
        expect.objectContaining({ dispute_id: 'c', expected_dispute_version: 5, self_approval_reason: 'Uber said no in writing' }),
      ),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('Open week opens the week the toll belongs to', async () => {
    const onOpenWeek = wrap();
    fireEvent.click(within(await screen.findByTestId('toll-v2-tab-dispute-c')).getByTestId('toll-v2-tab-open-week'));
    expect(onOpenWeek).toHaveBeenCalledWith('2026-11-02');
  });

  it('nothing open → the empty state', async () => {
    rpc.mockResolvedValue({ data: { active: [], byDriver: [] }, error: null });
    wrap();
    expect(await screen.findByTestId('toll-v2-disputes-tab-empty')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-tab-tile-late').textContent).toMatch(/0· J\$0\.00/);
  });

  it('tiles: Late overlaps To send and Sent', () => {
    expect(disputeTiles(ROWS)).toEqual({
      toSend: { count: 2, amountMinor: 4000 },
      sent: { count: 1, amountMinor: 2000 },
      late: { count: 1, amountMinor: 2000 },
    });
  });
});
