import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Scale, Wallet } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { FinancialTransaction } from '../../types/data';
import type { DriverFinancialPeriodClient } from '../../types/driverPayoutPeriod';
import { periodsToPayoutPeriodRows } from '../../utils/periodsToPayoutPeriodRows';
import { FleetCashSettlementTab } from './settlement/FleetCashSettlementTab';
import { FleetEarningsSettlementTab } from './settlement/FleetEarningsSettlementTab';

type SettlementTab = 'cash' | 'earnings';

type FleetSettlementPageProps = {
  onBack?: () => void;
};

/**
 * Fleet-only Layer B desk:
 * Cash Settlement = same still-owed SSOT as roamfleet Cash Wallet.
 * Earnings = driver share − deductions (fuel/toll/maint/misc) → net take-home.
 */
export function FleetSettlementPage({ onBack }: FleetSettlementPageProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [tab, setTab] = useState<SettlementTab>('cash');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [periods, setPeriods] = useState<DriverFinancialPeriodClient[]>([]);

  const driverIds = useMemo(() => {
    return [user?.id, driverRecord?.id, driverRecord?.driverId].filter(Boolean) as string[];
  }, [user?.id, driverRecord?.id, driverRecord?.driverId]);

  const periodRows = useMemo(() => periodsToPayoutPeriodRows(periods), [periods]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        // Prefer canonical fleet driver id first (same id Fleet Detail uses).
        const periodIdCandidates = [
          driverRecord?.id,
          driverRecord?.driverId,
          user.id,
        ].filter(Boolean) as string[];

        const periodFetches = periodIdCandidates.map((id) =>
          api
            .getDriverFinancialPeriods(id)
            .then((res) =>
              Array.isArray(res?.data) ? (res.data as DriverFinancialPeriodClient[]) : [],
            )
            .catch(() => [] as DriverFinancialPeriodClient[]),
        );

        const [periodBatches, txData] = await Promise.all([
          Promise.all(periodFetches),
          api.getTransactions(driverIds).catch(() => [] as FinancialTransaction[]),
        ]);

        if (cancelled) return;

        // Merge periods by Monday anchor (first non-empty candidate wins per week).
        const periodMap = new Map<string, DriverFinancialPeriodClient>();
        for (const batch of periodBatches) {
          for (const p of batch) {
            const key = String(p.periodAnchor).slice(0, 10);
            if (!periodMap.has(key)) periodMap.set(key, p);
          }
        }
        setPeriods(
          [...periodMap.values()].sort((a, b) =>
            String(b.periodAnchor).localeCompare(String(a.periodAnchor)),
          ),
        );

        setTransactions(Array.isArray(txData) ? txData : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load fleet settlement');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, driverRecord?.id, driverRecord?.driverId, driverIds]);

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Fleet Settlement</h1>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { id: 'cash' as const, label: 'Cash Settlement', icon: Scale },
            { id: 'earnings' as const, label: 'Earnings', icon: Wallet },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              tab === id
                ? 'bg-[#004ac6] text-white'
                : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : (
        <>
          {tab === 'cash' && <FleetCashSettlementTab periodRows={periodRows} />}
          {tab === 'earnings' && (
            <FleetEarningsSettlementTab periods={periods} transactions={transactions} />
          )}
        </>
      )}
    </div>
  );
}
