/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

const RUN = { run: { serviceLine: 'rideshare', weekKey: '2026-11-16', version: 3, state: 'collecting' } } as never;

function varianceRoll() {
  return {
    weekKey: '2026-11-16',
    priorWeekKey: '2026-10-26',
    openingMinor: 86900,
    baselineOpeningMinor: 86900,
    topUpsMinor: 500000,
    tagUsageMinor: 619000,
    statementClosingMinor: 22500,
    expectedClosingMinor: -32100,
    varianceMinor: 54600,
    ties: false,
    carriedWeekKeys: ['2026-11-02', '2026-11-09'],
  };
}

function resetRoll() {
  const base = varianceRoll();
  return {
    ...base,
    openingMinor: 141500,
    varianceMinor: 0,
    ties: true,
    openingReset: {
      statementClosingMinor: 22500,
      openingMinor: 141500,
      previousOpeningMinor: 86900,
      differenceMinor: 54600,
      reason: 'Old toll records were off; starting the new system from the statement',
      actor: 'owner',
      at: '2026-11-20T15:00:00.000Z',
      undoable: true,
    },
  };
}

function renderStep() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ReconTagAccountStep run={RUN} onRefresh={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  fetchRoll.mockReset();
  postEvent.mockReset();
});

describe('Tag account starting balance reset', () => {
  it('overlay preview shows J$225 → J$1,415, was J$869, difference J$546', async () => {
    fetchRoll.mockResolvedValue(varianceRoll());
    const user = userEvent.setup();
    renderStep();

    await user.click(await screen.findByTestId('tag-set-starting-balance'));
    const dialog = await screen.findByTestId('tag-opening-reset-dialog');
    const input = within(dialog).getByLabelText(/Statement closing balance/i);
    await user.clear(input);
    await user.type(input, '225.00');

    const preview = await within(dialog).findByTestId('tag-reset-preview');
    expect(preview.textContent).toContain('1,415.00');
    expect(preview.textContent).toContain('869.00');
    expect(preview.textContent).toContain('546.00');
  });

  it('summary line and eye open read-only details', async () => {
    fetchRoll.mockResolvedValue(resetRoll());
    const user = userEvent.setup();
    renderStep();

    const summary = await screen.findByTestId('tag-opening-reset-summary');
    expect(summary.textContent).toContain('546.00');

    await user.click(screen.getByTestId('tag-opening-reset-eye'));
    const dialog = await screen.findByTestId('tag-opening-reset-dialog');
    expect(within(dialog).getByText(/1,415.00/)).toBeTruthy();
    expect(within(dialog).getByText(/869.00/)).toBeTruthy();
  });
});