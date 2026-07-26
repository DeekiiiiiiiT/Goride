import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { cn } from '@roam/ui';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';
import { api } from '../../services/api';
import type { FinancialTransaction } from '../../types/data';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

function formatUsd(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function categorizeExpense(tx: FinancialTransaction): 'fuel' | 'tolls' | 'maintenance' | 'other' {
  const cat = String(tx.category || '').toLowerCase();
  if (cat.includes('fuel') || cat.includes('gas')) return 'fuel';
  if (cat.includes('toll')) return 'tolls';
  if (cat.includes('maint') || cat.includes('repair') || cat.includes('service')) return 'maintenance';
  return 'other';
}

export function TaxCenter() {
  const year = new Date().getFullYear();
  const { data: earnings, loading: earningsLoading } = useIndependentEarnings('all');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setTxLoading(true);
      try {
        const txs = await api.getTransactions();
        if (!cancelled) setTransactions(Array.isArray(txs) ? txs : []);
      } catch (e) {
        console.error('[TaxCenter] Failed to load transactions', e);
        if (!cancelled) setTransactions([]);
      } finally {
        if (!cancelled) setTxLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const yearExpenses = useMemo(() => {
    const yearPrefix = String(year);
    return transactions.filter((tx) => {
      const type = String(tx.type || '').toLowerCase();
      const isExpense = type === 'expense' || Number(tx.amount) < 0;
      if (!isExpense) return false;
      const dateStr = String(tx.date || '');
      return dateStr.startsWith(yearPrefix);
    });
  }, [transactions, year]);

  const deductions = useMemo(() => {
    const buckets = { fuel: 0, tolls: 0, maintenance: 0, other: 0 };
    for (const tx of yearExpenses) {
      const amount = Math.abs(Number(tx.amount) || 0);
      buckets[categorizeExpense(tx)] += amount;
    }
    return buckets;
  }, [yearExpenses]);

  const totalDeductions = deductions.fuel + deductions.tolls + deductions.maintenance + deductions.other;
  // Earnings API has no calendar-year period — show lifetime Roam trip income as the available figure.
  const totalIncome = (earnings?.total_minor ?? 0) / 100;
  const loading = earningsLoading || txLoading;

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
            <p className="font-semibold text-slate-900 dark:text-white">{year} Tax Summary</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Loading…' : 'Records helper — not a tax filing'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Roam trip income</p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {loading ? '—' : formatUsd(totalIncome)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">All-time in Roam</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{year} expenses logged</p>
            <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {loading ? '—' : formatUsd(totalDeductions)}
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Expense categories ({year})
        </h2>
        <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
          <DeductionRow label="Fuel" amount={formatUsd(deductions.fuel)} />
          <DeductionRow label="Tolls" amount={formatUsd(deductions.tolls)} />
          <DeductionRow label="Maintenance" amount={formatUsd(deductions.maintenance)} />
          <DeductionRow label="Other" amount={formatUsd(deductions.other)} />
        </div>
      </section>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Not tax advice</p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
              These totals come from your Roam trip earnings and logged expenses. Consult a tax
              professional for filing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeductionRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
      <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{amount}</span>
    </div>
  );
}
