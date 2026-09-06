/**
 * Driver Detail tab list + Suspense bodies (Round 4 Phase 3).
 * Shell owns period / permissions / header; this owns tab wiring only.
 */
import React, { Suspense } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { TabLoadingSkeleton } from '../ui/TabLoadingSkeleton';
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import type {
  DriverMetrics,
  FinancialTransaction,
  QuotaConfig,
  Trip,
} from '../../types/data';
import { DriverIndriveWalletTab } from './DriverIndriveWalletTab';

const DriverProfileTab = React.lazy(() =>
  import('./tabs/DriverProfileTab').then((m) => ({ default: m.DriverProfileTab })),
);
const DriverServiceQualityTab = React.lazy(() =>
  import('./tabs/DriverServiceQualityTab').then((m) => ({ default: m.DriverServiceQualityTab })),
);
const DriverCashWalletTab = React.lazy(() =>
  import('./tabs/DriverCashWalletTab').then((m) => ({ default: m.DriverCashWalletTab })),
);
const DriverOverviewTab = React.lazy(() =>
  import('./tabs/DriverOverviewTab').then((m) => ({ default: m.DriverOverviewTab })),
);
const DriverFinancialsTab = React.lazy(() =>
  import('./tabs/DriverFinancialsTab').then((m) => ({ default: m.DriverFinancialsTab })),
);

const SpinFallback = (
  <div className="flex justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
  </div>
);

export type DriverDetailTabsProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  performanceLoading: boolean;
  driverId: string;
  driverName: string;
  driver?: any;
  canRepairLedger: boolean;
  canEditTransactions: boolean;
  canEditDrivers: boolean;
  profileSubTab: 'documents' | 'personal-info' | 'notes';
  ledgerOverview: any;
  ledgerOverviewLoaded: boolean;
  serverTripsLoaded: boolean;
  repairInProgress: boolean;
  repairResult: any;
  tripGapDiagLoading: boolean;
  onTripLedgerGapDiagnostic: () => void;
  onRepairLedger: () => void;
  resolvedFinancials: any;
  metrics: any;
  isToday: boolean;
  ledgerDateRangeStrings: { startDate: string; endDate: string } | null;
  selectedPlatforms: Set<string>;
  transactions: FinancialTransaction[];
  allTrips: Trip[];
  quotaConfig: QuotaConfig | null;
  csvMetrics?: DriverMetrics[];
  financialDateRange?: DateRange;
  onPeriodWeekSelect: (week: PeriodWeekOption) => void;
  sharedFinancialBundle: any;
  walletPayoutPeriodRows: any;
  walletCashWeeks: any[];
  walletCollectionTotals: any;
  walletView: 'ledger' | 'settlements';
  setWalletView: (v: 'ledger' | 'settlements') => void;
  callOutstandingByMonday: Record<string, any>;
  setPaymentModalState: (s: any) => void;
  setWriteOffModalState: (s: any) => void;
  setPayoutModalState: (s: any) => void;
  handleDeleteTransaction: (id: string) => void;
  paymentsLogTab: 'cash' | 'bank';
  setPaymentsLogTab: (t: 'cash' | 'bank') => void;
  cashReceivedTransactions: FinancialTransaction[];
  bankTransferTransactions: FinancialTransaction[];
  activePaymentTransactions: FinancialTransaction[];
  groupedPaymentTransactions: any[];
  expandedPaymentGroups: Set<string>;
  togglePaymentGroup: (key: string) => void;
  openWalletPeriodPrefill: any;
  openFleetOwesPrefill: any;
  handleVerifyTransaction: (id: string) => void;
  handleEditTransaction: (tx: FinancialTransaction) => void;
  periodCompletedFromOps: number | null;
  operationalTotals: { cancelledCount: number; tripCount: number };
  ledgerRefreshKey: number;
  setLedgerRefreshKey: React.Dispatch<React.SetStateAction<number>>;
};

