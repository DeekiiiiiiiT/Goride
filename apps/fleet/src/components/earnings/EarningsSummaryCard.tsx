import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../ui/utils';
import type { StatementSummary } from '../../types/statementSummary';
import { computePeriodBalances } from '../../utils/aggregateStatementSummaries';

export type EarningsPlatformTab = 'all' | 'Roam' | 'Uber' | 'InDrive';

const PLATFORM_TABS: { id: EarningsPlatformTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Roam', label: 'Roam' },
  { id: 'Uber', label: 'Uber' },
  { id: 'InDrive', label: 'InDrive' },
];

function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

type Props = {
  summary: StatementSummary | null;
  loading?: boolean;
  platformTab: EarningsPlatformTab;
  onPlatformTabChange: (tab: EarningsPlatformTab) => void;
};

export function EarningsSummaryCard({
  summary,
  loading,
  platformTab,
  onPlatformTabChange,
}: Props) {
  const [payoutOpen, setPayoutOpen] = useState(false);
  const { startBalance, endBalance } = computePeriodBalances(summary);

  const earnings = summary?.totalEarnings ?? 0;
  const refunds = summary?.totalRefundsExpenses ?? 0;
  const adjustments = summary?.periodAdjustments ?? 0;
  const payout = summary?.totalPayout ?? 0;
  const cash = summary?.cashCollected ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50">
        {PLATFORM_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onPlatformTabChange(tab.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              platformTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-5 dark:border-slate-800 dark:bg-slate-800/60">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">End balance</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {loading ? '—' : formatMoney(endBalance)}
          </p>
        </div>

        <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
          <Row label="Start balance" value={loading ? null : startBalance} />
          <Row label="Total earnings" value={loading ? null : earnings} />
          <Row label="Refunds & expenses" value={loading ? null : -Math.abs(refunds)} muted />
          <Row
            label="Adjustments from previous periods"
            value={loading ? null : adjustments}
            muted={adjustments === 0}
          />
          <div className="py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setPayoutOpen((o) => !o)}
            >
              <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                {payoutOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
                Payout
              </span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {loading ? '—' : formatMoney(-Math.abs(payout))}
              </span>
            </button>
            {payoutOpen && !loading && (
              <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Platform payout</span>
                  <span>{formatMoney(-Math.abs(payout))}</span>
                </div>
                {cash > 0.005 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Cash collected (info)</span>
                    <span>{formatMoney(cash)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/60">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">End balance</span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {loading ? '—' : formatMoney(endBalance)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: number | null;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span
        className={cn(
          'text-sm',
          muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200',
        )}
      >
        {label}
      </span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {value == null ? '—' : formatMoney(value)}
      </span>
    </div>
  );
}
