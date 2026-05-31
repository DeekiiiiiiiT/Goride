import React from 'react';
import { Car, ChevronRight, DollarSign, Fuel, Plus, Receipt, Wrench } from 'lucide-react';
import { cn } from '@roam/ui';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function IndependentExpenses() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Expenses</h1>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </button>
      </div>

      <div
        className={cn(
          cardClass,
          'border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 dark:from-violet-950/40 dark:to-fuchsia-950/30',
        )}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">This month&apos;s expenses</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">$0.00</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">0 expenses recorded</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ExpenseCategory icon={<Fuel className="h-5 w-5" />} label="Gas" amount="$0.00" tone="amber" />
        <ExpenseCategory icon={<Car className="h-5 w-5" />} label="Car Wash" amount="$0.00" tone="blue" />
        <ExpenseCategory icon={<Wrench className="h-5 w-5" />} label="Maintenance" amount="$0.00" tone="emerald" />
        <ExpenseCategory icon={<DollarSign className="h-5 w-5" />} label="Other" amount="$0.00" tone="violet" />
      </div>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Recent Expenses
        </h2>
        <div className={cn(cardClass, 'p-8 text-center')}>
          <Receipt className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-600 dark:text-slate-400">No expenses recorded yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            Track your driving expenses for tax deductions
          </p>
        </div>
      </section>

      <button
        type="button"
        className={cn(
          cardClass,
          'flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80',
        )}
      >
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">Export for Taxes</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Download expense report</p>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </button>
    </div>
  );
}

function ExpenseCategory({
  icon,
  label,
  amount,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  amount: string;
  tone: 'amber' | 'blue' | 'emerald' | 'violet';
}) {
  const tones = {
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400',
  };

  return (
    <div className={cn(cardClass, 'p-4')}>
      <div className={cn('mb-2 flex h-10 w-10 items-center justify-center rounded-lg', tones[tone])}>
        {icon}
      </div>
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{amount}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
