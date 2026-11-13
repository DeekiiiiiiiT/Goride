/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TollHealthPage } from './TollHealthPage';

vi.mock('./recon/tolls-v2/useTollV2Desk', () => ({
  useTollV2Enabled: () => ({ isLoading: false, data: true }),
}));

vi.mock('./recon/tolls-v2/useTollV2Metrics', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./recon/tolls-v2/useTollV2Metrics')>();
  return {
    ...mod,
    useTollV2Metrics: () => ({
      isLoading: false,
      isError: false,
      data: {
        pendingCharges: { count: 3, amountMinor: 101500, oldestAt: new Date(Date.now() - 9 * 864e5).toISOString() },
        unverifiedReceipts: { count: 0, amountMinor: 0 },
        unallocatedPaybacks: { count: 1, amountMinor: 37000, oldestAt: new Date(Date.now() - 20 * 864e5).toISOString() },
        afterSeal: { count: 0 },
        reviewPairsOpen: 0,
      },
    }),
  };
});

const weeksOverview = vi.hoisted(() => ({
  openWeek: '2026-08-24',
  takeBacks: [{ id: 'tb1' }] as Array<{ id: string }>,
  nightly: { at: '2026-08-26T04:25:00Z', ok: true, checks: [] as unknown[] } as
    | { at: string; ok: boolean; checks: unknown[] }
    | undefined,
  weeks: [
    {
      weekKey: '2026-08-24',
      sealed: false,
      tolls: 13,
      spendMinor: 412890,
      toDecide: 7,
      toDecideMinor: 120000,
    },
  ],
}));

vi.mock('./recon/tolls-v2/useTollV2Weeks', () => ({
  useTollV2Weeks: () => ({
    isLoading: false,
    isError: false,
    data: weeksOverview,
  }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TollHealthPage', () => {
  it('renders Money › Tolls and metric tiles from fixtures', () => {
    wrap(<TollHealthPage />);
    expect(screen.getByTestId('toll-health-page')).toBeTruthy();
    expect(screen.getByText('Money')).toBeTruthy();
    expect(screen.getByText('Tolls waiting for a decision')).toBeTruthy();
    expect(screen.getByText('Over 14 days')).toBeTruthy();
    expect(screen.getAllByText('All clear').length).toBeGreaterThan(0);
    expect(screen.getByText(/Still to decide/)).toBeTruthy();
    expect(screen.getByTestId('toll-health-nightly')).toBeTruthy();
    expect(screen.getByText('Uber paybacks not matched yet')).toBeTruthy();
    expect(screen.getByText('Confirm their matches in the week')).toBeTruthy();
  });

  it('shows empty nightly state when no check has run', () => {
    weeksOverview.nightly = undefined;
    wrap(<TollHealthPage />);
    expect(screen.getByText('No nightly check has run yet')).toBeTruthy();
    weeksOverview.nightly = { at: '2026-08-26T04:25:00Z', ok: true, checks: [] };
  });
});
