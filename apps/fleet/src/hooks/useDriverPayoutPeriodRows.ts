import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FinancialTransaction, Trip, DriverMetrics, TierConfig } from '../types/data';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { api } from '../services/api';
import { computeWeeklyCashSettlement, CashWeekData } from '../utils/cashSettlementCalc';
import { buildLedgerPayoutPeriodRows } from '../utils/buildLedgerPayoutPeriodRows';
import { useFleetTimezone } from '../utils/timezoneDisplay';
import {
  DRIVER_FINANCIAL_STALE_MS,
  useDriverFinancialBundle,
  type DriverFinancialBundle,
  type DriverLike,
} from './useDriverFinancialBundle';

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export function useDriverPayoutPeriodRows(opts: {
  driverId: string;
  /** Prefer passing the open driver record — avoids getDrivers() for ID expansion. */
  driver?: DriverLike | null;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
  periodType: PeriodType;
  /**
   * Prefetched bundle from FinancialSubTabs / DriverDetail — share cache with siblings.
   * When omitted, this hook mounts its own useDriverFinancialBundle (still RQ-cached).
   */
  financialBundle?: DriverFinancialBundle;
}): {
  periodData: PayoutPeriodRow[];
  cashWeeks: CashWeekData[];
  tiers: TierConfig[];
  /** Ledger ready — UI can paint; fuel columns may still be pending. */
  isReady: boolean;
  /** Legacy alias: ledger + fuel both done (prefer ledgerLoaded / !fuelDataLoading). */
  isFullyReady: boolean;
  fuelDataLoading: boolean;
  ledgerLoaded: boolean;
  ledgerError: boolean;
  financialBundle: DriverFinancialBundle;
} {
  const { driverId, driver, trips, transactions, csvMetrics, periodType, financialBundle: bundleProp } =
    opts;
  const fleetTz = useFleetTimezone();

  const localBundle = useDriverFinancialBundle(driverId, driver);
  const financialBundle = bundleProp ?? localBundle;

  const {
    finalizedReports,
    disputeRefunds,
    unifiedToll,
    isCoreLoading: fuelDataLoading,
  } = financialBundle;

  const ledgerQuery = useQuery({
    queryKey: ['ledgerEarningsHistory', driverId, periodType],
    queryFn: () => api.getLedgerEarningsHistory({ driverId, periodType }),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const ledgerLoaded = !ledgerQuery.isLoading && (ledgerQuery.isSuccess || ledgerQuery.isError);
  const ledgerError = ledgerQuery.isError;
  const ledgerRows = ledgerQuery.data?.success && ledgerQuery.data?.data ? ledgerQuery.data.data : [];

  const cashWeeks: CashWeekData[] = useMemo(
    () =>
      computeWeeklyCashSettlement({
        trips,
        transactions,
        csvMetrics,
        excludeTollEffects: unifiedToll,
        timezone: fleetTz,
      }),
    [trips, transactions, csvMetrics, unifiedToll, fleetTz]
  );

  const periodData: PayoutPeriodRow[] = useMemo(
    () =>
      buildLedgerPayoutPeriodRows({
        ledgerLoaded,
        ledgerError,
        ledgerRows,
        cashWeeks,
        transactions,
        finalizedReports,
        disputeRefunds,
        periodType,
        unifiedToll,
      }),
    [
      ledgerLoaded,
      ledgerError,
      ledgerRows,
      cashWeeks,
      transactions,
      finalizedReports,
      disputeRefunds,
      periodType,
      unifiedToll,
    ]
  );

  // Progressive: paint when ledger is ready; fuel deductions fill as core bundle arrives.
  const isReady = ledgerLoaded;
  const isFullyReady = ledgerLoaded && !fuelDataLoading;

  const tiers: TierConfig[] = useMemo(() => {
    const seen = new Map<string, TierConfig>();
    for (const row of ledgerRows) {
      const t = row?.tier;
      if (t?.id && !seen.has(t.id)) {
        seen.set(t.id, {
          id: t.id,
          name: t.name,
          minEarnings: 0,
          maxEarnings: null,
          sharePercentage: t.sharePercentage,
          color: t.color,
        });
      }
    }
    return Array.from(seen.values());
  }, [ledgerRows]);

  return {
    periodData,
    cashWeeks,
    tiers,
    isReady,
    isFullyReady,
    fuelDataLoading,
    ledgerLoaded,
    ledgerError,
    financialBundle,
  };
}
