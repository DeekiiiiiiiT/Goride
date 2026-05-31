import React from 'react';
import { ArrowLeftRight, CreditCard, Loader2, Star } from 'lucide-react';
import { cn } from '@roam/ui';
import type { DriverEarningsSummary } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

type Props = {
  data: DriverEarningsSummary | null;
  loading: boolean;
  rating?: number | null;
};

function StatIconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
      {children}
    </div>
  );
}

/** Amount only — no currency code prefix (e.g. drop leading "JMD "). */
function formatStatAmount(minor: number, currency: string): string {
  return formatMoneyMinor(minor, currency).replace(/^[A-Z]{3}\s+/i, '').trim();
}

function amountSizeClass(amount: string): string {
  const len = amount.replace(/\s/g, '').length;
  if (len > 11) return 'text-[11px] leading-tight';
  if (len > 9) return 'text-xs leading-tight';
  if (len > 7) return 'text-sm';
  return 'text-xl';
}

export function DriverHomeQuickStats({ data, loading, rating }: Props) {
  const hasRating = rating != null && Number.isFinite(rating);

  const earningsAmount =
    data != null ? formatStatAmount(data.cash_minor, data.currency) : loading ? null : formatStatAmount(0, 'JMD');

  return (
    <div className="grid min-w-0 grid-cols-3 gap-1">
      <div className="flex min-w-0 flex-col items-center border-r border-slate-200 px-1 dark:border-slate-700">
        <StatIconBox>
          <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </StatIconBox>
        <div className="mb-1 flex min-h-7 w-full max-w-full items-center justify-center">
          {loading && !data ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <p
              className={cn(
                'w-full max-w-full text-center font-bold tabular-nums text-slate-900 dark:text-white',
                earningsAmount && amountSizeClass(earningsAmount),
              )}
            >
              {earningsAmount}
            </p>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Earnings</p>
      </div>

      <div className="flex min-w-0 flex-col items-center border-r border-slate-200 px-1 dark:border-slate-700">
        <StatIconBox>
          <ArrowLeftRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </StatIconBox>
        <div className="mb-1 flex min-h-7 w-full items-center justify-center">
          {loading && !data ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{data?.trip_count ?? 0}</p>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Trips</p>
      </div>

      <div className="flex min-w-0 flex-col items-center px-1">
        <div className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/15">
          <Star className="h-7 w-7 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
        </div>
        <div className="mb-1 flex min-h-7 w-full items-center justify-center">
          {hasRating && (
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{rating.toFixed(2)}</p>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Rating</p>
      </div>
    </div>
  );
}
