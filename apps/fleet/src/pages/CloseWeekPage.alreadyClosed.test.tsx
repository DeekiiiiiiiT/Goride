/**
 * @vitest-environment jsdom
 *
 * Already-closed week shows locked banner + Re-open; Sign restatements when drafts exist.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const previewMock = vi.fn();
const reopenMock = vi.fn();
const closeMock = vi.fn();

vi.mock('../services/weekCloseApi', () => ({
  weekCloseApi: {
    preview: (...args: unknown[]) => previewMock(...args),
    close: (...args: unknown[]) => closeMock(...args),
    reopen: (...args: unknown[]) => reopenMock(...args),
  },
  isWeekCloseUnavailable: () => false,
  WeekCloseApiError: class WeekCloseApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
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

const closedPreview = {
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
  pendingRestatementCount: 0,
};

describe('CloseWeekPage already closed', () => {
  beforeEach(() => {
    cleanup();
    previewMock.mockReset();
    reopenMock.mockReset();
    closeMock.mockReset();
    previewMock.mockResolvedValue(closedPreview);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows Already closed, disables close, and offers Re-open', async () => {
    renderPage();
    const closeBtn = await screen.findByRole('button', { name: /already closed/i });
    expect((closeBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 driver frozen/i)).toBeTruthy();
    expect(screen.queryByText(/ready to sign/i)).toBeNull();
    expect(screen.getByRole('button', { name: /re-open week/i })).toBeTruthy();
  });

  it('shows Sign restatements when pending drafts exist', async () => {
    previewMock.mockResolvedValue({
      ...closedPreview,
      pendingRestatementCount: 2,
      driversReady: 1,
    });
    renderPage();
    const signBtn = await screen.findByRole('button', { name: /sign 2 restatements/i });
    expect((signBtn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: /re-open week/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /already closed/i })).toBeNull();
  });
});
