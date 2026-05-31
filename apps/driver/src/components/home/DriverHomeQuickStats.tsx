import React from 'react';
import { ArrowLeftRight, CreditCard, Loader2, Star } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';

type Props = {
  rating?: number | null;
};

function StatIconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
      {children}
    </div>
  );
}

export function DriverHomeQuickStats({ rating }: Props) {
  const { data, loading } = useIndependentEarnings('today');
  const hasRating = rating != null && Number.isFinite(rating);

  const earningsLabel = data
    ? formatMoneyMinor(data.cash_minor, data.currency)
    : loading
      ? null
      : formatMoneyMinor(0, 'JMD');

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="flex flex-col items-center border-r border-slate-200 dark:border-slate-700">
        <StatIconBox>
          <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </StatIconBox>
        {loading && !data ? (
          <Loader2 className="mb-1 h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <p className="mb-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {earningsLabel}
          </p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Earnings</p>
      </div>

      <div className="flex flex-col items-center border-r border-slate-200 dark:border-slate-700">
        <StatIconBox>
          <ArrowLeftRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </StatIconBox>
        {loading && !data ? (
          <Loader2 className="mb-1 h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <p className="mb-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {data?.trip_count ?? 0}
          </p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Trips</p>
      </div>

      <div className="flex flex-col items-center">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/15">
          <Star className="h-7 w-7 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
        </div>
        <div className="mb-1 flex min-h-7 items-center justify-center">
          {hasRating && (
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {rating.toFixed(2)}
            </p>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Rating</p>
      </div>
    </div>
  );
}
