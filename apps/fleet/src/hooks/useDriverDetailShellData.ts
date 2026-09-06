/**
 * Driver Detail shell data orchestration (trips, ledger, money, metrics, wallet desk).
 * Extracted from DriverDetail (Round 4 Phase 3) — behavior unchanged.
 */
import * as React from 'react';
import { useMemo, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import type {
  Trip,
  DriverMetrics,
  FinancialTransaction,
  QuotaConfig,
  TierConfig,
} from '../types/data';
import { api } from '../services/api';
import { useDriverDetailTrips } from './useDriverDetailTrips';
import { useDriverDetailLedger } from './useDriverDetailLedger';
import {
  useDriverTransactions,
  mergeDriverMoneyTransactions,
} from './useDriverTransactions';
import { useDriverTollLogs } from './useDriverTollLogs';
import { useDriverDetailWalletPayments } from './useDriverDetailWalletPayments';
import { useDriverWalletDeskTotals } from './useDriverWalletDeskTotals';
import { useDriverFinancialBundle } from './useDriverFinancialBundle';
import { useDriverPayoutPeriodRows } from './useDriverPayoutPeriodRows';
import { useDriverOperationalPeriods } from './useDriverOperationalPeriods';
import { computeDriverOperationalMetrics } from '../utils/driverOperationalMetrics';
import { resolveDriverDetailFinancials } from '../utils/resolveDriverDetailFinancials';
import { TierCalculations } from '../utils/tierCalculations';
import { loadResolvedEarningsBundleForDriverWeek } from '../utils/loadResolvedEarningsBundle';
import { expandDriverTransactionIds } from '../utils/expandDriverTransactionIds';
import type { TimeFilterValue } from '../components/drivers/TimeFilterDropdown';
import type { DriverPeriodRange } from '../components/drivers/context/DriverPeriodContext';

export type UseDriverDetailShellDataArgs = {
  driverId: string;
  driverName: string;
  driver?: any;
  trips: Trip[];
  csvMetrics?: DriverMetrics[];
  activeTab: string;
  period: DriverPeriodRange;
  setPeriod: (range: DriverPeriodRange) => void;
  selectedPlatforms: Set<string>;
  timeFilter: TimeFilterValue;
  serviceLineParam?: string;
};

export function useDriverDetailShellData({
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
}: UseDriverDetailShellDataArgs) {
  const moneyTabActive = activeTab === 'financial' || activeTab === 'wallet';
  const tripsTabActive = activeTab === 'overview' || activeTab === 'quality';

  const { data: vehicleMetrics = [] } = useQuery({
    queryKey: ['vehicleMetrics'],
    queryFn: () => api.getVehicleMetrics().catch(() => []),
    enabled: tripsTabActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const financialDateRange = period;
  const dateRange = period;

  const financialDateRangeStrings = useMemo(() => {
    if (!financialDateRange?.from) return null;
    return {
      startDate: format(financialDateRange.from, 'yyyy-MM-dd'),
      endDate: format(financialDateRange.to || financialDateRange.from, 'yyyy-MM-dd'),
    };
  }, [financialDateRange]);

  const showOverviewDateControls =
    activeTab === 'overview' || activeTab === 'indrive-wallet';

  const didInitDateRangeFromCsv = useRef(false);
  useEffect(() => {
    didInitDateRangeFromCsv.current = false;
  }, [driverId]);

  useEffect(() => {
    if (didInitDateRangeFromCsv.current) return;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') && params.get('to')) {
        didInitDateRangeFromCsv.current = true;
        return;
      }
    }
    if (!csvMetrics?.length) return;
    const mine = csvMetrics.filter((m) => {
      const id = String(m.driverId ?? '').trim();
      return id === driverId || id.toLowerCase() === driverId.toLowerCase();
    });
    if (!mine.length) return;
    const latest = [...mine].sort(
      (a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime(),
    )[0];
    if (!latest?.periodStart || !latest?.periodEnd) return;
    try {
      const fromStr = String(latest.periodStart).slice(0, 10);
      const toStr = String(latest.periodEnd).slice(0, 10);
      const from = new Date(`${fromStr}T12:00:00`);
      const to = new Date(`${toStr}T12:00:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
      setPeriod({ from, to });
      didInitDateRangeFromCsv.current = true;
    } catch {
      /* ignore */
    }
  }, [csvMetrics, driverId, setPeriod]);

  const ledgerDateRangeStrings = financialDateRangeStrings;

  const { totals: operationalTotals } = useDriverOperationalPeriods(
    driverId,
    financialDateRangeStrings?.startDate,
    financialDateRangeStrings?.endDate,
  );
  const periodCompletedFromOps =
    operationalTotals.completedCount > 0 ? operationalTotals.completedCount : null;

  const { serverTrips, serverTripsLoaded } = useDriverDetailTrips({
    driverId,
    driverName,
    driver,
    activeTab,
    startDate: financialDateRangeStrings?.startDate,
    endDate: financialDateRangeStrings?.endDate,
  });

  const {
    ledgerOverview,
    ledgerOverviewLoaded,
    ledgerRefreshKey,
    setLedgerRefreshKey,
  } = useDriverDetailLedger({
    driverId,
    startDate: ledgerDateRangeStrings?.startDate,
    endDate: ledgerDateRangeStrings?.endDate,
    selectedPlatforms,
  });

  const allTrips = useMemo(() => {
    const seen = new Set<string>();
    const merged: Trip[] = [];
    for (const t of serverTrips) {
      if (t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    }
    for (const t of trips || []) {
      if (t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    }
    return merged;
  }, [serverTrips, trips]);

  const moneyExpandedIds = React.useMemo(
    () =>
      expandDriverTransactionIds([
        driverId,
        driver?.uberDriverId,
        driver?.inDriveDriverId,
      ]),
    [driverId, driver?.uberDriverId, driver?.inDriveDriverId],
  );

  const txFetchRange = React.useMemo((): {
    startDate?: string;
    endDate?: string;
    maxRows: number;
  } => {
    if (!financialDateRangeStrings?.endDate) {
      return { maxRows: 15_000 };
    }
    const end = financialDateRangeStrings.endDate;
    const lookback = new Date(`${end}T00:00:00Z`);
    lookback.setUTCDate(lookback.getUTCDate() - 400);
    return {
      startDate: lookback.toISOString().slice(0, 10),
      endDate: end,
      maxRows: 15_000,
    };
  }, [financialDateRangeStrings]);

  const {
    transactions: rqTransactions,
    queryKey: txQueryKey,
  } = useDriverTransactions(moneyExpandedIds, {
    enabled: moneyTabActive,
    startDate: txFetchRange.startDate,
    endDate: txFetchRange.endDate,
    maxRows: txFetchRange.maxRows,
  });
  const { tollLogs: rqTollLogs } = useDriverTollLogs(moneyExpandedIds, {
    enabled: moneyTabActive,
  });

  const transactions = React.useMemo(
    () => mergeDriverMoneyTransactions(rqTransactions, rqTollLogs as FinancialTransaction[]),
    [rqTransactions, rqTollLogs],
  );

  const walletPayments = useDriverDetailWalletPayments(transactions);

  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [quotaConfig, setQuotaConfig] = useState<QuotaConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadResolvedEarningsBundleForDriverWeek(
      driverId,
      undefined,
      serviceLineParam as 'rideshare' | 'rush_delivery' | undefined,
    )
      .then((bundle) => {
        if (cancelled) return;
        setTiers(bundle.tiers || []);
        setQuotaConfig(bundle.quotas || null);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [driverId, serviceLineParam]);

  const { monthlyEarnings, currentTier } = useMemo(() => {
    const mEarnings = TierCalculations.calculateMonthlyEarnings(allTrips);
    const cTier = TierCalculations.getTierForEarnings(mEarnings, tiers);
    return { monthlyEarnings: mEarnings, currentTier: cTier };
  }, [allTrips, tiers]);

  const sharedFinancialBundle = useDriverFinancialBundle(driverId, driver, {
    enabled: moneyTabActive || tripsTabActive,
  });

  const metrics = useMemo(
    () =>
      computeDriverOperationalMetrics({
        allTrips,
        dateRange: period,
        csvMetrics,
        transactions,
        vehicleMetrics,
        driverVehicles: sharedFinancialBundle.vehicles,
        driver,
        selectedPlatforms,
        timeFilter,
        activeTab,
        monthlyEarnings,
        currentTier,
      }),
    [
      allTrips,
      period,
      csvMetrics,
      transactions,
      vehicleMetrics,
      sharedFinancialBundle.vehicles,
      driver,
      selectedPlatforms,
      timeFilter,
      activeTab,
      monthlyEarnings,
      currentTier,
    ],
  );

  const resolvedFinancials = useMemo(
    () =>
      resolveDriverDetailFinancials({
        ledgerOverview,
        ledgerOverviewLoaded,
        metrics,
        allTrips,
        period,
        periodCompletedFromOps,
      }),
    [ledgerOverview, ledgerOverviewLoaded, metrics, allTrips, period, periodCompletedFromOps],
  );

  const { periodData: walletPayoutPeriodRows, cashWeeks: walletCashWeeks } =
    useDriverPayoutPeriodRows({
      driverId,
      driver,
      trips: allTrips,
      transactions,
      csvMetrics: csvMetrics || [],
      periodType: 'weekly',
      financialBundle: sharedFinancialBundle,
      enabled: moneyTabActive,
      startDate: financialDateRangeStrings?.startDate,
      endDate: financialDateRangeStrings?.endDate,
    });

  const deskTotals = useDriverWalletDeskTotals(walletCashWeeks, walletPayoutPeriodRows);

  const performanceLoading =
    tripsTabActive && !serverTripsLoaded && (!metrics || metrics.totalTrips === 0);

  const isToday = !!(
    dateRange?.to &&
    format(dateRange.to, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') &&
    metrics.daysDiff === 1
  );

  return {
    moneyTabActive,
    tripsTabActive,
    financialDateRange,
    dateRange,
    financialDateRangeStrings,
    showOverviewDateControls,
    ledgerDateRangeStrings,
    operationalTotals,
    periodCompletedFromOps,
    serverTripsLoaded,
    ledgerOverview,
    ledgerOverviewLoaded,
    ledgerRefreshKey,
    setLedgerRefreshKey,
    allTrips,
    transactions,
    rqTollLogs,
    txQueryKey,
    walletPayments,
    quotaConfig,
    currentTier,
    sharedFinancialBundle,
    metrics,
    resolvedFinancials,
    walletPayoutPeriodRows,
    walletCashWeeks,
    deskTotals,
    performanceLoading,
    isToday,
  };
}
