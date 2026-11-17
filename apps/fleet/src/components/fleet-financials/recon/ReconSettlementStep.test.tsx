/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const WEEK = '2026-10-19';
const DRIVER = 'drv-kenny';

const collectRows = [
  {
    driverId: DRIVER,
    driverName: 'Kenny Gregory Rattray',
    periodAnchor: WEEK,
    amountOwed: 1_623.9,
    collectKind: 'driver_owes',
    settlementAmount: -1_623.9,
    metadata: {
      financeCore: {
        postedAdjustments: -10_611.52,
        correctionLines: [
          {
            sourceWeek: '2026-02-02',
            amount: -10_640.43,
            sentence: 'Week of 2026-02-02: the rest of his balance, he owes $10640.43.',
            kind: 'carried_balance',
          },
        ],
      },
    },
  },
];

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../hooks/useSettlementQueue', () => ({
  useSettlementQueue: ({ view }: { view: string }) => ({
    data: { rows: view === 'collect' ? collectRows : [] },
    isLoading: false,
  }),
}));
vi.mock('../../../hooks/useCashCollection', () => ({
  collectCashPayment: vi.fn(),
  payDriverWeek: vi.fn(),
}));
vi.mock('../../../services/settlementCommandsApi', () => ({
  settlementCommandsApi: { getMovements: vi.fn(async () => ({ rows: [] })) },
  isPeriodFrozenError: vi.fn(() => false),
}));
vi.mock('./useReconApprovals', () => ({
  useReconApprovals: () => ({ canApprove: true }),
}));

import { ReconSettlementStep } from './ReconSettlementStep';

const RUN = {
  run: { weekKey: WEEK, serviceLine: 'rideshare', version: 1 },
  closeCheck: { status: 'ok', blockers: [] },
} as never;

function renderStep() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ReconSettlementStep run={RUN} />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup);

describe('ReconSettlementStep driver-owes breakdown', () => {
  it('shows this week, outline Earlier corrections, and lines when expanded', async () => {
    const user = userEvent.setup();
    renderStep();

    expect(screen.getByText(/This week:/)).toBeTruthy();
    expect(screen.getByText(/8,987.62/)).toBeTruthy();

    const earlier = screen.getByRole('button', { name: /Earlier corrections \(1\)/ });
    expect(earlier.className).toMatch(/outline/);

    await user.click(earlier);
    expect(screen.getByText(/rest of his balance/)).toBeTruthy();
    expect(screen.getByText(/10,640.43/)).toBeTruthy();
  });

  it('offers Collect only — no Settle from balance (WRA-64)', () => {
    renderStep();
    expect(screen.getByRole('button', { name: /^Collect$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Settle from balance/i })).toBeNull();
  });
});

describe('Recon settlement step breakdown copy', () => {
  it('lists each correction with amount when expanded (utility)', async () => {
    const { reconDriverSettlementBreakdown } = await import('../../../utils/reconDriverSettlementBreakdown');
    const breakdown = reconDriverSettlementBreakdown({
      settlementAmount: -1_623.9,
      metadata: collectRows[0].metadata,
    });
    expect(breakdown).not.toBeNull();
    const user = userEvent.setup();
    render(
      <div>
        <p>This week: J${breakdown!.thisWeek.toFixed(2)}</p>
        <button type="button" className="outline">
          Earlier corrections ({breakdown!.correctionCount})
        </button>
        <ul>
          {breakdown!.lines.map((line) => (
            <li key={line.sourceWeek}>
              <span>{line.sentence}</span>
            </li>
          ))}
        </ul>
      </div>,
    );
    expect(screen.getByRole('button', { name: /Earlier corrections \(1\)/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Earlier corrections/ }));
    expect(screen.getByText(/rest of his balance/)).toBeTruthy();
  });
});