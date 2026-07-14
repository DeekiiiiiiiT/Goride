import { useState, useEffect, useMemo } from 'react';
import type { FinancialTransaction, Trip, DriverMetrics, TierConfig, DisputeRefund } from '../types/data';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { api } from '../services/api';
import { computeWeeklyCashSettlement, CashWeekData } from '../utils/cashSettlementCalc';
import { buildLedgerPayoutPeriodRows } from '../utils/buildLedgerPayoutPeriodRows';
import { expandDriverTransactionIds } from '../utils/expandDriverTransactionIds';
import { useFleetTimezone } from '../utils/timezoneDisplay';
export type PeriodType = 'daily' | 'weekly' | 'monthly';

export function useDriverPayoutPeriodRows(opts: {
  driverId: string;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
  periodType: PeriodType;
}): {
  periodData: PayoutPeriodRow[];
  cashWeeks: CashWeekData[];
  tiers: TierConfig[];
  isReady: boolean;
  fuelDataLoading: boolean;
  ledgerLoaded: boolean;
  ledgerError: boolean;
} {
  const { driverId, trips, transactions, csvMetrics, periodType } = opts;
  const fleetTz = useFleetTimezone();

  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [disputeRefunds, setDisputeRefunds] = useState<DisputeRefund[]>([]);
  const [fuelDataLoading, setFuelDataLoading] = useState(true);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);
  const [unifiedToll, setUnifiedToll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getTollAutomationSettings()
      .then((res) => { if (!cancelled) setUnifiedToll(res.data.unifiedTollSettlementEnabled === true); })
      .catch(() => { /* default OFF */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFinalizedData = async () => {
      setFuelDataLoading(true);
      try {
        const [drivers, vehicles, allReports, disputeRefundsRes] = await Promise.all([
          api.getDrivers().catch(() => []),
          api.getVehicles().catch(() => []),
          api.getFinalizedReports().catch(() => []),
          // Unscoped fetch — DisputeRefund.driverId is populated from the raw
          // Uber CSV "Driver UUID" column at import time with no server-side
          // normalization, so it may not match this driver's native id. Fetch
          // everything and filter client-side by the same expanded ID set
          // used below, rather than trusting a single-ID server-side match.
          api.getDisputeRefunds().catch(() => ({ data: [] as DisputeRefund[], total: 0 })),
        ]);
        if (cancelled) return;

        const driverRecord = (drivers || []).find((d: any) => d.id === driverId);
        const driverIdSet = new Set<string>([driverId]);
        if (driverRecord?.driverId) driverIdSet.add(driverRecord.driverId);

        const myVehicles = (vehicles || []).filter(
          (v: any) => v.currentDriverId && driverIdSet.has(v.currentDriverId)
        );
        const vehicleIdSet = new Set<string>(myVehicles.map((v: any) => v.id));

        const myReports = (allReports || []).filter(
          (r: any) => r.status === 'Finalized' && vehicleIdSet.has(r.vehicleId)
        );
        setFinalizedReports(myReports);

        const expandedIdSet = new Set(
          expandDriverTransactionIds([driverId, driverRecord?.driverId, driverRecord?.uberDriverId, driverRecord?.inDriveDriverId])
        );
        const myDisputeRefunds = (disputeRefundsRes.data || []).filter((r) => expandedIdSet.has(r.driverId));
        setDisputeRefunds(myDisputeRefunds);
      } catch (e) {
        console.error('[useDriverPayoutPeriodRows] Failed to load finalized reports:', e);
      } finally {
        if (!cancelled) setFuelDataLoading(false);
      }
    };
    loadFinalizedData();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  useEffect(() => {
    let cancelled = false;
    setLedgerLoaded(false);
    setLedgerError(false);

    api
      .getLedgerEarningsHistory({ driverId, periodType })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setLedgerRows(result.data);
        } else {
          setLedgerRows([]);
        }
        setLedgerLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[useDriverPayoutPeriodRows] Ledger fetch failed:', err);
        setLedgerError(true);
        setLedgerLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [driverId, periodType]);

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

  // Share % comes from ledger rows (policy resolve on server). Ready when ledger + fuel loads finish.
  const isReady = ledgerLoaded && !fuelDataLoading;

  // Compat: derive display tiers from latest ledger rows if callers still read `tiers`.
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
    fuelDataLoading,
    ledgerLoaded,
    ledgerError,
  };
}
