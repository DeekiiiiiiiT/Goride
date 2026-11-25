/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TollHealthPage, weekOpensAfter } from './TollHealthPage';
import { TOLL_V2_NO_ACCESS_MESSAGE } from './recon/tolls-v2/tollV2ReadAccess';

const metricsQueryState = vi.hoisted(() => ({ isError: false, isPending: false }));

vi.mock('./recon/tolls-v2/useTollV2Metrics', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./recon/tolls-v2/useTollV2Metrics')>();
  return {
    ...mod,
    useTollV2Metrics: () => ({
      isLoading: metricsQueryState.isPending,
      isPending: metricsQueryState.isPending,
      isError: metricsQueryState.isError,
      data:
        metricsQueryState.isError || metricsQueryState.isPending
          ? undefined
          : {
              pendingCharges: { count: 3, amountMinor: 101500, oldestAt: new Date(Date.now() - 9 * 864e5).toISOString() },
              unverifiedReceipts: { count: 0, amountMinor: 0 },
              unallocatedPaybacks: { count: 1, amountMinor: 37000, oldestAt: new Date(Date.now() - 20 * 864e5).toISOString() },
              afterSeal: { count: 0 },
              reviewPairsOpen: 0,
            },
    }),
  };
});

const weeksQueryState = vi.hoisted(() => ({
  isError: false,
  isPending: false,
  error: null as unknown,
}));

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
    isLoading: weeksQueryState.isPending,
    isPending: weeksQueryState.isPending,
    isError: weeksQueryState.isError,
    error: weeksQueryState.error,
    data: weeksQueryState.isError || weeksQueryState.isPending ? undefined : weeksOverview,
  }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TollHealthPage', () => {
  beforeEach(() => {
    weeksQueryState.isError = false;
    weeksQueryState.isPending = false;
    weeksQueryState.error = null;
    metricsQueryState.isError = false;
    metricsQueryState.isPending = false;
  });

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

  it('a P0001 permission refusal says there is no access, not a connection problem', () => {
    weeksQueryState.isError = true;
    weeksQueryState.error = { code: 'P0001', message: 'FORBIDDEN' };
    wrap(<TollHealthPage />);
    expect(screen.getByTestId('toll-health-error').textContent).toBe(TOLL_V2_NO_ACCESS_MESSAGE);
  });

  it('a real connection failure still says to check the connection', () => {
    weeksQueryState.isError = true;
    weeksQueryState.error = new TypeError('Failed to fetch');
    wrap(<TollHealthPage />);
    expect(screen.getByTestId('toll-health-error').textContent).toBe(
      'Check your connection and try again.',
    );
  });

  it('when the weeks read fails, the take-backs tile, nightly box and weeks list say unknown', () => {
    weeksQueryState.isError = true;
    weeksQueryState.error = { code: 'P0001', message: 'FORBIDDEN' };
    wrap(<TollHealthPage />);

    const tile = screen.getByTestId('toll-health-tile-takebacks');
    expect(tile.textContent).toContain('—');
    expect(tile.textContent).toContain("Couldn't check");
    expect(tile.textContent).not.toContain('All clear');

    const nightly = screen.getByTestId('toll-health-nightly');
    expect(nightly.textContent).toContain("Couldn't check");
    expect(nightly.textContent).not.toContain('No nightly check has run yet');

    const weeks = screen.getByTestId('toll-health-weeks');
    expect(weeks.textContent).toContain("Couldn't load weeks");
    expect(weeks.textContent).not.toContain('13 tolls');
  });

  it('when the metrics read fails, every metric tile says unknown, never All clear', () => {
    metricsQueryState.isError = true;
    wrap(<TollHealthPage />);

    for (const key of ['pending', 'receipts', 'paybacks', 'after-seal', 'dupes']) {
      const tile = screen.getByTestId(`toll-health-tile-${key}`);
      expect(tile.textContent).toContain('—');
      expect(tile.textContent).not.toContain('All clear');
    }
    // The weeks read still worked, so the take-backs number is real and is not blanked out.
    expect(screen.getByTestId('toll-health-tile-takebacks').textContent).toContain('1');
  });

  it('while the weeks list is loading, the take-backs tile is unknown, not All clear', () => {
    weeksQueryState.isPending = true;
    wrap(<TollHealthPage />);

    const tile = screen.getByTestId('toll-health-tile-takebacks');
    expect(tile.textContent).toContain('—');
    expect(tile.textContent).not.toContain('All clear');
  });
});

describe('weekOpensAfter', () => {
  it('a week that has not ended says when it opens', () => {
    expect(weekOpensAfter('2026-11-09', new Date('2026-11-13T17:00:00Z'))).toBe('Opens after Sun 15 Nov');
  });
  it('an ended week can be opened', () => {
    expect(weekOpensAfter('2026-08-24', new Date('2026-11-13T17:00:00Z'))).toBeNull();
  });
  it('Sunday night in Jamaica is still the same week', () => {
    // 16 Nov 03:00 UTC is Sun 15 Nov 10 PM in Jamaica.
    expect(weekOpensAfter('2026-11-09', new Date('2026-11-16T03:00:00Z'))).toBe('Opens after Sun 15 Nov');
  });
});