export function DriverDetailTabs(p: DriverDetailTabsProps) {
  return (
    <Tabs value={p.activeTab} className="space-y-4" onValueChange={p.onTabChange}>
      <TabsList>
        <TabsTrigger value="overview" aria-label="Overview tab">Overview</TabsTrigger>
        <TabsTrigger value="financial" aria-label="Financials tab">Financials</TabsTrigger>
        <TabsTrigger value="quality" aria-label="Service Quality tab">Service Quality</TabsTrigger>
        <TabsTrigger value="wallet" aria-label="Cash Wallet tab">Cash Wallet</TabsTrigger>
        <TabsTrigger value="indrive-wallet" aria-label="InDrive Wallet tab">InDrive Wallet</TabsTrigger>
        <TabsTrigger value="profile" aria-label="Profile tab">Profile</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {p.performanceLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Loading driver performance…</p>
            <TabLoadingSkeleton />
          </div>
        ) : (
          <Suspense fallback={SpinFallback}>
            <DriverOverviewTab
              driverStatus={p.driver?.status}
              ledgerOverview={p.ledgerOverview}
              ledgerOverviewLoaded={p.ledgerOverviewLoaded}
              serverTripsLoaded={p.serverTripsLoaded}
              repairInProgress={p.repairInProgress}
              repairResult={p.repairResult}
              tripGapDiagLoading={p.tripGapDiagLoading}
              onTripLedgerGapDiagnostic={p.onTripLedgerGapDiagnostic}
              canRepairLedger={p.canRepairLedger}
              onRepairLedger={p.onRepairLedger}
              resolvedFinancials={p.resolvedFinancials}
              metrics={p.metrics}
              isToday={p.isToday}
              driverId={p.driverId}
              walletRange={p.ledgerDateRangeStrings}
              platformFilterAllPlatforms={p.selectedPlatforms.has('All')}
            />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="financial" className="space-y-6">
        <Suspense fallback={SpinFallback}>
          <DriverFinancialsTab
            driverId={p.driverId}
            driver={p.driver}
            transactions={p.transactions}
            allTrips={p.allTrips}
            quotaConfig={p.quotaConfig}
            lifetimePlatformStats={p.resolvedFinancials.lifetimePlatformStats}
            csvMetrics={p.csvMetrics}
            periodFrom={p.financialDateRange?.from}
            periodTo={p.financialDateRange?.to}
            onFinancialPeriodSelect={p.onPeriodWeekSelect}
            financialBundle={p.sharedFinancialBundle}
            weeklyPeriodData={p.walletPayoutPeriodRows}
            weeklyCashWeeks={p.walletCashWeeks}
          />
        </Suspense>
      </TabsContent>

      <TabsContent value="wallet" className="space-y-6">
        <Suspense fallback={SpinFallback}>
          <DriverCashWalletTab
            financialDateRange={p.financialDateRange}
            periodFrom={p.financialDateRange?.from}
            periodTo={p.financialDateRange?.to}
            onPeriodSelect={p.onPeriodWeekSelect}
            walletCollectionTotals={p.walletCollectionTotals}
            pendingClearance={p.metrics.pendingClearance}
            walletView={p.walletView}
            setWalletView={p.setWalletView}
            allTrips={p.allTrips}
            transactions={p.transactions}
            csvMetrics={p.csvMetrics}
            walletCashWeeks={p.walletCashWeeks}
            callOutstandingByMonday={p.callOutstandingByMonday}
            canEditTransactions={p.canEditTransactions}
            onLogPayment={
              p.canEditTransactions
                ? (start, end, amount) =>
                    p.setPaymentModalState({
                      isOpen: true,
                      initialWorkPeriodStart: start.toISOString(),
                      initialWorkPeriodEnd: end.toISOString(),
                      initialAmount: amount,
                    })
                : undefined
            }
            onWriteOff={
              p.canEditTransactions
                ? (start, end, maxAmount) =>
                    p.setWriteOffModalState({
                      isOpen: true,
                      workPeriodStart: format(start, 'yyyy-MM-dd'),
                      workPeriodEnd: format(end, 'yyyy-MM-dd'),
                      maxAmount,
                    })
                : undefined
            }
            onPayDriver={
              p.canEditTransactions
                ? (start, end, maxAmount) =>
                    p.setPayoutModalState({
                      isOpen: true,
                      workPeriodStart: format(start, 'yyyy-MM-dd'),
                      workPeriodEnd: format(end, 'yyyy-MM-dd'),
                      maxAmount,
                    })
                : undefined
            }
            onDeleteWriteOff={
              p.canEditTransactions ? (txId) => p.handleDeleteTransaction(txId) : undefined
            }
            paymentsLogTab={p.paymentsLogTab}
            setPaymentsLogTab={p.setPaymentsLogTab}
            cashReceivedTransactions={p.cashReceivedTransactions}
            bankTransferTransactions={p.bankTransferTransactions}
            activePaymentTransactions={p.activePaymentTransactions}
            groupedPaymentTransactions={p.groupedPaymentTransactions}
            expandedPaymentGroups={p.expandedPaymentGroups}
            togglePaymentGroup={p.togglePaymentGroup}
            openWalletPeriodPrefill={p.openWalletPeriodPrefill}
            openFleetOwesPrefill={p.openFleetOwesPrefill}
            onOpenLogPayment={(opts) => p.setPaymentModalState({ isOpen: true, ...opts })}
            onOpenPayout={(opts) => p.setPayoutModalState({ isOpen: true, ...opts })}
            onVerifyTransaction={p.handleVerifyTransaction}
            onEditTransaction={p.handleEditTransaction}
            onDeleteTransaction={p.handleDeleteTransaction}
          />
        </Suspense>
      </TabsContent>

      <TabsContent value="quality" className="space-y-6">
        {p.performanceLoading ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Loading driver performance…</p>
            <TabLoadingSkeleton />
          </div>
        ) : (
          <Suspense fallback={SpinFallback}>
            <DriverServiceQualityTab
              periodFrom={p.financialDateRange?.from}
              periodTo={p.financialDateRange?.to}
              onPeriodSelect={p.onPeriodWeekSelect}
              metrics={{
                currentRating: p.metrics.currentRating,
                completionRate: p.metrics.completionRate,
                periodCancelledTrips:
                  p.periodCompletedFromOps != null
                    ? p.operationalTotals.cancelledCount
                    : p.metrics.periodCancelledTrips,
                acceptanceRate: p.metrics.acceptanceRate,
                totalTrips:
                  p.periodCompletedFromOps != null
                    ? p.operationalTotals.tripCount
                    : p.metrics.totalTrips,
                cancellationRate: p.metrics.cancellationRate,
                platformStats: p.metrics.platformStats as any,
              }}
              allTrips={p.allTrips}
              serverTripsLoaded={p.serverTripsLoaded}
            />
          </Suspense>
        )}
      </TabsContent>

      <TabsContent value="indrive-wallet" className="space-y-6">
        <DriverIndriveWalletTab
          driverId={p.driverId}
          range={p.ledgerDateRangeStrings}
          ledgerRefreshKey={p.ledgerRefreshKey}
          onWalletLedgerMutated={() => p.setLedgerRefreshKey((k) => k + 1)}
        />
      </TabsContent>

      <TabsContent value="profile" className="space-y-6">
        <Suspense fallback={SpinFallback}>
          <DriverProfileTab
            driverId={p.driverId}
            driverName={p.driverName}
            driver={p.driver}
            canEditDrivers={p.canEditDrivers}
            initialSubTab={p.profileSubTab}
          />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
