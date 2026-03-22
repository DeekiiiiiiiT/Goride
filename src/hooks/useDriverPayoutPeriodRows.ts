import { useState, useEffect, useMemo } from 'react';
import type { FinancialTransaction, Trip, DriverMetrics, TierConfig } from '../types/data';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { api } from '../services/api';
import { tierService } from '../services/tierService';
import { computeWeeklyCashSettlement, CashWeekData } from '../utils/cashSettlementCalc';
import { buildLedgerPayoutPeriodRows } from '../utils/buildLedgerPayoutPeriodRows';

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

  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [finalizedReports, setFinalizedReports] = useState<any[]>([]);
  const [fuelDataLoading, setFuelDataLoading] = useState(true);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);

  useEffect(() => {
    tierService.getTiers().then(setTiers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFinalizedData = async () => {
      setFuelDataLoading(true);
      try {
        const [drivers, vehicles, allReports] = await Promise.all([
          api.getDrivers().catch(() => []),
          api.getVehicles().catch(() => []),
          api.getFinalizedReports().catch(() => []),
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
    () => computeWeeklyCashSettlement({ trips, transactions, csvMetrics }),
    [trips, transactions, csvMetrics]
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
        periodType,
      }),
    [
      ledgerLoaded,
      ledgerError,
      ledgerRows,
      cashWeeks,
      transactions,
      finalizedReports,
      periodType,
    ]
  );

  const isReady = tiers.length > 0 && !fuelDataLoading;

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
