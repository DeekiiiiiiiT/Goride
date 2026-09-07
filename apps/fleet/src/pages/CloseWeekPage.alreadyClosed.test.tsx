/**
 * @vitest-environment jsdom
 *
 * Already-closed week shows locked banner (not "ready to sign").
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const previewMock = vi.fn();

vi.mock('../services/weekCloseApi', () => ({
  weekCloseApi: {
    preview: (...args: unknown[]) => previewMock(...args),
    close: vi.fn(),
  },
  isWeekCloseUnavailable: () => false,
}));
vi.mock('../hooks/useSettlementQueue', () => ({
  useSettlementQueue: () => ({
    data: { rows: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { CloseWeekPage } from './CloseWeekPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CloseWeekPage />
    </QueryClientProvider>,
  );
}

describe('CloseWeekPage already closed', () => {
  beforeEach(() => {
    previewMock.mockReset();
    previewMock.mockResolvedValue({
      weekKey: '2026-08-24',
      driversTotal: 1,
      driversReady: 0,
      driversBlocked: 0,
      driversFrozen: 1,
      weekClosed: true,
      closedAt: '2026-09-07T10:06:19.531Z',
      fuel: { driverShare: 0, fleetShare: 0, finalized: true },
      toll: {
        spend: 6210,
        reimbursed: 3605,
        chargedToDrivers: 0,
        netLoss: 2605,
        identityResidual: 0,
        identityCloses: true,
      },
      blockers: [],
    });
  });

  it('shows Already closed and disables close action', async () => {
    renderPage();
    const closeBtn = await screen.findByRole('button', { name: /already closed/i });
    expect(closeBtn).toBeDisabled();
    expect(screen.getByText(/1 driver frozen/i)).toBeTruthy();
    expect(screen.queryByText(/ready to sign/i)).toBeNull();
  });
});
