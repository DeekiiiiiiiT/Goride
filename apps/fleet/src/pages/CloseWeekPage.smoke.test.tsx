/**
 * @vitest-environment jsdom
 *
 * Phase 7 smoke: the Close Week screen renders its three lanes + identity strip
 * without throwing, even with no live data (queries left pending / erroring).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Keep the smoke test hermetic — no real network / auth.
vi.mock('../services/weekCloseApi', () => ({
  weekCloseApi: { preview: vi.fn().mockRejectedValue(new Error('offline')), close: vi.fn() },
  isWeekCloseUnavailable: () => true,
}));
vi.mock('../hooks/useSettlementQueue', () => ({
  useSettlementQueue: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
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

describe('CloseWeekPage smoke (Phase 7)', () => {
  it('renders the three lanes and the identity check', () => {
    renderPage();
    expect(screen.getByText(/Close the Week/i)).toBeTruthy();
    expect(screen.getByText('Fuel')).toBeTruthy();
    expect(screen.getByText('Tolls')).toBeTruthy();
    expect(screen.getByText('Settlement')).toBeTruthy();
    expect(screen.getByText(/Identity check/i)).toBeTruthy();
    expect(screen.getByText(/Total exposure/i)).toBeTruthy();
  });
});
