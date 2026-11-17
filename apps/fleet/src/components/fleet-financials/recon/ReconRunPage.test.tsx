/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RECON_STEP_ORDER } from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import {
  RECON_WEEK_SAVED_EVENT,
  clearReconWeekContext,
  setReconWeekContext,
} from '../../../services/reconWeekContext';
import {
  WATCH_EVERY_MS,
  reconRunSaveWatchRefetchInterval,
} from './reconRunSaveWatch';

const WEEK = '2026-11-02';
const LINE = 'rideshare' as const;
const RUN_ID = '130c1367-aaaa-bbbb-cccc-000000000001';

function stepStatuses(settlement: string): ReconRunPayload['evaluation']['steps'] {
  return RECON_STEP_ORDER.map((id) => ({
    id,
    status: id === 'settlement_preview' ? settlement : id === 'close' ? 'locked' : 'complete',
  }));
}

function baseRun(over: {
  version?: number;
  settlementStatus?: string;
  lastComputedAt?: string;
  pendingUnits?: number;
}): ReconRunPayload {
  const {
    version = 74,
    settlementStatus = 'stale',
    lastComputedAt = '2026-11-17T19:04:00.000Z',
    pendingUnits = 0,
  } = over;
  return {
    deskReady: true,
    calculatorPaused: false,
    calculator: {
      paused: false,
      pausedSince: null,
      pendingUnits,
      oldestPendingAgeSeconds: null,
      lastComputedAt,
    },
    closeCheck: { status: 'ok', blockers: [] },
    run: {
      id: RUN_ID,
      organizationId: 'org-1',
      serviceLine: LINE,
      weekKey: WEEK,
      state: 'open',
      version,
    },
    evaluation: {
      stage: 'settle',
      steps: stepStatuses(settlementStatus),
      nextAction: { kind: 'step', targetId: 'settlement_preview', label: 'Settlement' },
    },
    attribution: { rowCount: 0, amountMajor: 0 },
    sources: [
      {
        id: 'uber_trips',
        requirement: 'required',
        status: 'received',
        label: 'Uber trips',
      },
    ],
    steps: [],
  };
}

describe('reconRunSaveWatchRefetchInterval (WRA-69)', () => {
  const now = 1_000_000;
  const ctx = { watchUntilMs: now + 60_000, versionAtSave: 74 };

  it('keeps polling on a part-way desk write (time changes, version unchanged)', () => {
    const data = baseRun({
      version: 74,
      lastComputedAt: '2026-11-17T19:05:07.000Z',
      pendingUnits: 0,
    });
    expect(reconRunSaveWatchRefetchInterval(data, ctx, now)).toBe(WATCH_EVERY_MS);
  });

  it('WRA-69 r2: post-save baseline v74 — GET at v74 still polls until calculator publish v75', () => {
    const atSave = { watchUntilMs: now + 60_000, versionAtSave: 74 };
    expect(
      reconRunSaveWatchRefetchInterval(baseRun({ version: 74, pendingUnits: 0 }), atSave, now),
    ).toBe(WATCH_EVERY_MS);
    expect(
      reconRunSaveWatchRefetchInterval(baseRun({ version: 75, pendingUnits: 0 }), atSave, now),
    ).toBe(false);
  });

  it('stops polling on final publish (version +1, pending 0)', () => {
    const data = baseRun({
      version: 75,
      settlementStatus: 'complete',
      lastComputedAt: '2026-11-17T19:05:38.000Z',
      pendingUnits: 0,
    });
    expect(reconRunSaveWatchRefetchInterval(data, ctx, now)).toBe(false);
  });

  it('still polls while pendingUnits > 0 even after version moved', () => {
    const data = baseRun({ version: 75, pendingUnits: 2 });
    expect(reconRunSaveWatchRefetchInterval(data, ctx, now)).toBe(WATCH_EVERY_MS);
  });

  it('stops when the 3-minute watch window has ended', () => {
    const data = baseRun({ version: 74 });
    expect(
      reconRunSaveWatchRefetchInterval(data, { watchUntilMs: now - 1, versionAtSave: 74 }, now),
    ).toBe(false);
  });
});

const fetchRunMock = vi.fn<() => Promise<ReconRunPayload>>();
const fetchWeekProjectionStatusMock = vi.fn(async () => ({
  pendingDrivers: 0,
  failedDrivers: 0,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: {} }));
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { app_metadata: { roles: ['fleet_admin'] } } } }),
}));
vi.mock('./tolls-v2/useTollV2Desk', () => ({
  useTollV2Desk: () => ({ data: { sealed: true } }),
}));
vi.mock('./useReconApprovals', () => ({
  useReconApprovals: () => ({ canApprove: true, data: [] }),
  approvalsForWeek: () => [],
}));
vi.mock('../../../services/reconApi', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../services/reconApi')>();
  return {
    ...orig,
    fetchRun: (...args: unknown[]) => fetchRunMock(...(args as [])),
    fetchWeekProjectionStatus: (...args: unknown[]) => fetchWeekProjectionStatusMock(...(args as [])),
  };
});
vi.mock('./ReconSettlementStep', () => ({
  ReconSettlementStep: () => <div data-testid="recon-settlement-mock" />,
}));
vi.mock('./ReconSourcesStep', () => ({ ReconSourcesStep: () => null }));
vi.mock('./ReconAttributionStep', () => ({ ReconAttributionStep: () => null }));
vi.mock('./ReconTagAccountStep', () => ({ ReconTagAccountStep: () => null }));
vi.mock('./ReconTripsEarningsStep', () => ({ ReconTripsEarningsStep: () => null }));
vi.mock('./ReconCloseStep', () => ({ ReconCloseStep: () => null }));
vi.mock('../settlements/past-weeks/PastWeeksReturnLink', () => ({
  PastWeeksReturnLink: () => null,
}));

import { ReconRunPage } from './ReconRunPage';

describe('ReconRunPage post-save watch (WRA-69)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    cleanup();
    clearReconWeekContext();
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      search: '?step=settlement_preview',
    } as Location);
    fetchRunMock.mockReset();
    fetchWeekProjectionStatusMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearReconWeekContext();
  });

  it('keeps polling through a part-way write, then shows Continue after final publish', async () => {
    const initial = baseRun({ version: 74, settlementStatus: 'in_progress', pendingUnits: 1 });
    const partial = baseRun({
      version: 74,
      settlementStatus: 'in_progress',
      lastComputedAt: '2026-11-17T19:05:07.000Z',
      pendingUnits: 0,
    });
    const final = baseRun({
      version: 75,
      settlementStatus: 'complete',
      lastComputedAt: '2026-11-17T19:05:38.000Z',
      pendingUnits: 0,
    });

    let load = 0;
    fetchRunMock.mockImplementation(async () => {
      load += 1;
      if (load === 1) return initial;
      if (load === 2) return partial;
      return final;
    });

    setReconWeekContext({ runId: RUN_ID, version: 74, closed: false });

    render(
      <QueryClientProvider client={qc}>
        <ReconRunPage line={LINE} weekKey={WEEK} onBack={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('recon-week-desk')).toBeTruthy());

    await act(async () => {
      window.dispatchEvent(new CustomEvent(RECON_WEEK_SAVED_EVENT));
    });

    expect(screen.queryByTestId('recon-continue')).toBeNull();

    await waitFor(
      () => expect(fetchRunMock.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 12_000 },
    );

    expect(screen.queryByTestId('recon-continue')).toBeNull();

    await waitFor(
      () => expect(screen.getByTestId('recon-continue')).toBeTruthy(),
      { timeout: 15_000 },
    );
  }, 30_000);
});