import React, { useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Banknote,
  BarChart3,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { formatMoneyMinor, formatMoneyMinorPlain } from '@roam/types/rides';
import { sumCashInHandFromTrips } from '@roam/types/cashInHand';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';
import { useIndependentTrips } from '../../hooks/useIndependentTrips';
import { useDriverWallets } from '../../hooks/useDriverWallets';
import { useDriver } from '../../contexts/DriverContext';
import { CASH_SETTLEMENT_ENABLED } from '../../lib/cashSettlementFlags';

type EarningsPageProps = {
  onNavigate?: (page: string) => void;
};

function EarningsAmount({
  loading,
  amount,
  muted = false,
}: {
  loading: boolean;
  amount: string;
  muted?: boolean;
}) {
  if (loading) {
    return <Loader2 className="h-8 w-8 animate-spin text-slate-400" />;
  }
  return (
    <h3
      className={`text-3xl font-extrabold tracking-tight tabular-nums ${
        muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'
      }`}
    >
      {amount}
    </h3>
  );
}

function WalletChip({
  label,
  amount,
  loading,
  variant = 'default',
}: {
  label: string;
  amount: string;
  loading: boolean;
  variant?: 'default' | 'debt';
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${
        variant === 'debt'
          ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {loading ? (
        <Loader2 className="mt-1 h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <p
          className={`mt-1 text-sm font-bold tabular-nums ${
            variant === 'debt' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-white'
          }`}
        >
          {amount}
        </p>
      )}
    </div>
  );
}

export function IndependentEarningsPage({ onNavigate }: EarningsPageProps) {
  const { isFleetDriver } = useDriver();
  const { data: allData, loading: allLoading, error } = useIndependentEarnings('all');
  const { data: weekData, loading: weekLoading } = useIndependentEarnings('week');
  const { trips, loading: tripsLoading, loadAll } = useIndependentTrips();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);
  const { wallets, loading: walletsLoading } = useDriverWallets();

  const currency = allData?.currency ?? weekData?.currency ?? wallets?.currency ?? 'JMD';
  const totalMinor =
    allData?.total_minor ?? (allData?.cash_minor ?? 0) + (allData?.digital_minor ?? 0);
  const cashFareMinor = allData?.cash_minor ?? 0;
  const cardTripEarningsMinor = allData?.digital_minor ?? 0;
  const cashInHandFromTrips = useMemo(
    () => sumCashInHandFromTrips(trips.filter((trip) => trip.status === 'completed')),
    [trips],
  );
  const apiCashInHandMinor = allData?.cash_in_hand_minor ?? 0;
  const cashInHandMinor = Math.max(apiCashInHandMinor, cashInHandFromTrips);
  const weekTotalMinor =
    weekData?.total_minor ?? (weekData?.cash_minor ?? 0) + (weekData?.digital_minor ?? 0);
  const weekTrips = weekData?.trip_count ?? 0;

  const totalLabel = formatMoneyMinor(totalMinor, currency);
  const cashInHandLabel = formatMoneyMinor(cashInHandMinor, currency);
  const weekLabel = formatMoneyMinor(weekTotalMinor, currency);

  const digitalBal = wallets?.digital.balance_minor ?? 0;
  const debtOwed = wallets?.debt.arrears_minor ?? 0;
  const debtDisplay =
    debtOwed > 0 ? `-${formatMoneyMinorPlain(debtOwed)}` : formatMoneyMinorPlain(0);

  return (
    <div className="space-y-8 pb-4">
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error.includes('payment_method') && error.includes('does not exist')
            ? 'Database update required. Run apply_ride_payment_and_completion.sql in Supabase, then redeploy the rides edge function.'
            : error}
        </div>
      )}

      <section className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {isFleetDriver ? 'Roam trip earnings' : 'Total earnings'}
          </p>
          {allLoading && !allData ? (
            <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
          ) : (
            <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white tabular-nums">
              {totalLabel}
            </h2>
          )}
          {!isFleetDriver && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Trip revenue from all completed trips
            </p>
          )}
        </div>
        <div className="rounded-xl bg-emerald-500/10 p-2.5">
          <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </div>
      </section>

      {isFleetDriver && onNavigate && totalMinor === 0 && (
        <button
          type="button"
          onClick={() => onNavigate('fleet-settlement')}
          className="flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-left dark:border-blue-900/40 dark:bg-blue-950/30"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Open Fleet Settlement
            </p>
            <p className="text-xs text-slate-500">
              Weekly cash owed, Log Cash, and fuel for your fleet
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
        </button>
      )}

      {CASH_SETTLEMENT_ENABLED && (
        <section className="space-y-3">
          {!isFleetDriver && (
            <div className="flex items-center justify-between px-0.5">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Roam trip wallets</p>
                <p className="text-xs text-slate-500">Cash, digital change fund & debt</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <WalletChip
              label={isFleetDriver ? 'Roam cash' : 'Cash'}
              amount={formatMoneyMinorPlain(cashFareMinor)}
              loading={allLoading && !allData}
            />
            <WalletChip
              label="Digital"
              amount={formatMoneyMinorPlain(digitalBal)}
              loading={walletsLoading && !wallets}
            />
            <WalletChip
              label="Debt"
              amount={debtDisplay}
              loading={walletsLoading && !wallets}
              variant={debtOwed > 0 ? 'debt' : 'default'}
            />
          </div>
          {debtOwed > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              You owe {formatMoneyMinorPlain(debtOwed)} in rider change — card trip earnings and
              wallet top-ups credit your Digital wallet and auto-repay.
            </p>
          )}
        </section>
      )}

      <div className="space-y-4">
        <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:border-slate-700 dark:bg-slate-900">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-emerald-500/5 transition-transform duration-500 group-active:scale-110"
            aria-hidden
          />
          <div className="relative mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Banknote className="h-7 w-7" strokeWidth={1.75} aria-hidden />
            </div>
            {!isFleetDriver && (
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Cash in hand
              </p>
            )}
          </div>
          <div className="relative space-y-1">
            <EarningsAmount
              loading={(allLoading && !allData) || (cashInHandMinor === 0 && tripsLoading && trips.length === 0)}
              amount={cashInHandLabel}
            />
            {!isFleetDriver && (
              <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Physical cash you collected — amounts entered at settlement
              </p>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/40">
              <CreditCard className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Card trips</p>
              {allLoading && !allData ? (
                <Loader2 className="mt-1 h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {formatMoneyMinor(cardTripEarningsMinor, currency)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <section>
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Activity</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-100/80 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                <Calendar className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">This week</p>
                {weekLoading && !weekData ? (
                  <Loader2 className="mt-1 h-4 w-4 animate-spin text-slate-400" />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {weekTrips} {weekTrips === 1 ? 'trip' : 'trips'} completed
                  </p>
                )}
              </div>
            </div>
            {weekLoading && !weekData ? (
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            ) : (
              <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                +{weekLabel}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
