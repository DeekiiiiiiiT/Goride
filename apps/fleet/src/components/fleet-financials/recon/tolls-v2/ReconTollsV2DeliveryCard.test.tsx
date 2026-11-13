/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fetchDesk = vi.fn();
vi.mock('./useTollV2Desk', () => ({
  useTollV2Desk: () => ({
    isLoading: false,
    data: fetchDesk(),
  }),
}));

import { ReconTollsV2DeliveryCard } from './ReconTollsV2DeliveryCard';

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ReconTollsV2DeliveryCard', () => {
  beforeEach(() => {
    fetchDesk.mockReset();
  });

  it('shows rideshare message before seal', () => {
    fetchDesk.mockReturnValue({ sealed: false });
    wrap(<ReconTollsV2DeliveryCard weekKey="2026-08-24" onGoToRideshare={() => {}} />);
    expect(screen.getByText(/reconciled once for the whole fleet/i)).toBeTruthy();
    expect(screen.queryByText(/are sealed/i)).toBeNull();
  });

  it('shows sealed check after desk is sealed', () => {
    fetchDesk.mockReturnValue({ sealed: true });
    wrap(<ReconTollsV2DeliveryCard weekKey="2026-08-24" onGoToRideshare={() => {}} />);
    expect(screen.getByText('Tolls for this week are sealed')).toBeTruthy();
  });
});
