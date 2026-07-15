import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
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

  // Prefer ledger `payout_bank` events (needs edge deploy with eventTypes filter).
  const payoutBankQuery = useQuery({
    queryKey: ['ledgerPayoutBank', driverId, financialBundle.expandedIds.join(',')],
    queryFn: async () => {
      const ids = financialBundle.expandedIds.length
        ? financialBundle.expandedIds.join(',')
        : driverId;
      const page = await api.getCanonicalLedgerEvents({
        driverId: ids,
        eventTypes: 'payout_bank',
        limit: 500,
      });
      return (page.data || []).filter((e) => String(e.eventType || '') === 'payout_bank');
    },
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled: Boolean(driverId),
  });

  const payoutBankEvents = payoutBankQuery.data ?? [];
  const payoutBankReady = !payoutBankQuery.isLoading;

  // Fallback: same GET /ledger/driver-overview PERIOD uses (already live — no deploy needed).
  const overviewWeekKeys = useMemo(() => {
    if (periodType !== 'weekly') return [] as Array<{ start: string; end: string }>;
    const keys: Array<{ start: string; end: string }> = [];
    const seen = new Set<string>();
    for (const lr of ledgerRows) {
      const start = String(lr?.periodStart || '').slice(0, 10);
      const end = String(lr?.periodEnd || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      if (seen.has(start)) continue;
      seen.add(start);
      keys.push({ start, end });
      if (keys.length >= 40) break;
    }
    return keys;
  }, [ledgerRows, periodType]);

  const bankByWeekQuery = useQuery({
    queryKey: ['ledgerBankByWeekOverview', driverId, overviewWeekKeys.map((k) => k.start).join('|')],
    queryFn: async () => {
      const entries = await Promise.all(
        overviewWeekKeys.map(async ({ start, end }) => {
          try {
            const ov = await api.getLedgerDriverOverview({
              driverId,
              startDate: start,
              endDate: end,
            });
            const bank = Math.abs(Number(ov?.period?.bankTransferred) || 0);
            return [start, bank] as const;
          } catch {
            return [start, 0] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    // Only when event path empty/unavailable — avoid 40 overview calls when payout_bank works.
    enabled:
      Boolean(driverId) &&
      periodType === 'weekly' &&
      payoutBankReady &&
      payoutBankEvents.length === 0 &&
      overviewWeekKeys.length > 0,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const cashWeeks: CashWeekData[] = useMemo(() => {
    const base = computeWeeklyCashSettlement({
      trips,
      transactions,
      csvMetrics,
      excludeTollEffects: unifiedToll,
      timezone: fleetTz,
      payoutBankEvents,
    });
    const bankMap = bankByWeekQuery.data;
    if (!bankMap || Object.keys(bankMap).length === 0) return base;

    return base.map((week) => {
      const key = format(week.start, 'yyyy-MM-dd');
      let bank = bankMap[key];
      if (!(bank > 0.005)) {
        for (const [k, v] of Object.entries(bankMap)) {
          const kd = new Date(`${k}T00:00:00`);
          if (Math.abs(differenceInCalendarDays(week.start, kd)) <= 2 && v > 0.005) {
            bank = v;
            break;
          }
        }
      }
      if (!(bank > 0.005) || week.bankSettled > 0.005) return week;
      return {
        ...week,
        bankSettled: bank,
        breakdown: { ...week.breakdown, bankSettled: bank },
      };
    });
  }, [
    trips,
    transactions,
    csvMetrics,
    unifiedToll,
    fleetTz,
    payoutBankEvents,
    bankByWeekQuery.data,
  ]);

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
        timezone: fleetTz,
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
      fleetTz,
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
