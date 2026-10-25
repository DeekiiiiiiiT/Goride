import { useEffect, useState } from 'react';
import { parseISO } from 'date-fns';
import type { FinancialTransaction, Trip, DriverMetrics, TierConfig } from '../types/data';
import type { PayoutPeriodRow, PayoutStatus } from '../types/driverPayoutPeriod';
import { API_ENDPOINTS } from '../services/apiConfig';
import { fetchWithRetry } from '../services/api';
import { supabase } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

export type PeriodType = 'daily' | 'weekly' | 'monthly';

type ServerPeriod = {
  periodAnchor?: string;
  periodEnd?: string;
  earningsGross?: number;
  driverSharePercent?: number;
  driverShare?: number;
  tollChargedToDriver?: number;
  fuelDeduction?: number;
  fuelDriverSpend?: number;
  payoutNet?: number;
  fuelFinalized?: boolean;
  tripCount?: number;
  tierName?: string;
  cashCollected?: number;
  cashReturned?: number;
  settlementPaid?: number;
  settlementStatus?: string;
};

function statusOf(row: ServerPeriod): PayoutStatus {
  if (row.fuelFinalized) return Number(row.cashCollected) - Number(row.cashReturned) > 0.5 ? 'Awaiting Cash' : 'Finalized';
  return 'Pending';
}

/**
 * Admin weekly rows come from the server week. This hook does not recompute the settlement.
 */
export function useDriverPayoutPeriodRows(opts: {
  driverId: string;
  trips: Trip[];
  transactions: FinancialTransaction[];
  csvMetrics: DriverMetrics[];
  periodType: PeriodType;
}): {
  periodData: PayoutPeriodRow[];
  cashWeeks: never[];
  tiers: TierConfig[];
  isReady: boolean;
  fuelDataLoading: boolean;
  ledgerLoaded: boolean;
  ledgerError: boolean;
} {
  const { driverId } = opts;
  const [periodData, setPeriodData] = useState<PayoutPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerError, setLedgerError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLedgerError(false);
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || publicAnonKey;
        const response = await fetchWithRetry(
          `${API_ENDPOINTS.fleetPay}/driver-financial-periods?driverId=${encodeURIComponent(driverId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error('Could not load weeks');
        const body = await response.json();
        const rows = (Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []) as ServerPeriod[];
        if (cancelled) return;
        setPeriodData(
          rows.map((row) => {
            const cashOwed = Number(row.cashCollected) || 0;
            const cashPaid = Number(row.cashReturned) || 0;
            return {
              periodStart: parseISO(`${String(row.periodAnchor || '').slice(0, 10)}T00:00:00`),
              periodEnd: parseISO(`${String(row.periodEnd || row.periodAnchor || '').slice(0, 10)}T23:59:59`),
              grossRevenue: Number(row.earningsGross) || 0,
              driverSharePercent: Number(row.driverSharePercent) || 0,
              driverShare: Number(row.driverShare) || 0,
              tollExpenses: Number(row.tollChargedToDriver) || 0,
              tollReconciled: 0,
              tollUnreconciled: 0,
              fuelDeduction: Number(row.fuelDeduction) || 0,
              fuelCredits: Number(row.fuelDriverSpend) || 0,
              totalDeductions: Number(row.fuelDeduction) || 0,
              netPayout: Number(row.payoutNet) || 0,
              isFinalized: !!row.fuelFinalized,
              tripCount: Number(row.tripCount) || 0,
              tierName: row.tierName || 'Default',
              cashOwed,
              cashPaid,
              cashBalance: Math.round((cashOwed - cashPaid) * 100) / 100,
              status: statusOf(row),
            };
          }),
        );
      } catch {
        if (!cancelled) {
          setLedgerError(true);
          setPeriodData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  return {
    periodData,
    cashWeeks: [],
    tiers: [],
    isReady: !loading,
    fuelDataLoading: loading,
    ledgerLoaded: !loading,
    ledgerError,
  };
}
