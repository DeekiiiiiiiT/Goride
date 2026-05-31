import React, { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@roam/ui';
import type { DriverEarningsPeriod } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';

type HomePeriod = Extract<DriverEarningsPeriod, 'today' | 'week'>;

export function IndependentHomeEarnings() {
  const [period, setPeriod] = useState<HomePeriod>('week');
  const { data, loading, error, refresh } = useIndependentEarnings(period);

  return (
    <section className="shrink-0 flex flex-col items-center text-center py-6 px-4">
      <div className="inline-flex rounded-full border border-slate-200 dark:border-slate-700 p-0.5 mb-5">
        {(['today', 'week'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors',
              period === p
                ? 'bg-emerald-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
            )}
          >
            {p === 'today' ? 'Today' : 'Work week'}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
        Trip earnings
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2 min-h-[14px] max-w-[260px]">
        {period === 'week' ? 'Mon 4:00 AM – Mon 4:00 AM (Jamaica)' : '\u00A0'}
      </p>

      {loading && !data ? (
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-500 max-w-xs">
            {error.includes('payment_method') && error.includes('does not exist')
              ? 'Database update required. Ask your admin to run apply_ride_payment_and_completion.sql in Supabase.'
              : error}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      ) : (
        <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
          {formatMoneyMinor(data?.cash_minor ?? 0, data?.currency ?? 'JMD')}
        </p>
      )}
    </section>
  );
}
