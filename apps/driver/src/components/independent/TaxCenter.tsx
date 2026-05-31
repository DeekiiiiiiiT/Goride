import React from 'react';
import { AlertCircle, Calendar, Download, FileText, TrendingUp } from 'lucide-react';
import { cn } from '@roam/ui';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function TaxCenter() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tax Center</h1>

      <div
        className={cn(
          cardClass,
          'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 dark:from-indigo-950/40 dark:to-violet-950/30 dark:border-indigo-900',
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
            <FileText className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">2026 Tax Summary</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Year to date</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Total Income</p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">$0.00</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Total Deductions</p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">$0.00</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn(cardClass, 'p-4')}>
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Est. Tax Liability</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">$0.00</p>
        </div>
        <div className={cn(cardClass, 'p-4')}>
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            <span>Quarters Filed</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">0/4</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Deduction Categories
        </h2>
        <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
          <DeductionRow label="Mileage Deduction" amount="$0.00" rate="$0.67/mi" />
          <DeductionRow label="Gas Expenses" amount="$0.00" />
          <DeductionRow label="Car Wash" amount="$0.00" />
          <DeductionRow label="Phone/Data" amount="$0.00" />
          <DeductionRow label="Tolls" amount="$0.00" />
          <DeductionRow label="Maintenance" amount="$0.00" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Tax Documents
        </h2>
        <div className="space-y-3">
          <button
            type="button"
            className={cn(
              cardClass,
              'flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80',
            )}
          >
            <Download className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Export Annual Summary</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">PDF report for tax filing</p>
            </div>
          </button>
          <button
            type="button"
            className={cn(
              cardClass,
              'flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80',
            )}
          >
            <Download className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Export Expense Report</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">CSV for your accountant</p>
            </div>
          </button>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Tax Reminder</p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
              Consult a tax professional for personalized advice. This is for tracking purposes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeductionRow({ label, amount, rate }: { label: string; amount: string; rate?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {rate && <p className="text-xs text-slate-500 dark:text-slate-400">{rate}</p>}
      </div>
      <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{amount}</span>
    </div>
  );
}
