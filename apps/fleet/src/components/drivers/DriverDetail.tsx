// ARCHITECTURE: Driver Detail — Data Flow (Phase 7+)
// FINANCIAL: ledger_event:* via /ledger/driver-overview + earnings-history (not trip:* amounts).
// OPERATIONAL: trip:* client metrics; Overview / Service Quality.
// CASH WALLET: walletCashWeeks + call-outstanding helpers.
// INTEGRITY: completeness banner → POST /ledger/ensure-from-trip-ids (repair-driver retired).
// SAFETY: resolvedFinancials zeros + dataIncomplete when ledger incomplete.
// Money display paths use canonical ledger APIs; not raw trip:* for posted money.

import React, { useState, useEffect } from 'react';
import type { PeriodWeekOption } from '../../utils/periodWeekOptions';
import { Trip, DriverMetrics } from '../../types/data';
import {
  DriverDetailModals,
  useDriverDetailModals,
} from './DriverDetailModals';
import { DriverDetailToolbar } from './DriverDetailToolbar';
import { usePermissions } from '../../hooks/usePermissions';
import { useVocab } from '../../utils/vocabulary';
import { useInvalidateDriverFinancialPeriods } from '../../hooks/useDriverFinancialPeriods';
import { useDriverDetailShellData } from '../../hooks/useDriverDetailShellData';
import { useQueryClient } from '@tanstack/react-query';
import { useDriverPeriod } from './context/DriverPeriodContext';
import {
  isDriverDetailTab,
  type DriverDetailTab,
} from '../../navigation/pageRegistry';
import { DriverDetailHeader } from './DriverDetailHeader';
import { DriverDetailTabs } from './DriverDetailTabs';
import { useDriverDetailMutations } from './useDriverDetailMutations';
import { TimeFilterValue } from './TimeFilterDropdown';
import { useServiceLineScopeParam } from '../../hooks/useServiceLineScopeParam';
import {
  parseTripDate,
  getSortedTripsInRange,
  type ReconstructedMetrics,
} from '../../utils/driverOperationalMetrics';
import type { DriverDocument } from './tabs/DriverProfileTab';

export type { ReconstructedMetrics, DriverDocument };
export { parseTripDate, getSortedTripsInRange };

interface DriverDetailProps {
  driverId: string;
  driverName: string;
  driver?: any;
  /** Optional seed trips — detail always fetches its own full set. */
  trips?: Trip[];
  metrics?: DriverMetrics[];
  onBack: () => void;
  /** Deep-link tab from `/drivers/:id/:tab` */
  initialTab?: DriverDetailTab | string;
  onTabChange?: (tab: DriverDetailTab) => void;
}

