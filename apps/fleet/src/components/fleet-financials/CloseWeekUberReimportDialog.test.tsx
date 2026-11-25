/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
    message: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../services/api', () => ({ api: {}, fetchFleetTimezone: vi.fn() }));

// Only the file picker matters here: every picked CSV is an Uber trip report.
vi.mock('../../utils/csvHelpers', () => ({
  detectFileType: () => 'uber_trip',
  validateFile: () => [],
  extractReportDate: () => '2026-11-02',
}));

vi.mock('../../utils/commitUberImportFromFiles', () => ({
  isUberImportFileType: () => true,
  previewUberCashRefresh: vi.fn(async () => ({
    tripCountInWeek: 1,
    tripCountOutsideWeek: 0,
    paymentLineCount: 1,
    statementCashTotal: 0,
    tripCashTotal: 0,
    cashDelta: 0,
    existingCashWashCount: 0,
  })),
  commitUberCashRefresh: vi.fn(async () => ({ tripCount: 1, statementCashTotal: 0 })),
}));

const readTolls = vi.fn(async () => undefined);
vi.mock('../../utils/readUberTollsIntoNewSystem', () => ({
  readUberTollsIntoNewSystem: () => readTolls(),
  uberTollFilesFrom: () => ({}),
}));

import { CloseWeekUberReimportDialog } from './CloseWeekUberReimportDialog';

describe('CloseWeekUberReimportDialog', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    readTolls.mockClear();
  });

  it('refreshes the toll weeks list after the toll files are read', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <CloseWeekUberReimportDialog
          open
          onOpenChange={() => {}}
          weekLabel="2 Nov 2026"
          weekKey="2026-11-02"
          onImported={() => {}}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = { name: 'trip_activity.csv', text: async () => 'a,b\n1,2' };
    Object.defineProperty(input, 'files', { value: [csv], configurable: true });
    fireEvent.change(input);
    await screen.findByText('trip_activity.csv');

    fireEvent.click(screen.getByRole('button', { name: 'Save cash refresh' }));

    await waitFor(() => expect(readTolls).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const weeksKey = JSON.stringify(['toll-v2-weeks']);
      const called = invalidate.mock.calls.some(
        (call) =>
          JSON.stringify((call[0] as { queryKey?: unknown } | undefined)?.queryKey) === weeksKey,
      );
      expect(called).toBe(true);
    });
  });
});
