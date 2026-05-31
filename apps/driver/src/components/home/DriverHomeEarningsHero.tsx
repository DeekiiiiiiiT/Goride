import React, { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@roam/ui';
import type { DriverEarningsPeriod } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';

type HomePeriod = Extract<DriverEarningsPeriod, 'today' | 'week'>;

export function DriverHomeEarningsHero() {
  const [period, setPeriod] = useState<HomePeriod>('week');
  const { data, loading, error, refresh } = useIndependentEarnings(period);

  const displayAmount = data
    ? formatMoneyMinor(data.cash_minor, data.currency).replace(/^JMD\s*/, '')
    : null;

  return (
    <section className="relative overflow-hidden py-8 driver-map-pattern">
      <div
        className="pointer-events-none absolute top-1/2 left-0 w-full -rotate-12 border-t-2 border-dashed border-emerald-500/20 opacity-40"
        aria-hidden
      />
      <div className="pointer-events-none absolute top-1/2 right-1/4 h-3 w-3 rounded-full bg-emerald-500/30 opacity-50" aria-hidden />

      <div className="relative z-10 flex flex-col items-center px-4 text-center">
        <div className="mb-8 flex w-64 rounded-full bg-slate-200/80 p-1 dark:bg-slate-800/80">
          {(['today', 'week'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
                period === p
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {p === 'today' ? 'Today' : 'Work week'}
            </button>
          ))}
        </div>

        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500/80 dark:text-slate-400/80">
          Trip earnings
        </p>
        <p className="mb-4 min-h-[20px] text-sm text-slate-400/70 dark:text-slate-500">
          {period === 'week' ? 'Mon 4:00 AM – Mon 4:00 AM (Jamaica)' : 'Today (Jamaica)'}
        </p>

        {loading && !data ? (
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600 dark:text-emerald-400" />
        ) : error ? (
          <div className="space-y-2">
            <p className="max-w-xs text-sm text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        ) : (
          <h2 className="text-5xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {displayAmount ?? '0.00'}
          </h2>
        )}

        {data?.currency && !error && (
          <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">{data.currency}</p>
        )}
      </div>
    </section>
  );
}
