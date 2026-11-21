/**
 * @vitest-environment jsdom
 *
 * UI1 — the six-part Tolls step (audit C3) on the S3 week desk.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deskPartsFixture } from './fixtures/deskPartsFixture';
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
  useTollV2Desk: () => ({ isLoading: false, isError: false, data: fetchDesk(), refetch: vi.fn() }),
  fetchTollV2Desk: vi.fn(),
}));

const switches = vi.hoisted(() => ({ tollDisputes: true }));
vi.mock('./useTollV2Switches', () => ({
  useTollV2Switches: () => ({ data: { tollDisputes: switches.tollDisputes, loggedTrips: false, riderPaysDriver: true } }),
}));

vi.mock('./useTollV2Weeks', () => ({
  useTollV2Weeks: () => ({ data: { openWeek: '2026-11-16', takeBacks: [], weeks: [] } }),
}));
vi.mock('../../../../services/reconApi', () => ({ fetchTagAccountRollForward: vi.fn().mockResolvedValue(null) }));
vi.mock('./TollV2SummaryPortal', () => ({ TollV2SummaryPortal: () => null }));
vi.mock('./tollV2DecisionToast', () => ({
  toastAfterTollDecision: vi.fn().mockResolvedValue(undefined),
  toastAfterKeptPayback: vi.fn().mockResolvedValue(undefined),
}));

import { ReconTollsV2Step } from './ReconTollsV2Step';

function wrap(onGoToTagAccount = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReconTollsV2Step weekKey="2026-11-09" summaryTarget={null} onGoToTagAccount={onGoToTagAccount} />
    </QueryClientProvider>,
  );
}

function sent(intent: string) {
  return tollV2Command.mock.calls.filter((c) => c[0] === intent).map((c) => c[1] as Record<string, unknown>);
}

function goTo(part: number) {
  fireEvent.click(screen.getByTestId(`toll-v2-pill-${part}`));
}

describe('Tolls step — six parts (UI1)', () => {
  beforeEach(() => {
    tollV2Command.mockReset();
    tollV2Command.mockResolvedValue({});
    toastSuccess.mockReset();
    toastError.mockReset();
    switches.tollDisputes = true;
    fetchDesk.mockReturnValue(deskPartsFixture());
  });

  it('with the disputes switch off the screen is today’s', () => {
    switches.tollDisputes = false;
    wrap();
    expect(screen.queryByTestId('toll-v2-parts-layout')).toBeNull();
    expect(screen.getByTestId('toll-v2-progress')).toBeTruthy();
    expect(screen.getByText('Suggested matches')).toBeTruthy();
  });

  it('shows six pills, opens on the first part with work, Next and Back move one part', () => {
    wrap();
    expect(screen.getByTestId('toll-v2-parts-layout')).toBeTruthy();
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByTestId(`toll-v2-pill-${n}`)).toBeTruthy();
    expect(screen.getByTestId('toll-v2-pill-1').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('toll-v2-part-card-1')).toBeTruthy();
    expect(screen.getByText('Part 1 of 6')).toBeTruthy();
    expect((screen.getByTestId('toll-v2-part-back') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('toll-v2-part-next'));
    expect(screen.getByTestId('toll-v2-part-card-2')).toBeTruthy();
    expect(screen.getByText('Part 2 of 6')).toBeTruthy();
    fireEvent.click(screen.getByTestId('toll-v2-part-back'));
    expect(screen.getByTestId('toll-v2-part-card-1')).toBeTruthy();
    // The old long list and seal box are gone in this layout.
    expect(screen.queryByTestId('toll-v2-progress')).toBeNull();
  });

  it('part 1: InDrive Confirm Driver pays / Fleet pays send driver_pays / fleet_absorbs with the suggestion, never apply_suggestion', async () => {
    wrap();
    const row = screen.getByTestId('toll-v2-rider-row-indrive-1');
    expect(within(row).getByTestId('toll-v2-rider-reason').textContent).toBe('Rider owed it, driver collects in cash');
    expect(within(row).queryByText(/Sure match/)).toBeNull();
    fireEvent.click(within(row).getByTestId('toll-v2-rider-driver-pays'));
    await waitFor(() => expect(sent('driver_pays')).toHaveLength(1));
    expect(sent('driver_pays')[0]).toMatchObject({ charge_id: 'indrive-1', expected_charge_version: 4, suggestion_id: 'sug-indrive-1' });
    fireEvent.click(within(row).getByTestId('toll-v2-rider-fleet-pays'));
    await waitFor(() => expect(sent('fleet_absorbs')).toHaveLength(1));
    expect(sent('fleet_absorbs')[0]).toMatchObject({ charge_id: 'indrive-1', suggestion_id: 'sug-indrive-1' });
    expect(sent('apply_suggestion')).toHaveLength(0);
    // Confirm all sure counts the five sure Uber matches, not the InDrive one.
    expect(screen.getByTestId('toll-v2-confirm-all-open').textContent).toMatch(/\(5\)/);
  });

  it('part 3: blue box, tiles and the right buttons per dispute state', () => {
    wrap();
    goTo(3);
    expect(screen.getByTestId('toll-v2-disputes-waiting').textContent).toBe(
      "J$80.00 is waiting on Uber. It doesn't stop you sealing this week. Refunds usually arrive in the next pay period or the one after.",
    );
    expect(screen.getByTestId('toll-v2-tile-to-send').textContent).toMatch(/3· J\$60\.00/);
    expect(screen.getByTestId('toll-v2-tile-sent').textContent).toMatch(/1· J\$20\.00/);
    expect(screen.getByTestId('toll-v2-tile-late').textContent).toMatch(/Late2· J\$40\.00/);

    const toSend = screen.getByTestId('toll-v2-dispute-dsp-send');
    expect(within(toSend).getByTestId('toll-v2-dispute-mark-sent')).toBeTruthy();
    expect(within(toSend).queryByTestId('toll-v2-dispute-refund')).toBeNull();
    expect(within(toSend).queryByTestId('toll-v2-dispute-lost')).toBeNull();
    expect(within(toSend).getByText('8 of 9 days left')).toBeTruthy();
    expect(within(toSend).getByText(/Toll J\$390\.00 · Uber paid J\$370\.00/)).toBeTruthy();
    expect(within(toSend).getByText('J$20.00 to dispute')).toBeTruthy();

    const closed = screen.getByTestId('toll-v2-dispute-dsp-closed');
    expect(within(closed).queryByTestId('toll-v2-dispute-mark-sent')).toBeNull();
    expect(within(closed).getByTestId('toll-v2-dispute-state').textContent).toBe('Window closed — expires tonight');

    const sentRow = screen.getByTestId('toll-v2-dispute-dsp-sent');
    expect(within(sentRow).queryByTestId('toll-v2-dispute-mark-sent')).toBeNull();
    expect(within(sentRow).getByTestId('toll-v2-dispute-refund')).toBeTruthy();
    expect(within(sentRow).getByTestId('toll-v2-dispute-lost')).toBeTruthy();
    expect(within(sentRow).getByTestId('toll-v2-dispute-from-week').textContent).toBe('From week of 2 Nov');

    const results = screen.getByTestId('toll-v2-results');
    expect(within(results).getByText('Won · Uber paid J$20.00')).toBeTruthy();
    expect(within(results).getByText('Lost · fleet pays J$20.00')).toBeTruthy();
    // Undo only where the server sent one (the lost result was reopened).
    expect(within(screen.getByTestId('toll-v2-result-res-lost')).queryByTestId('toll-v2-result-undo')).toBeNull();
  });

  it('part 3: Mark as sent, Refund received, Lost and result Undo send their commands', async () => {
    wrap();
    goTo(3);
    fireEvent.click(within(screen.getByTestId('toll-v2-dispute-dsp-send')).getByTestId('toll-v2-dispute-mark-sent'));
    await waitFor(() => expect(sent('mark_dispute_sent')).toHaveLength(1));
    expect(sent('mark_dispute_sent')[0]).toMatchObject({ dispute_id: 'dsp-send', expected_dispute_version: 1 });

    fireEvent.click(within(screen.getByTestId('toll-v2-dispute-dsp-sent')).getByTestId('toll-v2-dispute-refund'));
    const dialog = await screen.findByTestId('toll-v2-refund-dialog');
    // The suggested adjustment is picked first; the trip line is listed too (done-test 13).
    expect(within(dialog).getByTestId('toll-v2-refund-option-pb-adj').getAttribute('aria-checked')).toBe('true');
    expect(within(dialog).getByTestId('toll-v2-refund-option-pb-line')).toBeTruthy();
    fireEvent.click(within(dialog).getByTestId('toll-v2-refund-confirm'));
    await waitFor(() => expect(sent('settle_dispute')).toHaveLength(1));
    expect(sent('settle_dispute')[0]).toMatchObject({
      dispute_id: 'dsp-sent',
      expected_dispute_version: 3,
      payback_id: 'pb-adj',
      expected_payback_version: 7,
    });

    fireEvent.click(within(screen.getByTestId('toll-v2-dispute-dsp-sent')).getByTestId('toll-v2-dispute-lost'));
    fireEvent.click(await screen.findByTestId('toll-v2-lost-confirm'));
    await waitFor(() => expect(sent('close_dispute_lost')).toHaveLength(1));
    expect(sent('close_dispute_lost')[0]).toMatchObject({ dispute_id: 'dsp-sent', expected_dispute_version: 3 });

    fireEvent.click(within(screen.getByTestId('toll-v2-result-res-won')).getByTestId('toll-v2-result-undo'));
    await waitFor(() => expect(sent('undo_decision')).toHaveLength(1));
    expect(sent('undo_decision')[0]).toMatchObject({ decision_id: 'dec-won' });
  });

  it('sole manager: a NEEDS_APPROVAL refusal asks for a reason and sends the command again with it', async () => {
    tollV2Command.mockImplementation(async (intent: string, body: Record<string, unknown>) => {
      if (intent === 'close_dispute_lost' && !body.self_approval_reason) {
        throw new TollV2CommandError('NEEDS_APPROVAL', 409, 'NEEDS_APPROVAL', { sole_manager: true, amount_minor: 600000 });
      }
      return {};
    });
    wrap();
    goTo(3);
    fireEvent.click(within(screen.getByTestId('toll-v2-dispute-dsp-sent')).getByTestId('toll-v2-dispute-lost'));
    fireEvent.click(await screen.findByTestId('toll-v2-lost-confirm'));
    const ask = await screen.findByTestId('toll-v2-approval-dialog');
    const ok = within(ask).getByTestId('toll-v2-approval-confirm') as HTMLButtonElement;
    fireEvent.change(within(ask).getByTestId('toll-v2-approval-reason'), { target: { value: 'short' } });
    expect(ok.disabled).toBe(true);
    fireEvent.change(within(ask).getByTestId('toll-v2-approval-reason'), { target: { value: 'Uber support said no in writing' } });
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    await waitFor(() => expect(sent('close_dispute_lost')).toHaveLength(2));
    expect(sent('close_dispute_lost')[1]).toMatchObject({
      dispute_id: 'dsp-sent',
      self_approval_reason: 'Uber support said no in writing',
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('part 6: Still open per part with Go to, the sum line, Seal disabled; Go to jumps to that part', () => {
    wrap();
    goTo(6);
    const open = screen.getByTestId('toll-v2-still-open');
    expect(within(open).getByText('Part 2: 2 tolls to pick a trip for')).toBeTruthy();
    expect(within(open).getByText('Part 5: 1 cash receipt to check')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-seal-sum-line').textContent).toBe(
      'Spend J$5,410.00 = Paid back J$5,170.00 + Driver pays J$0.00 + Fleet pays J$0.00 + Waiting on Uber J$240.00',
    );
    expect((screen.getByTestId('toll-v2-seal-button') as HTMLButtonElement).disabled).toBe(true);
    // Decided lists this week's decided tolls with Undo.
    expect(within(screen.getByTestId('toll-v2-decided')).getByText('Decided · 1 toll')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('toll-v2-still-open-2')).getByRole('button', { name: 'Go to Pick the right trip' }));
    expect(screen.getByTestId('toll-v2-part-card-2')).toBeTruthy();
  });

  it('part 6: a refused seal redraws Still open from the refusal, with no error toast (AD3)', async () => {
    fetchDesk.mockReturnValue(
      deskPartsFixture({
        blockers: [],
        parts: deskPartsFixture().parts!.map((p) => ({ ...p, status: p.part === 6 ? 'ready' : 'clear', count: 0 })),
      }),
    );
    tollV2Command.mockRejectedValue(
      new TollV2CommandError('PENDING_NOT_RESOLVED', 409, 'PENDING_NOT_RESOLVED', {
        week_key: '2026-11-09',
        blocking: [{ kind: 'review_pair', id: 'rp1', part: 5 }],
      }),
    );
    wrap();
    expect(screen.getByTestId('toll-v2-part-card-6')).toBeTruthy();
    const seal = screen.getByTestId('toll-v2-seal-button') as HTMLButtonElement;
    expect(seal.disabled).toBe(false);
    fireEvent.click(seal);
    await waitFor(() => expect(screen.getByTestId('toll-v2-still-open')).toBeTruthy());
    expect(screen.getByText('Part 5: 1 possible duplicate')).toBeTruthy();
    expect(sent('seal_week')[0]).toMatchObject({ week_key: '2026-11-09', expected_week_version: 3 });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a sealed week opens on Seal with the sealed banner and Continue to Tag account', () => {
    const onTag = vi.fn();
    fetchDesk.mockReturnValue(
      deskPartsFixture({
        sealed: true,
        blockers: [],
        parts: deskPartsFixture().parts!.map((p) => ({ ...p, status: p.part === 6 ? 'sealed' : 'clear', count: 0 })),
      }),
    );
    wrap(onTag);
    expect(screen.getByTestId('toll-v2-part-card-6')).toBeTruthy();
    expect(screen.getByTestId('toll-v2-sealed-banner').textContent).toMatch(/Tolls for the week of 9 Nov 2026 are sealed\./);
    expect(screen.queryByTestId('toll-v2-seal-button')).toBeNull();
    fireEvent.click(screen.getByTestId('toll-v2-continue-tag'));
    expect(onTag).toHaveBeenCalled();
  });

  it('part 5 holds the other checks and part 4 the tolls with no trip', () => {
    wrap();
    goTo(5);
    expect(screen.getByTestId('toll-v2-part-sections-5')).toBeTruthy();
    expect(screen.getByText('Cash receipts to check')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check receipt' })).toBeTruthy();
    goTo(4);
    expect(screen.getByText('Tolls with no trip')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Driver pays' })).toBeTruthy();
  });
});
