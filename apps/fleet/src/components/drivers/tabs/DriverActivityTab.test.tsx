/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isUnsupportedActivityPlatform } from '../../../utils/driverActivityModel';

vi.mock('../../../services/api', () => ({
  api: {
    getDriverActivity: vi.fn().mockResolvedValue({
      success: true,
      coverage: [
        {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-07T00:00:00.000Z',
          recorded: false,
          reason: 'Activity was not recorded before 1 Oct 2026.',
        },
      ],
      segments: [],
      data: [],
      nextCursor: null,
      watermark: null,
    }),
    getDriverActivitySummary: vi.fn().mockResolvedValue({
      onlineSeconds: null,
      acceptanceRate: null,
      basis: 'unavailable',
    }),
    getDriverActivityExportUrl: vi.fn().mockReturnValue('https://example.test/export.csv'),
  },
}));

vi.mock('../OverviewMetricsGrid', () => ({
  MetricCard: ({ title, value }: { title?: string; value?: React.ReactNode }) => (
    <div data-testid="metric-card">
      {title}: {value}
    </div>
  ),
}));

vi.mock('../ContentVisibilityList', () => ({
  ContentVisibilityList: ({ items, renderRow, getKey }: any) => (
    <div>
      {items.map((item: any, i: number) => (
        <div key={getKey(item, i)}>{renderRow(item, i)}</div>
      ))}
    </div>
  ),
}));

vi.mock('../../../utils/timezoneDisplay', () => ({
  useFleetTimezone: () => 'America/Jamaica',
  formatInFleetTz: (iso: string) => iso,
  fleetCalendarDay: (iso: string) => String(iso).slice(0, 10),
}));

vi.mock('../context/DriverPeriodContext', () => ({
  useDriverPeriod: () => ({
    period: {
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-07T00:00:00.000Z'),
    },
    setPeriod: vi.fn(),
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('DriverActivityTab smoke', () => {
  it('renders not-recorded band when coverage is wholly uncovered', async () => {
    const { DriverActivityTab } = await import('./DriverActivityTab');
    renderWithQuery(<DriverActivityTab driverId="driver-1" />);
    expect(await screen.findByTestId('activity-not-recorded')).toBeTruthy();
    expect(screen.getByTestId('driver-activity-tab')).toBeTruthy();
  });

  it('renders unsupported platform state for Uber filter', async () => {
    const { DriverActivityTab } = await import('./DriverActivityTab');
    renderWithQuery(
      <DriverActivityTab driverId="driver-1" selectedPlatforms={new Set(['Uber'])} />,
    );
    expect(await screen.findByTestId('activity-unsupported-platform')).toBeTruthy();
    expect(isUnsupportedActivityPlatform('Uber')).toBe(true);
  });
});
