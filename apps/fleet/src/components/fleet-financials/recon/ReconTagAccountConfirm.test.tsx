/**
 * @vitest-environment jsdom
 *
 * WRA-48: with an earlier closing, the Tag account step works the balance out
 * itself (opening + top-ups − usage) and the user confirms it.
 * Numbers: week of 28 Sep 2026 — opening 5,969, top-up 5,000, tolls 1,755 → 9,214.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchRoll = vi.fn();
const postEvent = vi.fn();
vi.mock('../../../services/reconApi', async (orig) => {
  const real = await orig<typeof import('../../../services/reconApi')>();
  return {
    ...real,
    fetchTagAccountRollForward: (...a: unknown[]) => fetchRoll(...a),
    postRunEvent: (...a: unknown[]) => postEvent(...a),
  };
});

import { ReconTagAccountStep } from './ReconTagAccountStep';

const RUN = { run: { serviceLine: 'rideshare', weekKey: '2026-09-28', version: 7 } } as never;

function roll(over: Record<string, unknown> = {}) {
  return {
    weekKey: '2026-09-28',
    priorWeekKey: '2026-09-21',
    openingMinor: 596900,
    topUpsMinor: 500000,
    tagUsageMinor: 175500,
    statementClosingMinor: null,
    expectedClosingMinor: 921400,
    varianceMinor: null,
    ties: false,
    ...over,
  };
}

function renderStep() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRefresh = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ReconTagAccountStep run={RUN} onRefresh={onRefresh} />
    </QueryClientProvider>,
  );
  return { onRefresh };
}

afterEach(() => {
  cleanup();
  fetchRoll.mockReset();
  postEvent.mockReset();
});

describe('Tag account — worked-out balance (WRA-48)', () => {
  it('shows the worked-out closing and saves it on Confirm', async () => {
    fetchRoll.mockResolvedValue(roll());
    postEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderStep();

    const confirm = await screen.findByTestId('tag-confirm-balance');
    expect(confirm.textContent).toContain('9,214.00');

    fetchRoll.mockResolvedValue(
      roll({ statementClosingMinor: 921400, varianceMinor: 0, ties: true, statementConfirmedFromExpected: true }),
    );
    await user.click(confirm);

    expect(postEvent).toHaveBeenCalledWith('rideshare', '2026-09-28', {
      kind: 'tag_account_statement_closing',
      expectedVersion: 7,
      payload: { statementClosingMinor: 921400, confirmedExpected: true },
    });
    await screen.findByTestId('tag-confirmed-card');
  });

  it('lets the user type TransJam’s balance instead', async () => {
    fetchRoll.mockResolvedValue(roll());
    const user = userEvent.setup();
    renderStep();

    await user.click(await screen.findByRole('button', { name: /TransJam shows a different balance/i }));
    expect(screen.getByLabelText(/Statement closing balance/i)).toBeTruthy();
    expect(screen.queryByTestId('tag-confirm-card')).toBeNull();
  });

  it('first week (no earlier closing) keeps the typed balance box', async () => {
    fetchRoll.mockResolvedValue(roll({ priorWeekKey: null, openingMinor: 0 }));
    renderStep();

    await waitFor(() => expect(screen.getByLabelText(/Statement closing balance/i)).toBeTruthy());
    expect(screen.queryByTestId('tag-confirm-card')).toBeNull();
  });

  it('offers to confirm again when the toll files changed after confirming', async () => {
    fetchRoll.mockResolvedValue(
      roll({
        tagUsageMinor: 214500,
        expectedClosingMinor: 882400,
        statementClosingMinor: 921400,
        varianceMinor: 39000,
        ties: false,
        statementConfirmedFromExpected: true,
      }),
    );
    renderStep();

    const stale = await screen.findByTestId('tag-stale-confirm');
    expect(stale.textContent).toContain('8,824.00');
  });
});
