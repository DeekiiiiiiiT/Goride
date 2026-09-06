/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DriverServiceQualityTab } from './DriverServiceQualityTab';
import { orderedPlatformKeys } from './DriverServiceQualityTab';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

vi.mock('../../../services/api', () => ({
  api: {
    getDriverCompliance: vi.fn().mockResolvedValue({ documents: [] }),
    getDriverNotes: vi.fn().mockResolvedValue({ notes: [] }),
    getDriverAudit: vi.fn().mockResolvedValue({ data: [] }),
    addDriverNote: vi.fn(),
    verifyDriverDocument: vi.fn(),
    appendDriverAudit: vi.fn(),
  },
}));

vi.mock('../OverviewMetricsGrid', () => ({
  OverviewMetricsGrid: () => <div data-testid="overview-metrics-smoke">Overview metrics</div>,
  MetricCard: ({ title, value }: { title?: string; value?: React.ReactNode }) => (
    <div data-testid="metric-card">
      {title}: {value}
    </div>
  ),
}));

vi.mock('../DistanceByPlatform', () => ({
  DistanceByPlatform: () => <div data-testid="overview-distance-smoke">Distance</div>,
}));

vi.mock('../FinancialSubTabs', () => ({
  FinancialSubTabs: () => <div data-testid="financials-tab-smoke">Financials period</div>,
}));

vi.mock('../WeeklySettlementView', () => ({
  WeeklySettlementView: () => <div data-testid="wallet-settlements-empty">No weeks in period</div>,
}));

vi.mock('../../ui/PeriodWeekDropdown', () => ({
  PeriodWeekDropdown: () => <div data-testid="period-week-dropdown-smoke">Period</div>,
}));

describe('orderedPlatformKeys', () => {
  it('prefers Uber then InDrive, then other keys sorted', () => {
    expect(
      orderedPlatformKeys({
        Roam: { trips: 1, completed: 1 },
        InDrive: { trips: 2, completed: 2 },
        Uber: { trips: 3, completed: 3 },
        Bolt: { trips: 1, completed: 0 },
      }),
    ).toEqual(['Uber', 'InDrive', 'Bolt', 'Roam']);
  });
});

describe('DriverServiceQualityTab empty state', () => {
  it('shows empty cancelled-trips copy', () => {
    render(
      <DriverServiceQualityTab
        metrics={{
          currentRating: 0,
          completionRate: 100,
          periodCancelledTrips: 0,
          acceptanceRate: null,
          totalTrips: 0,
          cancellationRate: 0,
          platformStats: {},
        }}
        allTrips={[]}
        serverTripsLoaded
      />,
    );
    expect(screen.getByTestId('service-quality-empty')).toBeTruthy();
    expect(screen.getByText(/No cancelled trips in this period/i)).toBeTruthy();
  });
});

describe('DriverProfileTab empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty documents and notes', async () => {
    const { DriverProfileTab } = await import('./DriverProfileTab');
    renderWithQuery(
      <DriverProfileTab
        driverId="d1"
        driverName="Test Driver"
        canEditDrivers={false}
      />,
    );
    expect(await screen.findByTestId('profile-docs-empty')).toBeTruthy();
    expect(screen.getByText(/No documents on file/i)).toBeTruthy();
  });
});

describe('DriverOverviewTab smoke', () => {
  it('renders metrics shell while ledger is loading', async () => {
    const { DriverOverviewTab } = await import('./DriverOverviewTab');
    render(
      <DriverOverviewTab
        driverId="d1"
        ledgerOverview={null}
        ledgerOverviewLoaded={false}
        serverTripsLoaded={false}
        repairInProgress={false}
        repairResult={null}
        tripGapDiagLoading={false}
        onTripLedgerGapDiagnostic={() => {}}
        onRepairLedger={() => {}}
        resolvedFinancials={{}}
        metrics={{ perPlatformDistance: {} }}
        isToday={false}
        walletRange={null}
        platformFilterAllPlatforms
      />,
    );
    expect(screen.getByTestId('overview-metrics-smoke')).toBeTruthy();
    expect(screen.getByTestId('overview-distance-smoke')).toBeTruthy();
  });
});

describe('DriverFinancialsTab smoke', () => {
  it('renders financials shell with empty props', async () => {
    const { DriverFinancialsTab } = await import('./DriverFinancialsTab');
    render(
      <DriverFinancialsTab
        driverId="d1"
        transactions={[]}
        allTrips={[]}
        quotaConfig={null}
        lifetimePlatformStats={null}
        onFinancialPeriodSelect={() => {}}
        financialBundle={null}
        weeklyPeriodData={null}
        weeklyCashWeeks={[]}
      />,
    );
    expect(screen.getByTestId('financials-tab-smoke')).toBeTruthy();
    expect(screen.getByText(/Financials period/i)).toBeTruthy();
  });
});

describe('DriverCashWalletTab smoke', () => {
  it('renders KPI row with empty wallet totals', async () => {
    const { DriverCashWalletTab } = await import('./DriverCashWalletTab');
    render(
      <DriverCashWalletTab
        walletCollectionTotals={{ callOutstanding: 0, fleetOwes: 0, cashReturned: 0 }}
        pendingClearance={0}
        walletView="settlements"
        setWalletView={() => {}}
        allTrips={[]}
        transactions={[]}
        walletCashWeeks={[]}
        callOutstandingByMonday={{}}
        canEditTransactions={false}
        paymentsLogTab="cash"
        setPaymentsLogTab={() => {}}
        cashReceivedTransactions={[]}
        bankTransferTransactions={[]}
        activePaymentTransactions={[]}
        groupedPaymentTransactions={[]}
        expandedPaymentGroups={new Set()}
        togglePaymentGroup={() => {}}
        openWalletPeriodPrefill={null}
        openFleetOwesPrefill={null}
        onOpenLogPayment={() => {}}
        onOpenPayout={() => {}}
        onVerifyTransaction={() => {}}
        onEditTransaction={() => {}}
        onDeleteTransaction={() => {}}
      />,
    );
    expect(screen.getAllByText(/Driver owes/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Financial Records/i)).toBeTruthy();
    expect(screen.getByTestId('wallet-settlements-empty')).toBeTruthy();
  });
});