export function DriverDetail({
  driverId,
  driverName,
  driver,
  trips = [],
  metrics: csvMetrics,
  onBack,
  initialTab,
  onTabChange,
}: DriverDetailProps) {
  const { serviceLineParam } = useServiceLineScopeParam();
  const { v } = useVocab();
  const { can } = usePermissions();
  const canEditTransactions = can('transactions.edit');
  const canBackfill = can('data.backfill');
  const canRepairLedger = canEditTransactions || canBackfill;
  const canEditDrivers = can('drivers.edit');
  const { period, setPeriod } = useDriverPeriod();
  const [activeTab, setActiveTab] = useState<string>(() =>
    isDriverDetailTab(initialTab) ? initialTab : 'overview',
  );
  const [profileSubTab, setProfileSubTab] = useState<'documents' | 'personal-info' | 'notes'>('documents');

  useEffect(() => {
    if (isDriverDetailTab(initialTab)) setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab !== 'profile') setProfileSubTab('documents');
    if (isDriverDetailTab(tab)) onTabChange?.(tab);
  };

  const {
    paymentModalState,
    setPaymentModalState,
    writeOffModalState,
    setWriteOffModalState,
    payoutModalState,
    setPayoutModalState,
    transactionToDelete,
    setTransactionToDelete,
  } = useDriverDetailModals();
  const [walletView, setWalletView] = useState<'ledger' | 'settlements'>('settlements');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['All']));
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ preset: 'all' });

  const data = useDriverDetailShellData({
    driverId,
    driverName,
    driver,
    trips,
    csvMetrics,
    activeTab,
    period,
    setPeriod,
    selectedPlatforms,
    timeFilter,
    serviceLineParam,
  });

  const queryClient = useQueryClient();
  const invalidateFinancialPeriods = useInvalidateDriverFinancialPeriods();

  const mutations = useDriverDetailMutations({
    driverId,
    driverName,
    driver,
    transactions: data.transactions,
    rqTollLogs: data.rqTollLogs as any[],
    allTrips: data.allTrips,
    txQueryKey: data.txQueryKey,
    queryClient,
    invalidateFinancialPeriods,
    setLedgerRefreshKey: data.setLedgerRefreshKey,
    paymentModalState,
    setPaymentModalState,
    writeOffModalState,
    payoutModalState,
    transactionToDelete,
    setTransactionToDelete,
    ledgerDateRangeStrings: data.ledgerDateRangeStrings,
    resolvedFinancialsSource: data.resolvedFinancials.source,
    resolvedFinancialsMissingPlatforms: data.resolvedFinancials.missingPlatforms,
    ledgerOverviewLoaded: data.ledgerOverviewLoaded,
  });

  const handlePeriodWeekSelect = (p: PeriodWeekOption) => {
    if (!p.startDate || !p.endDate) return;
    const [y1, m1, d1] = p.startDate.split('-').map(Number);
    const [y2, m2, d2] = p.endDate.split('-').map(Number);
    setPeriod({
      from: new Date(y1, m1 - 1, d1, 12, 0, 0, 0),
      to: new Date(y2, m2 - 1, d2, 12, 0, 0, 0),
    });
  };

  if (!data.dateRange?.from) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
        Please select a date range to view driver metrics.
      </div>
    );
  }

  const wp = data.walletPayments;
  const desk = data.deskTotals;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <DriverDetailToolbar
        onBack={onBack}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        activeTab={activeTab}
        showOverviewDateControls={data.showOverviewDateControls}
        dateFrom={data.dateRange?.from}
        dateTo={data.dateRange?.to}
        onPeriodWeekSelect={handlePeriodWeekSelect}
        onTripLedgerGapDiagnostic={mutations.handleTripLedgerGapDiagnostic}
        tripGapDiagLoading={mutations.tripGapDiagLoading}
        onAddNote={() => {
          setProfileSubTab('notes');
          handleTabChange('profile');
        }}
      />

      <DriverDetailHeader
        driverId={driverId}
        driverName={driverName}
        driver={driver}
        tierName={data.currentTier?.name}
        lifetimeTrips={data.resolvedFinancials.lifetimeTrips}
        performanceLoading={data.performanceLoading}
        currentRating={data.metrics.currentRating}
        ratingReady={data.serverTripsLoaded}
        tripsLabel={v('trips')}
        ratingLabel={v('rating')}
        periodCompletedCount={data.periodCompletedFromOps}
      />

      <DriverDetailTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        performanceLoading={data.performanceLoading}
        driverId={driverId}
        driverName={driverName}
        driver={driver}
        canRepairLedger={canRepairLedger}
        canEditTransactions={canEditTransactions}
        canEditDrivers={canEditDrivers}
        profileSubTab={profileSubTab}
        ledgerOverview={data.ledgerOverview}
        ledgerOverviewLoaded={data.ledgerOverviewLoaded}
        serverTripsLoaded={data.serverTripsLoaded}
        repairInProgress={mutations.repairInProgress}
        repairResult={mutations.repairResult}
        tripGapDiagLoading={mutations.tripGapDiagLoading}
        onTripLedgerGapDiagnostic={mutations.handleTripLedgerGapDiagnostic}
        onRepairLedger={mutations.handleRepairLedger}
        resolvedFinancials={data.resolvedFinancials}
        metrics={data.metrics}
        isToday={data.isToday}
        ledgerDateRangeStrings={data.ledgerDateRangeStrings}
        selectedPlatforms={selectedPlatforms}
        transactions={data.transactions}
        allTrips={data.allTrips}
        quotaConfig={data.quotaConfig}
        csvMetrics={csvMetrics}
        financialDateRange={data.financialDateRange}
        onPeriodWeekSelect={handlePeriodWeekSelect}
        sharedFinancialBundle={data.sharedFinancialBundle}
        walletPayoutPeriodRows={data.walletPayoutPeriodRows}
        walletCashWeeks={data.walletCashWeeks}
        walletCollectionTotals={desk.walletCollectionTotals}
        walletView={walletView}
        setWalletView={setWalletView}
        callOutstandingByMonday={desk.callOutstandingByMonday}
        setPaymentModalState={setPaymentModalState}
        setWriteOffModalState={setWriteOffModalState}
        setPayoutModalState={setPayoutModalState}
        handleDeleteTransaction={mutations.handleDeleteTransaction}
        paymentsLogTab={wp.paymentsLogTab}
        setPaymentsLogTab={wp.setPaymentsLogTab}
        cashReceivedTransactions={wp.cashReceivedTransactions}
        bankTransferTransactions={wp.bankTransferTransactions}
        activePaymentTransactions={wp.activePaymentTransactions}
        groupedPaymentTransactions={wp.groupedPaymentTransactions}
        expandedPaymentGroups={wp.expandedPaymentGroups}
        togglePaymentGroup={wp.togglePaymentGroup}
        openWalletPeriodPrefill={desk.openWalletPeriodPrefill}
        openFleetOwesPrefill={desk.openFleetOwesPrefill}
        handleVerifyTransaction={mutations.handleVerifyTransaction}
        handleEditTransaction={mutations.handleEditTransaction}
        periodCompletedFromOps={data.periodCompletedFromOps}
        operationalTotals={data.operationalTotals}
        ledgerRefreshKey={data.ledgerRefreshKey}
        setLedgerRefreshKey={data.setLedgerRefreshKey}
      />

      <DriverDetailModals
        driverName={driverName}
        callOutstanding={desk.walletCollectionTotals.callOutstanding}
        logCashPeriods={desk.logCashPeriods}
        transactions={data.transactions}
        paymentModalState={paymentModalState}
        setPaymentModalState={setPaymentModalState}
        writeOffModalState={writeOffModalState}
        setWriteOffModalState={setWriteOffModalState}
        payoutModalState={payoutModalState}
        setPayoutModalState={setPayoutModalState}
        transactionToDelete={transactionToDelete}
        setTransactionToDelete={setTransactionToDelete}
        onSavePayment={mutations.handleSavePayment}
        onSaveCashWriteOff={mutations.handleSaveCashWriteOff}
        onSaveDriverPayout={mutations.handleSaveDriverPayout}
        onConfirmDeleteTransaction={mutations.confirmDeleteTransaction}
        tripGapDiagOpen={mutations.tripGapDiagOpen}
        setTripGapDiagOpen={mutations.setTripGapDiagOpen}
        tripGapDiagResult={mutations.tripGapDiagResult}
      />
    </div>
  );
}
