import React from 'react';
import { Banknote, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';

export function IndependentEarningsPage() {
  const { data, loading, error, refresh } = useIndependentEarnings('all');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Earnings</h1>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          aria-label="Refresh earnings"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error.includes('payment_method') && error.includes('does not exist')
            ? 'Database update required. Run supabase/scripts/apply_ride_payment_and_completion.sql in the Supabase SQL Editor, then redeploy the rides edge function.'
            : error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Banknote className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Total cash earnings</span>
          </div>
          {loading && !data ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : (
            <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoneyMinor(data?.cash_minor ?? 0, data?.currency ?? 'JMD')}
            </p>
          )}
          <p className="text-xs text-slate-500">All completed cash trips</p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 opacity-90">
          <div className="flex items-center gap-2 text-slate-400">
            <CreditCard className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Total digital earnings</span>
          </div>
          {loading && !data ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : (
            <p className="text-3xl font-bold tabular-nums text-slate-500 dark:text-slate-400">
              {formatMoneyMinor(data?.digital_minor ?? 0, data?.currency ?? 'JMD')}
            </p>
          )}
          <p className="text-xs text-slate-500">Card payments coming soon</p>
        </div>
      </div>
    </div>
  );
}
