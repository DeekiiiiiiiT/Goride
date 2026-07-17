import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format } from 'date-fns';
import type { FinancialTransaction, Trip, DriverMetrics, TierConfig } from '../types/data';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { api } from '../services/api';
import { computeWeeklyCashSettlement, CashWeekData } from '../utils/cashSettlementCalc';
import { buildLedgerPayoutPeriodRows } from '../utils/buildLedgerPayoutPeriodRows';
import { deriveDriverFinancialDateRange } from '../utils/driverFinancialDateRange';
import { useFleetTimezone } from '../utils/timezoneDisplay';
import {
  DRIVER_FINANCIAL_STALE_MS,
  useDriverFinancialBundle,
  type DriverFinancialBundle,
  type DriverLike,
} from './useDriverFinancialBundle';
import {
  overlaySharedPeriodsOntoPayoutRows,
  periodsToPayoutPeriodRows,
  useDriverFinancialPeriods,
} from './useDriverFinancialPeriods';

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
  /**
   * Parent-owned weekly rows (DriverDetail single pipeline). Skips ledger/cash recompute.
   */
  sharedWeekly?: {
    periodData: PayoutPeriodRow[];
    cashWeeks?: CashWeekData[];
  };
  /**
   * Optional activity window (yyyy-MM-dd) — aligns daily/monthly ledger coverage with Earnings.
   * When omitted, derived from trips + transactions.
   */
  startDate?: string;
  endDate?: string;
  /** Draft fuel by period start key — Payout estimates for non-finalized weeks. */
  draftFuelByPeriod?: Record<string, { deduction: number; fleetShare?: number }>;
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
  const {
    driverId,
    driver,
    trips,
    transactions,
    csvMetrics,
    periodType,
    financialBundle: bundleProp,
    sharedWeekly,
    startDate: startDateProp,
    endDate: endDateProp,
    draftFuelByPeriod,
  } = opts;
  const fleetTz = useFleetTimezone();
  const useSharedWeekly = Boolean(sharedWeekly?.periodData) && periodType === 'weekly';

  const localBundle = useDriverFinancialBundle(driverId, driver);
  const financialBundle = bundleProp ?? localBundle;
  const sharedPeriodsQuery = useDriverFinancialPeriods(driverId);

  const {
    finalizedReports,
    disputeRefunds,
    unifiedToll,
    isCoreLoading: fuelDataLoading,
  } = financialBundle;

  const activityRange = useMemo(
    () => deriveDriverFinancialDateRange(trips, transactions),
    [trips, transactions],
  );
  const startDate = startDateProp || activityRange?.startDate;
  const endDate = endDateProp || activityRange?.endDate;

  const ledgerQuery = useQuery({
    queryKey: ['ledgerEarningsHistory', driverId, periodType, startDate || '', endDate || ''],
    queryFn: () =>
      api.getLedgerEarningsHistory({
        driverId,
        periodType,
        startDate,
        endDate,
      }),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled: Boolean(driverId) && !useSharedWeekly,
  });

  const ledgerLoaded = !ledgerQuery.isLoading && (ledgerQuery.isSuccess || ledgerQuery.isError);
  const ledgerError = ledgerQuery.isError;
  const ledgerRows = ledgerQuery.data?.success && ledgerQuery.data?.data ? ledgerQuery.data.data : [];

  // Prefer ledger payout_bank + payout_cash (PERIOD SSOT for Bank Settled / Uber Cash Collected).
  const payoutBankQuery = useQuery({
    queryKey: ['ledgerPayoutCashBank', driverId, financialBundle.expandedIds.join(',')],
    queryFn: async () => {
      const ids = financialBundle.expandedIds.length
        ? financialBundle.expandedIds.join(',')
        : driverId;
      const page = await api.getCanonicalLedgerEvents({
        driverId: ids,
        eventTypes: 'payout_bank,payout_cash',
        limit: 500,
      });
      return (page.data || []).filter((e) => {
        const et = String(e.eventType || '');
        return et === 'payout_bank' || et === 'payout_cash';
      });
    },
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled: Boolean(driverId) && !useSharedWeekly,
  });

  const payoutBankEvents = payoutBankQuery.data ?? [];
  const payoutBankReady = useSharedWeekly || !payoutBankQuery.isLoading;
  const hasPayoutCashEvents = payoutBankEvents.some((e) => String(e.eventType || '') === 'payout_cash');
  const hasPayoutBankEvents = payoutBankEvents.some((e) => String(e.eventType || '') === 'payout_bank');

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

  const overviewCashBankByWeekQuery = useQuery({
    queryKey: [
      'ledgerCashBankByWeekOverview',
      driverId,
      overviewWeekKeys.map((k) => k.start).join('|'),
      hasPayoutCashEvents,
      hasPayoutBankEvents,
    ],
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
            // Uber-only — InDrive trip cash is still added in buildWeeklyCashRisk.
            const uberCash = Math.abs(Number(ov?.platformStats?.Uber?.cashCollected) || 0);
            return [start, { bank, uberCash }] as const;
          } catch {
            return [start, { bank: 0, uberCash: 0 }] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, { bank: number; uberCash: number }>;
    },
    // Only when event path incomplete — avoid 40 overview calls when payout_* events work.
    enabled:
      Boolean(driverId) &&
      !useSharedWeekly &&
      periodType === 'weekly' &&
      payoutBankReady &&
      (!hasPayoutBankEvents || !hasPayoutCashEvents) &&
      overviewWeekKeys.length > 0,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const cashWeeks: CashWeekData[] = useMemo(() => {
    if (useSharedWeekly) return sharedWeekly?.cashWeeks ?? [];
    const overviewMap = overviewCashBankByWeekQuery.data || {};
    const overviewUberCashByWeek: Record<string, number> = {};
    for (const [k, v] of Object.entries(overviewMap)) {
      if (v.uberCash > 0.005) overviewUberCashByWeek[k] = v.uberCash;
    }
    const base = computeWeeklyCashSettlement({
      trips,
      transactions,
      csvMetrics,
      excludeTollEffects: unifiedToll,
      timezone: fleetTz,
      payoutBankEvents,
      overviewUberCashByWeek: hasPayoutCashEvents ? undefined : overviewUberCashByWeek,
    });
    if (!Object.keys(overviewMap).length) return base;

    return base.map((week) => {
      const key = format(week.start, 'yyyy-MM-dd');
      let bank = overviewMap[key]?.bank ?? 0;
      if (!(bank > 0.005)) {
        for (const [k, v] of Object.entries(overviewMap)) {
          const kd = new Date(`${k}T00:00:00`);
          if (Math.abs(differenceInCalendarDays(week.start, kd)) <= 2 && v.bank > 0.005) {
            bank = v.bank;
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
    useSharedWeekly,
    sharedWeekly?.cashWeeks,
    trips,
    transactions,
    csvMetrics,
    unifiedToll,
    fleetTz,
    payoutBankEvents,
    hasPayoutCashEvents,
    overviewCashBankByWeekQuery.data,
  ]);

  const periodData: PayoutPeriodRow[] = useMemo(() => {
    // Weekly SSOT: shared period projection (Driver Share + cash + tolls + fuel).
    if (periodType === 'weekly') {
      const fromPeriods = periodsToPayoutPeriodRows(sharedPeriodsQuery.data);
      if (fromPeriods.length > 0) return fromPeriods;
      // First paint / empty projection — fall back to ledger builder until rebuild lands.
    }

    const base =
      useSharedWeekly && sharedWeekly?.periodData
        ? sharedWeekly.periodData
        : buildLedgerPayoutPeriodRows({
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
            draftFuelByPeriod,
          });
    if (periodType === 'weekly') {
      return overlaySharedPeriodsOntoPayoutRows(base, sharedPeriodsQuery.data);
    }
    return base;
  }, [
    useSharedWeekly,
    sharedWeekly?.periodData,
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
    draftFuelByPeriod,
    sharedPeriodsQuery.data,
  ]);

  // Progressive: weekly paints from shared periods; otherwise wait for ledger.
  const isReady =
    periodType === 'weekly'
      ? Boolean(sharedPeriodsQuery.data) || ledgerLoaded || useSharedWeekly
      : useSharedWeekly
        ? true
        : ledgerLoaded;
  const isFullyReady =
    periodType === 'weekly'
      ? !fuelDataLoading && (Boolean(sharedPeriodsQuery.data?.length) || ledgerLoaded)
      : useSharedWeekly
        ? !fuelDataLoading
        : ledgerLoaded && !fuelDataLoading;

  const tiers: TierConfig[] = useMemo(() => {
    const seen = new Map<string, TierConfig>();
    for (const p of sharedPeriodsQuery.data || []) {
      const id = p.tierId || p.tierName;
      if (id && !seen.has(String(id))) {
        seen.set(String(id), {
          id: String(id),
          name: p.tierName || 'Default',
          minEarnings: 0,
          maxEarnings: null,
          sharePercentage: Number(p.driverSharePercent) || 0,
          color: '#94a3b8',
        });
      }
    }
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
  }, [ledgerRows, sharedPeriodsQuery.data]);

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
