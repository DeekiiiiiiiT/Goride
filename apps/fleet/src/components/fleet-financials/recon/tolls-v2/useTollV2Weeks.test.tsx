/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../../utils/supabase/client', () => ({ supabase: { rpc } }));

import { useTollV2Weeks } from './useTollV2Weeks';

/** The app's own default is retry: 1. The weeks read must not add retries on top of a refusal. */
function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function clientWithRetry(retry: number) {
  return new QueryClient({
    defaultOptions: { queries: { retry, retryDelay: 0 } },
  });
}

describe('useTollV2Weeks', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('asks toll_v2_weeks and hands the overview back', async () => {
    const overview = { openWeek: '2026-08-24', takeBacks: [], weeks: [], nightly: null };
    rpc.mockResolvedValue({ data: overview, error: null });

    const { result } = renderHook(() => useTollV2Weeks(true), { wrapper: wrap(clientWithRetry(3)) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('toll_v2_weeks');
    expect(result.current.data?.openWeek).toBe('2026-08-24');
  });

  it('a permission refusal is not retried, so the RPC is called once', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'FORBIDDEN' } });

    const { result } = renderHook(() => useTollV2Weeks(true), { wrapper: wrap(clientWithRetry(3)) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((result.current.error as { code?: string }).code).toBe('P0001');
  });

  it('a dropped connection gets one retry', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useTollV2Weeks(true), { wrapper: wrap(clientWithRetry(3)) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('the hook is not asked while it is disabled', async () => {
    rpc.mockResolvedValue({ data: { openWeek: '2026-08-24', takeBacks: [], weeks: [] }, error: null });

    const { result } = renderHook(() => useTollV2Weeks(false), { wrapper: wrap(clientWithRetry(0)) });

    await new Promise((r) => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
